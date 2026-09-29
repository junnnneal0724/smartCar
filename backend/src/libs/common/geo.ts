/** 地理计算工具（合成路网尺度很小，用平面近似即可） */

const R_EARTH = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export interface LngLat {
  lng: number;
  lat: number;
}

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 方位角：0 = 正北，顺时针递增到 360 */
export function bearing(a: LngLat, b: LngLat): number {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpLngLat(a: LngLat, b: LngLat, t: number): LngLat {
  return { lng: lerp(a.lng, b.lng, t), lat: lerp(a.lat, b.lat, t) };
}

/** 最短角差（处理 359° → 1° 的跨界） */
export function shortestAngle(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

/** 把一点按米偏移（用于在路口附近生成上车点） */
export function offsetMeters(p: LngLat, eastM: number, northM: number): LngLat {
  const dLat = (northM / R_EARTH) * (180 / Math.PI);
  const dLng = (eastM / (R_EARTH * Math.cos(toRad(p.lat)))) * (180 / Math.PI);
  return { lng: +(p.lng + dLng).toFixed(6), lat: +(p.lat + dLat).toFixed(6) };
}

/** 路网用的米/度换算，用于把经纬度差转成"米"来算路径长度 */
export function metersPerDegreeLat(): number {
  return (Math.PI / 180) * R_EARTH;
}
export function metersPerDegreeLng(lat: number): number {
  return ((Math.PI / 180) * R_EARTH) * Math.cos(toRad(lat));
}
