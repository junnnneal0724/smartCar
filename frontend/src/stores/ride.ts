import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { rideApi } from '@/api';
import type { ExplainView, RideCurrentView, RideEventView, RideView, StopRequestView, SummaryView, VehicleView } from '@/api/types';
import { useRealtimeStore } from './realtime';
import { useSessionStore } from './session';

/**
 * 行程状态中心。
 *
 * 设计要点：**服务端是唯一事实来源**。
 * 实时推送只用来"让数字动起来"，任何一次用户操作后都会重新拉一次 current，
 * 避免前端自己拼状态机导致和后端不一致。
 */
export const useRideStore = defineStore('ride', () => {
  const session = useSessionStore();
  const realtime = useRealtimeStore();

  const view = ref<RideView | null>(null);
  const vehicle = ref<VehicleView | null>(null);
  const behavior = ref<RideCurrentView['behavior']>(null);
  const events = ref<RideEventView[]>([]);
  const stops = ref<StopRequestView[]>([]);
  const loading = ref(false);
  const lastError = ref('');

  /** 本地倒计时：每秒自减，收到服务端数据就重新对齐（避免数字长时间不动） */
  const localRemainS = ref(0);
  const localTraveledM = ref(0);
  let tickTimer: number | null = null;

  const status = computed(() => view.value?.status ?? 'COMPLETED');
  const isOngoing = computed(() => ['ONGOING', 'ARRIVING'].includes(status.value));
  const remainTimeS = computed(() => (isOngoing.value ? Math.max(0, localRemainS.value) : (view.value?.remainTimeS ?? 0)));
  const traveledM = computed(() => localTraveledM.value || view.value?.traveledM || 0);
  const remainDistanceM = computed(() => Math.max(0, (view.value?.planDistanceM ?? 0) - traveledM.value));
  const progress = computed(() => {
    const plan = view.value?.planDistanceM ?? 0;
    return plan > 0 ? Math.min(1, traveledM.value / plan) : 0;
  });

  function syncCountdown(): void {
    if (view.value) {
      localRemainS.value = view.value.remainTimeS;
      localTraveledM.value = view.value.traveledM;
    }
  }

  function startCountdown(): void {
    stopCountdown();
    tickTimer = window.setInterval(() => {
      if (!isOngoing.value) return;
      // 本地按秒回退，模拟"时间在走"；服务端推送到达后会被覆盖
      if (localRemainS.value > 0) localRemainS.value -= 1;
      const rp = realtime.progress;
      if (rp && rp.rideId === view.value?.id) {
        localTraveledM.value = rp.traveledM;
        localRemainS.value = rp.remainTimeS;
      }
      if (realtime.behavior) behavior.value = realtime.behavior;
    }, 1000);
  }

  function stopCountdown(): void {
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  async function fetchCurrent(): Promise<void> {
    const r = await rideApi.current();
    view.value = r.ride;
    if (r.vehicle) vehicle.value = r.vehicle;
    behavior.value = r.behavior ?? null;
    syncCountdown();
    if (r.ride) session.ride = r.ride;
  }

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      await fetchCurrent();
      lastError.value = '';
    } catch (e) {
      if (!session.handleAuthError(e)) lastError.value = e instanceof Error ? e.message : '加载失败';
    } finally {
      loading.value = false;
    }
  }

  async function fetchEvents(limit = 30): Promise<void> {
    try {
      events.value = await rideApi.events(limit);
    } catch {
      /* 事件流是增强信息，失败不打断主流程 */
    }
  }

  async function start(): Promise<void> {
    await rideApi.start();
    await refresh();
    await session.bootstrap();
    startCountdown();
  }

  async function changeDestination(body: { poiId?: string; name?: string; lng?: number; lat?: number; category?: string }): Promise<void> {
    await rideApi.changeDestination(body);
    await refresh();
    await session.bootstrap();
  }

  async function requestStop(body: { kind: 'NORMAL' | 'EMERGENCY'; poiId?: string; name?: string; lng?: number; lat?: number; note?: string }) {
    const r = await rideApi.stop(body);
    stops.value = await rideApi.stops().catch(() => stops.value);
    await fetchEvents(10);
    return r;
  }

  async function cancelStop(id: number): Promise<void> {
    await rideApi.cancelStop(id);
    stops.value = await rideApi.stops().catch(() => []);
  }

  async function openDoor() {
    return rideApi.openDoor();
  }

  async function complete(): Promise<void> {
    await rideApi.complete();
    stopCountdown();
    await refresh();
    await session.bootstrap();
  }

  async function rate(score: number, tags: string[]): Promise<void> {
    await rideApi.rate(score, tags);
  }

  async function summary(): Promise<SummaryView> {
    return rideApi.summary();
  }

  async function explain(): Promise<ExplainView> {
    return rideApi.explain();
  }

  return {
    view,
    vehicle,
    behavior,
    events,
    stops,
    loading,
    lastError,
    status,
    isOngoing,
    remainTimeS,
    traveledM,
    remainDistanceM,
    progress,
    refresh,
    fetchCurrent,
    fetchEvents,
    start,
    changeDestination,
    requestStop,
    cancelStop,
    openDoor,
    complete,
    rate,
    summary,
    explain,
    startCountdown,
    stopCountdown,
    syncCountdown,
  };
});
