/** 与后端接口对齐的类型定义（后端改动时这里要同步） */

export type RideStatusValue =
  | 'PENDING'
  | 'ABOARD'
  | 'READY'
  | 'ONGOING'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED';

/** 车机屏幕该显示哪一屏（由后端判定，前端不自己推断状态机） */
export type ScreenState =
  | 'IDLE'
  | 'WAITING'
  | 'WELCOME'
  | 'READY'
  | 'TRIP'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'SUMMARY';

export interface LngLat {
  lng: number;
  lat: number;
}

export interface FareBreakdown {
  base: number;
  distance: number;
  time: number;
  discount: number;
  total: number;
}

export interface RideView {
  id: number;
  rideNo: string;
  status: RideStatusValue;
  statusLabel: string;
  phase: number;
  origin: LngLat & { name: string };
  dest: LngLat & { name: string; category: string };
  passengers: number;
  modelCode: string;
  planDistanceM: number;
  planDurationS: number;
  traveledM: number;
  remainDistanceM: number;
  remainTimeS: number;
  progress: number;
  fare: FareBreakdown;
  co2SavedG: number;
  ratingScore: number | null;
  createdAt: number;
  startedAt: number | null;
  arrivingAt: number | null;
  arrivedAt: number | null;
  endedAt: number | null;
  verifyHint: string;
}

export interface VehicleView {
  id: string;
  plateNo: string;
  cabinNo: string;
  modelCode: string;
  modelName?: string;
  battery: number;
  status?: string;
  speedKph: number;
  roadName: string;
  odometerKm: number;
  cameraOn: boolean;
  micOn: boolean;
  lng: number;
  lat: number;
  heading: number;
}

export interface BehaviorView {
  type: string;
  short: string;
  title: string;
  detail: string;
  icon: string;
  slowsDown: boolean;
  at?: number;
  endsAt?: number;
}

export interface BootstrapView {
  vehicle: Pick<VehicleView, 'id' | 'plateNo' | 'cabinNo' | 'modelCode' | 'battery' | 'cameraOn' | 'micOn'>;
  ride: RideView | null;
  phases?: string[];
  behavior?: BehaviorView | null;
  needVerify: boolean;
  state: ScreenState;
  message: string;
}

export interface RideCurrentView {
  ride: RideView | null;
  vehicle?: VehicleView;
  phases: string[];
  behavior?: BehaviorView | null;
}

export interface RideEventView {
  id: number;
  kind: 'STATUS' | 'BEHAVIOR' | 'CABIN' | 'SAFETY' | 'SYSTEM';
  type: string;
  title: string;
  detail: string;
  icon: string;
  created_at: number;
}

export type AmbientLight = 'off' | 'warm' | 'neutral' | 'cool';

export interface CabinSetting {
  tempLeft: number;
  tempRight: number;
  fanLevel: number;
  seatHeat: number;
  seatVent: number;
  ambientLight: AmbientLight;
  brightness: number;
  volume: number;
  curtain: number;
  scene: string;
}

export interface ScenePreset {
  key: string;
  name: string;
  desc: string;
  icon: string;
}

export interface CabinView {
  setting: CabinSetting;
  scenes: ScenePreset[];
  ranges: {
    temp: { min: number; max: number; step: number };
    fan: { min: number; max: number };
    seat: { min: number; max: number };
    brightness: { min: number; max: number };
    volume: { min: number; max: number };
  };
  ambientOptions: { key: AmbientLight; name: string; color: string }[];
  updatedAt: number;
}

export interface HelpTopic {
  key: string;
  icon: string;
  title: string;
  detail: string;
}

export interface AssistMessage {
  id: number;
  role: 'USER' | 'AGENT' | 'SYSTEM';
  content: string;
  created_at: number;
}

export interface AssistView {
  session: {
    id: number;
    agentName: string;
    agentAvatar: string;
    topic: string;
    status: string;
    createdAt: number;
  };
  messages: AssistMessage[];
  quickReplies: string[];
}

export interface PrivacyView {
  camera: { on: boolean; purpose: string; retention: string };
  microphone: { on: boolean; purpose: string; retention: string };
  location: { purpose: string; retention: string };
  session: { cleared: boolean; note: string };
}

export interface StopRequestView {
  id: number;
  ride_id: number;
  kind: 'NORMAL' | 'EMERGENCY';
  target_name: string;
  note: string;
  status: 'PENDING' | 'ACCEPTED' | 'DONE' | 'CANCELLED';
  created_at: number;
}

export interface SummaryView {
  ride: RideView;
  fare: FareBreakdown & { paidChannel: string };
  stats: {
    distanceM: number;
    durationS: number;
    avgSpeedKph: number;
    maxSpeedKph: number;
    co2SavedG: number;
    points: number;
  };
  speedCurve: { t: number; v: number }[];
  route: { seq: number; lng: number; lat: number; speed: number; ts: number }[];
  rating: { score: number; tags: string } | null;
}

export interface ExplainView {
  rideId: number;
  durationS: number;
  segments: { type: string; label: string; detail: string; count: number; ratio: number }[];
  slowedRatio: number;
  conclusion: string;
  timeline: RideEventView[];
}

export interface PoiView {
  id: string;
  name: string;
  category: string;
  nodeId?: string;
  lng: number;
  lat: number;
}

/* ----------------------------------------------------- 地图数据（assets/map.json） */

export interface MapNode {
  id: string;
  lng: number;
  lat: number;
}

export interface MapEdge {
  id: string;
  a: string;
  b: string;
  road: string;
  level: number;
  oneway: boolean;
  speedKph: number;
  lanes: number;
  lengthM: number;
}

export interface MapArea {
  id: string;
  name: string;
  kind: 'water' | 'park' | 'block';
  /** 顶点数组，元素是 [经度, 纬度]。字段名与后端 MapService 及 assets/map.json 保持一致 */
  polygon: [number, number][];
}

export interface MapData {
  meta: {
    name: string;
    center: LngLat;
    bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number };
    note: string;
  };
  nodes: MapNode[];
  edges: MapEdge[];
  areas: MapArea[];
  pois: PoiView[];
}

/* ----------------------------------------------------- 实时事件负载 */

export interface VehiclePositionPayload {
  vehicleId: string;
  lng: number;
  lat: number;
  heading: number;
  speedKph: number;
  status: string;
  roadName: string;
  rideId?: number | null;
}

export interface RideProgressPayload {
  rideId: number;
  traveledM: number;
  remainDistanceM: number;
  remainTimeS: number;
  progress: number;
  speedKph: number;
  currentFare: number;
}

export interface RideStatusPayload {
  rideId: number;
  rideNo: string;
  from: RideStatusValue;
  to: RideStatusValue;
  message: string;
  vehicleId: string;
  at: number;
}

export interface NoticePayload {
  rideId: number;
  kind: 'info' | 'warn' | 'success';
  title: string;
  detail?: string;
}

export interface OpsOverview {
  process: { pid: number; node: string; uptimeS: number; rssMb: number };
  sim: { multiplier: number; paused: boolean; simClockMs: number; tickMs: number; vehicles: number };
  realtime: { subscribers: number; peak: number };
  terminalVehicle: string;
  ride: {
    id: number;
    rideNo: string;
    status: RideStatusValue;
    origin: string;
    dest: string;
    progress: number;
    planDistanceM: number;
    traveledM: number;
  } | null;
  tables: { name: string; rows: number }[];
  runtime: Record<string, unknown> | null;
}
