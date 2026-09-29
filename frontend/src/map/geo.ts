/** 地图几何工具：投影、插值、角度 */
import type { LngLat } from '@/api/types';

const R_EARTH = 6371008.8;

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: LngLat, b: LngLat): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpLngLat(a: LngLat, b: LngLat, t: number): LngLat {
  return { lng: lerp(a.lng, b.lng, t), lat: lerp(a.lat, b.lat, t) };
}

/** 两个角度之间的最短差值（处理 359° → 1° 的跨越） */
export function shortestAngle(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180;
  if (Object.is(d, -180)) d = 180;
  return d;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return (from + shortestAngle(from, to) * t + 360) % 360;
}

/** 平滑跟随：帧率无关的指数逼近 */
export function smoothTo(current: number, target: number, dtS: number, halfLifeS = 0.12): number {
  const k = 1 - Math.pow(0.5, dtS / halfLifeS);
  return current + (target - current) * k;
}

export interface Camera {
  center: LngLat;
  /** 每度经度对应的像素数（缩放级别） */
  scale: number;
}

/**
 * 经纬度 → 屏幕像素。
 * 用等距圆柱投影并按纬度压缩经度：城市尺度（几公里）下误差可忽略，
 * 但能保证路网的形状不被拉扁。
 */
export function createProjector(camera: Camera, width: number, height: number) {
  const cosLat = Math.cos((camera.center.lat * Math.PI) / 180);
  const cx = width / 2;
  const cy = height / 2;
  return {
    /** 米 → 像素。scale 定义为「每米多少像素」 */
    toScreen(p: LngLat): { x: number; y: number } {
      const dxM = (p.lng - camera.center.lng) * 111320 * cosLat;
      const dyM = (p.lat - camera.center.lat) * 111320;
      return { x: cx + dxM * camera.scale, y: cy - dyM * camera.scale };
    },
    toLngLat(x: number, y: number): LngLat {
      const dxM = (x - cx) / camera.scale;
      const dyM = (cy - y) / camera.scale;
      return {
        lng: camera.center.lng + dxM / (111320 * cosLat),
        lat: camera.center.lat + dyM / 111320,
      };
    },
    /** 当前视口覆盖的米数，用于决定是否绘制细节 */
    viewportM: { w: width / camera.scale, h: height / camera.scale },
  };
}

/** 把米换算成可读文案 */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} 米`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} 公里`;
}

/** 秒 → 「12 分钟」/「1 小时 5 分」 */
export function formatDuration(s: number): string {
  const total = Math.max(0, Math.round(s));
  const min = Math.floor(total / 60);
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  return `${h} 小时 ${min % 60} 分`;
}

/** 秒 → mm:ss，用于倒计时 */
export function formatClock(s: number): string {
  const total = Math.max(0, Math.round(s));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
