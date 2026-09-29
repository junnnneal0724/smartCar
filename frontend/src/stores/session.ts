import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { sessionApi, getAuthToken, setAuthToken, ApiError } from '@/api';
import type { BootstrapView, RideView, ScreenState } from '@/api/types';

/** 屏幕状态 → 路由。后端只给"该显示哪一屏"，映射关系放在前端。 */
export const STATE_ROUTE: Record<ScreenState, string> = {
  IDLE: '/idle',
  WAITING: '/waiting',
  WELCOME: '/welcome',
  READY: '/ready',
  TRIP: '/trip',
  ARRIVING: '/arriving',
  ARRIVED: '/alight',
  SUMMARY: '/summary',
};

export const useSessionStore = defineStore('session', () => {
  const state = ref<ScreenState>('IDLE');
  const vehicle = ref<BootstrapView['vehicle'] | null>(null);
  const ride = ref<RideView | null>(null);
  const behavior = ref<BootstrapView['behavior']>(null);
  const phases = ref<string[]>([]);
  const needVerify = ref(false);
  const message = ref('');
  const verified = ref(!!getAuthToken());
  const ready = ref(false);
  const lastError = ref('');

  const targetRoute = computed(() => STATE_ROUTE[state.value] ?? '/idle');

  async function bootstrap(): Promise<BootstrapView | null> {
    try {
      const b = await sessionApi.bootstrap();
      apply(b);
      ready.value = true;
      lastError.value = '';
      return b;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : '车机启动失败';
      ready.value = true;
      return null;
    }
  }

  function apply(b: BootstrapView): void {
    state.value = b.state;
    vehicle.value = b.vehicle;
    ride.value = b.ride;
    behavior.value = b.behavior ?? null;
    if (b.phases) phases.value = b.phases;
    needVerify.value = b.needVerify;
    message.value = b.message ?? '';
    // 后端说还要校验，说明之前的会话已经失效了
    if (b.needVerify) {
      verified.value = false;
      setAuthToken('');
    }
  }

  async function verify(code: string): Promise<RideView> {
    const r = await sessionApi.verify(code);
    setAuthToken(r.token);
    verified.value = true;
    needVerify.value = false;
    await bootstrap();
    return r.ride;
  }

  async function endSession(): Promise<void> {
    try {
      await sessionApi.end();
    } catch {
      /* 会话可能已经随行程结束而失效，忽略 */
    }
    setAuthToken('');
    verified.value = false;
  }

  function handleAuthError(e: unknown): boolean {
    if (e instanceof ApiError && e.code === 40100) {
      verified.value = false;
      setAuthToken('');
      return true;
    }
    return false;
  }

  return {
    state,
    vehicle,
    ride,
    behavior,
    phases,
    needVerify,
    message,
    verified,
    ready,
    lastError,
    targetRoute,
    bootstrap,
    verify,
    endSession,
    handleAuthError,
  };
});
