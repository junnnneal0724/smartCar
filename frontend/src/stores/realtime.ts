import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { subscribeRealtime, type RealtimeMessage } from '@/api';
import type {
  BehaviorView,
  NoticePayload,
  RideProgressPayload,
  RideStatusPayload,
  VehiclePositionPayload,
} from '@/api/types';

/** 一辆车在客户端的时间轴：在 from → to 之间插值，避免 2Hz 的位置更新看起来在"跳" */
interface Track {
  vehicleId: string;
  fromLng: number;
  fromLat: number;
  fromHeading: number;
  toLng: number;
  toLat: number;
  toHeading: number;
  speedKph: number;
  status: string;
  roadName: string;
  receivedAt: number;
  /** 预期多久后到达 to：服务端 500ms 一个仿真步，留一点缓冲 */
  expectedMs: number;
  /** 平滑后的当前渲染位置 */
  curLng: number;
  curLat: number;
  curHeading: number;
  updatedAt: number;
}

/** 服务端仿真步长 500ms，客户端按 620ms 追赶，略微"落后一点"比超前更稳 */
const EXPECTED_MS = 620;

export const useRealtimeStore = defineStore('realtime', () => {
  const connected = ref(false);
  const tracks = shallowRef(new Map<string, Track>());
  const lastMessageAt = ref(0);

  /** 最近一次行程进度（比轮询更及时） */
  const progress = ref<RideProgressPayload | null>(null);
  /** 最近一次车辆行为（决策可视化） */
  const behavior = ref<(BehaviorView & { at: number }) | null>(null);
  /** 行程状态变化（页面据此切换） */
  const statusChange = ref<(RideStatusPayload & { at: number }) | null>(null);
  /** 需要提示给乘客的通知 */
  const notices = ref<(NoticePayload & { at: number; id: number })[]>([]);
  let noticeId = 0;

  let dispose: (() => void) | null = null;

  function handle(msg: RealtimeMessage): void {
    lastMessageAt.value = Date.now();
    switch (msg.topic) {
      case 'vehicle.position':
        onPosition(msg.data as VehiclePositionPayload);
        break;
      case 'ride.progress':
        progress.value = msg.data as RideProgressPayload;
        break;
      case 'ride.behavior':
        behavior.value = { ...(msg.data as BehaviorView), at: msg.ts };
        break;
      case 'ride.status_changed':
        statusChange.value = { ...(msg.data as RideStatusPayload), at: msg.ts };
        break;
      case 'notify.notice': {
        const n = msg.data as NoticePayload;
        notices.value = [...notices.value, { ...n, at: msg.ts, id: ++noticeId }].slice(-4);
        break;
      }
      case 'connection':
        connected.value = false;
        break;
      case 'heartbeat':
      case 'ping':
        connected.value = true;
        break;
      default:
        break;
    }
  }

  function onPosition(p: VehiclePositionPayload): void {
    const map = tracks.value;
    const prev = map.get(p.vehicleId);
    const next: Track = prev
      ? {
          ...prev,
          fromLng: prev.curLng,
          fromLat: prev.curLat,
          fromHeading: prev.curHeading,
          toLng: p.lng,
          toLat: p.lat,
          toHeading: p.heading,
          speedKph: p.speedKph,
          status: p.status,
          roadName: p.roadName,
          receivedAt: performance.now(),
          expectedMs: EXPECTED_MS,
          updatedAt: Date.now(),
        }
      : {
          vehicleId: p.vehicleId,
          fromLng: p.lng,
          fromLat: p.lat,
          fromHeading: p.heading,
          toLng: p.lng,
          toLat: p.lat,
          toHeading: p.heading,
          speedKph: p.speedKph,
          status: p.status,
          roadName: p.roadName,
          receivedAt: performance.now(),
          expectedMs: EXPECTED_MS,
          curLng: p.lng,
          curLat: p.lat,
          curHeading: p.heading,
          updatedAt: Date.now(),
        };
    map.set(p.vehicleId, next);
    tracks.value = map;
  }

  function connect(topics: string[]): void {
    disconnect();
    dispose = subscribeRealtime(topics, handle);
    connected.value = true;
  }

  function disconnect(): void {
    dispose?.();
    dispose = null;
    connected.value = false;
  }

  function dismissNotice(id: number): void {
    notices.value = notices.value.filter((n) => n.id !== id);
  }

  function trackOf(vehicleId: string): Track | undefined {
    return tracks.value.get(vehicleId);
  }

  /**
   * 取某辆车在当前时刻的渲染位置。
   * 在两个位置包之间线性插值、航向按最短角插值，这样 2Hz 的推送看起来是连续的。
   */
  function sample(
    vehicleId: string,
    now = performance.now(),
  ): { lng: number; lat: number; heading: number; speedKph: number; roadName: string; status: string } | null {
    const t = tracks.value.get(vehicleId);
    if (!t) return null;
    const raw = (now - t.receivedAt) / t.expectedMs;
    const k = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
    // easeOutQuad：起步快、收尾慢，比线性更接近真实车辆的运动观感
    const e = 1 - (1 - k) * (1 - k);
    const lng = t.fromLng + (t.toLng - t.fromLng) * e;
    const lat = t.fromLat + (t.toLat - t.fromLat) * e;
    let dh = ((t.toHeading - t.fromHeading + 540) % 360) - 180;
    if (Object.is(dh, -180)) dh = 180;
    const heading = (t.fromHeading + dh * e + 360) % 360;

    t.curLng = lng;
    t.curLat = lat;
    t.curHeading = heading;

    return { lng, lat, heading, speedKph: t.speedKph, roadName: t.roadName, status: t.status };
  }

  /** 所有已知车辆（含本车），供地图逐帧绘制 */
  function sampleAll(now = performance.now()) {
    const out: { id: string; lng: number; lat: number; heading: number; speedKph: number }[] = [];
    for (const id of tracks.value.keys()) {
      const s = sample(id, now);
      if (s) out.push({ id, lng: s.lng, lat: s.lat, heading: s.heading, speedKph: s.speedKph });
    }
    return out;
  }

  return {
    connected,
    tracks,
    progress,
    behavior,
    statusChange,
    notices,
    lastMessageAt,
    connect,
    disconnect,
    trackOf,
    sample,
    sampleAll,
    dismissNotice,
  };
});
