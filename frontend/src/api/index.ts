/** 各域接口（一个函数 = 车机上的一次交互） */
import { http } from './http';
import type {
  AssistView,
  BootstrapView,
  CabinSetting,
  CabinView,
  ExplainView,
  HelpTopic,
  OpsOverview,
  PrivacyView,
  RideCurrentView,
  RideEventView,
  RideView,
  StopRequestView,
  SummaryView,
  VehicleView,
} from './types';

/* ------------------------------------------------------------ 会话 */
export const sessionApi = {
  /** 车机启动：告诉前端现在该显示哪一屏 */
  bootstrap: () => http.get<BootstrapView>('/session/bootstrap'),
  /** 上车校验（手机号后 4 位）→ 换取本段行程的 token */
  verify: (code: string) => http.post<{ token: string; ride: RideView; state: string }>('/session/verify', { code }),
  current: () => http.get<{ valid: boolean; rideId: number; verifiedAt: number }>('/session/current'),
  end: () => http.post<{ ok: boolean }>('/session/end'),
};

/* ------------------------------------------------------------ 行程 */
export const rideApi = {
  current: () => http.get<RideCurrentView>('/ride/current'),
  events: (limit = 30) => http.get<RideEventView[]>(`/ride/events?limit=${limit}`),
  route: () => http.get<{ seq: number; lng: number; lat: number; speed: number; ts: number }[]>('/ride/route'),
  start: () => http.post<RideCurrentView>('/ride/start'),
  changeDestination: (body: { poiId?: string; name?: string; lng?: number; lat?: number; category?: string }) =>
    http.post<RideCurrentView>('/ride/destination', body),
  stop: (body: { kind: 'NORMAL' | 'EMERGENCY'; poiId?: string; name?: string; lng?: number; lat?: number; note?: string }) =>
    http.post<{ id: number; kind: string; status: string }>('/ride/stop', body),
  cancelStop: (id: number) => http.post<{ ok: boolean }>(`/ride/stop/${id}/cancel`),
  stops: () => http.get<StopRequestView[]>('/ride/stops'),
  openDoor: () => http.post<{ ok: boolean; openedAt: number }>('/ride/open-door'),
  complete: () => http.post<RideCurrentView>('/ride/complete'),
  rate: (score: number, tags: string[]) => http.post<{ ok: boolean }>('/ride/rate', { score, tags }),
  summary: () => http.get<SummaryView>('/ride/summary'),
  explain: () => http.get<ExplainView>('/ride/explain'),
};

/* ------------------------------------------------------------ 车辆 */
export const vehicleApi = {
  current: () => http.get<VehicleView>('/vehicle/current'),
  models: () => http.get<{ code: string; name: string; tagline: string; seats: number; features: string[] }[]>('/vehicle/models'),
};

/* ------------------------------------------------------------ 座舱 */
export const cabinApi = {
  get: () => http.get<CabinView>('/cabin'),
  update: (patch: Partial<CabinSetting>) => http.patch<CabinView>('/cabin', patch),
  scene: (key: string) => http.post<CabinView>('/cabin/scene', { key }),
  commands: () => http.get<Record<string, unknown>[]>('/cabin/commands'),
};

/* ------------------------------------------------------------ 帮助 */
export const helpApi = {
  topics: () => http.get<{ topics: HelpTopic[] }>('/help/topics'),
  privacy: () => http.get<PrivacyView>('/help/privacy'),
  callAssist: (topic = '') => http.post<AssistView>('/help/assist', { topic }),
  currentAssist: () => http.get<AssistView | null>('/help/assist'),
  sendMessage: (id: number, content: string) => http.post<{ ok: boolean }>(`/help/assist/${id}/message`, { content }),
  endAssist: (id: number) => http.post<{ ok: boolean }>(`/help/assist/${id}/end`),
  sync: () => http.post<{ token: string; url: string; rideNo: string; expireAt: number }>('/help/sync'),
};

/* ------------------------------------------------------------ 演示控制台 */
export const opsApi = {
  overview: () => http.get<OpsOverview>('/ops/overview'),
  setSim: (body: { multiplier?: number; paused?: boolean }) => http.post<OpsOverview['sim']>('/ops/sim', body),
  restart: () => http.post<{ ok: boolean; rideId: number }>('/ops/ride/restart'),
  jumpArriving: () => http.post<{ ok: boolean }>('/ops/ride/jump-arriving'),
  behavior: (type?: string) => http.post<{ ok: boolean; type?: string }>('/ops/ride/behavior', { type }),
  table: (name: string, limit = 30) => http.get<{ name: string; rows: Record<string, unknown>[] }>(`/ops/table/${name}?limit=${limit}`),
};

export * from './types';
export { ApiError, NetworkError, setAuthToken, getAuthToken, subscribeRealtime } from './http';
export type { RealtimeMessage } from './http';
