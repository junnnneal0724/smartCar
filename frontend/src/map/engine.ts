/**
 * 自绘矢量地图渲染引擎（Canvas 2D）。
 *
 * 为什么不用高德/百度/Leaflet：
 *   1. 本地 Demo 不能依赖外部地图服务与 Key；
 *   2. 路网是合成数据，落在真实底图上反而"对不上"；
 *   3. 深色车机地图需要和设计令牌完全一致（路面颜色、路线发光），第三方底图改不动。
 *
 * 绘制顺序：底色 → 区块(水/绿地) → 路面描边 → 路面填充 → 道路名 → 剩余路线 → 已走轨迹
 *          → 起终点标记 → 其他车辆 → 本车 → 决策气泡锚点
 */
import type { Camera } from './geo';
import { createProjector, lerpAngle, smoothTo } from './geo';
import type { LngLat, MapData, PoiView } from '@/api/types';

export interface VehicleMarker {
  id: string;
  lng: number;
  lat: number;
  heading: number;
  speedKph: number;
  isSelf: boolean;
  label?: string;
}

export interface MapScene {
  camera: Camera;
  vehicles: VehicleMarker[];
  /** 剩余路线（高亮） */
  remaining: LngLat[];
  /** 已行驶轨迹（暗） */
  traveled: LngLat[];
  origin?: LngLat;
  dest?: LngLat;
  /** 决策气泡要指向的位置 */
  focus?: LngLat | null;
  /** 是否显示道路名（缩放足够大时） */
  showRoadLabels: boolean;
  /** 是否跟随本车 */
  following: boolean;
}

interface ThemeColors {
  bg: string;
  block: string;
  road: string;
  roadMain: string;
  roadCasing: string;
  water: string;
  park: string;
  route: string;
  routeGlow: string;
  routeDone: string;
  vehicle: string;
  vehicleOther: string;
  poi: string;
  text1: string;
  text2: string;
  text3: string;
  accent: string;
  success: string;
  danger: string;
  surface: string;
}

function readTheme(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--c-map-bg', '#0d1116'),
    block: v('--c-map-block', '#141920'),
    road: v('--c-map-road', '#232b36'),
    roadMain: v('--c-map-road-main', '#303a48'),
    roadCasing: v('--c-map-road-casing', '#3b4655'),
    water: v('--c-map-water', '#16243a'),
    park: v('--c-map-park', '#17281f'),
    route: v('--c-map-route', '#6e9bff'),
    routeGlow: v('--c-map-route-glow', 'rgba(110,155,255,.22)'),
    routeDone: v('--c-map-route-done', '#4a5a72'),
    vehicle: v('--c-map-vehicle', '#edf1f7'),
    vehicleOther: v('--c-map-vehicle-other', '#4d5a6e'),
    poi: v('--c-map-poi', '#7f8a9c'),
    text1: v('--c-text-1', '#edf1f7'),
    text2: v('--c-text-2', '#a3adbd'),
    text3: v('--c-text-3', '#828d9e'),
    accent: v('--c-accent', '#6e9bff'),
    success: v('--c-success', '#3dd6b5'),
    danger: v('--c-danger', '#ff7a7c'),
    surface: v('--c-surface', '#161b22'),
  };
}

export class MapEngine {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private theme: ThemeColors;
  /** 相机平滑后的实际值（真正的相机） */
  private cam: Camera;
  private raf = 0;
  private lastFrame = 0;
  private scene: MapScene | null = null;
  private provider: (() => MapScene) | null = null;
  private data: MapData;

  constructor(
    private canvas: HTMLCanvasElement,
    data: MapData,
    initialCamera: Camera,
  ) {
    this.data = data;
    this.cam = { center: { ...initialCamera.center }, scale: initialCamera.scale };
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
    this.ctx = ctx;
    this.theme = readTheme();
    this.resize();
  }

  refreshTheme(): void {
    this.theme = readTheme();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setScene(scene: MapScene): void {
    this.scene = scene;
  }

  /**
   * 逐帧数据源。
   * 车辆位置需要按 60fps 插值，而 SSE 只有 2Hz；如果由 Vue 每帧 setScene，
   * 会把响应式系统拉进渲染循环里。改成引擎每帧回调取数据，Vue 只负责提供函数。
   */
  setSceneProvider(fn: () => MapScene): void {
    this.provider = fn;
  }

  start(): void {
    if (this.raf) return;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.step(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** 相机跟随：本车在画面偏下位置，前方留出更多可视距离（人开车时的视野习惯） */
  private step(dt: number): void {
    const s = this.scene;
    if (!s) return;
    const self = s.vehicles.find((v) => v.isSelf);
    const target = s.following && self ? { lng: self.lng, lat: self.lat } : s.camera.center;

    this.cam.center.lng = smoothTo(this.cam.center.lng, target.lng, dt, 0.18);
    this.cam.center.lat = smoothTo(this.cam.center.lat, target.lat, dt, 0.18);
    this.cam.scale = smoothTo(this.cam.scale, s.camera.scale, dt, 0.35);
  }

  private project() {
    // 跟随时把视点往车头前方偏移，让前方路况占更多画面
    const self = this.scene?.vehicles.find((v) => v.isSelf);
    const cam = { ...this.cam, center: { ...this.cam.center } };
    if (this.scene?.following && self) {
      const rad = (self.heading * Math.PI) / 180;
      const aheadM = 120;
      cam.center.lng += (Math.sin(rad) * aheadM) / (111320 * Math.cos((cam.center.lat * Math.PI) / 180));
      cam.center.lat += (Math.cos(rad) * aheadM) / 111320;
    }
    return createProjector(cam, this.w, this.h);
  }

  private draw(): void {
    const ctx = this.ctx;
    if (this.provider) this.scene = this.provider();
    const s = this.scene;
    const t = this.theme;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!s) return;

    const proj = this.project();

    this.drawAreas(proj);
    this.drawRoads(proj);
    if (s.showRoadLabels) this.drawRoadLabels(proj);
    this.drawPolyline(proj, s.remaining, t.route, 6, true);
    this.drawPolyline(proj, s.traveled, t.routeDone, 4, false);
    this.drawEndpoints(proj, s);
    this.drawPois(proj, s.showRoadLabels);
    this.drawVehicles(proj, s, t);
  }

  private drawAreas(proj: ReturnType<typeof createProjector>): void {
    const ctx = this.ctx;
    const t = this.theme;
    // 先铺一层底色块，让城市有"地块"的层次，而不是一片纯色
    ctx.fillStyle = t.block;
    ctx.fillRect(0, 0, this.w, this.h);

    for (const area of this.data.areas) {
      // 防一手：地块是纯装饰，字段缺失时跳过即可，不能让地图整体挂掉
      const ring = area.polygon;
      if (!Array.isArray(ring) || ring.length < 3) continue;
      ctx.beginPath();
      ring.forEach(([lng, lat], i) => {
        const p = proj.toScreen({ lng, lat });
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = area.kind === 'water' ? t.water : area.kind === 'park' ? t.park : t.block;
      ctx.fill();
    }
  }

  private drawRoads(proj: ReturnType<typeof createProjector>): void {
    const ctx = this.ctx;
    const t = this.theme;

    // 两遍绘制：先画深色描边（路肩），再画路面，得到"道路是嵌在地块里"的观感
    for (const pass of [0, 1] as const) {
      for (const e of this.data.edges) {
        const a = this.data.nodes.find((n) => n.id === e.a);
        const b = this.data.nodes.find((n) => n.id === e.b);
        if (!a || !b) continue;
        const pa = proj.toScreen({ lng: a.lng, lat: a.lat });
        const pb = proj.toScreen({ lng: b.lng, lat: b.lat });
        const main = e.level <= 1;
        const width = pass === 0 ? (main ? 16 : 10) : main ? 11 : 6;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.lineCap = 'round';
        ctx.lineWidth = width;
        ctx.strokeStyle = pass === 0 ? t.roadCasing : main ? t.roadMain : t.road;
        ctx.stroke();
      }
    }
  }

  private drawRoadLabels(proj: ReturnType<typeof createProjector>): void {
    const ctx = this.ctx;
    const seen = new Set<string>();
    ctx.font = '500 11px "Plus Jakarta Sans Variable", system-ui, sans-serif';
    ctx.fillStyle = this.theme.text3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of this.data.edges) {
      if (e.level > 1 || seen.has(e.road)) continue;
      seen.add(e.road);
      const a = this.data.nodes.find((n) => n.id === e.a);
      const b = this.data.nodes.find((n) => n.id === e.b);
      if (!a || !b) continue;
      const mid = proj.toScreen({ lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 });
      if (mid.x < 40 || mid.x > this.w - 40 || mid.y < 30 || mid.y > this.h - 30) continue;
      ctx.fillText(e.road, mid.x, mid.y - 12);
    }
  }

  private drawPolyline(proj: ReturnType<typeof createProjector>, pts: LngLat[], color: string, width: number, glow: boolean): void {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    const screen = pts.map((p) => proj.toScreen(p));

    if (glow) {
      ctx.beginPath();
      screen.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = this.theme.routeGlow;
      ctx.lineWidth = width + 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.beginPath();
    screen.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  private drawEndpoints(proj: ReturnType<typeof createProjector>, s: MapScene): void {
    const ctx = this.ctx;
    if (s.origin) {
      const p = proj.toScreen(s.origin);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.surface;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.theme.text3;
      ctx.stroke();
    }
    if (s.dest) {
      const p = proj.toScreen(s.dest);
      // 目的地用「旗标 + 光晕」而不是大头针，避免和状态图标的观感冲突
      const pulse = 1 + Math.sin(performance.now() / 600) * 0.08;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.routeGlow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.bg;
      ctx.fill();
    }
  }

  private drawPois(proj: ReturnType<typeof createProjector>, showLabels: boolean): void {
    const ctx = this.ctx;
    const important: PoiView[] = showLabels ? this.data.pois : this.data.pois.filter((p) => p.category === 'station' || p.category === 'airport');
    ctx.font = '500 11px "Plus Jakarta Sans Variable", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const poi of important) {
      const p = proj.toScreen({ lng: poi.lng, lat: poi.lat });
      if (p.x < -40 || p.x > this.w + 40 || p.y < -20 || p.y > this.h + 20) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.poi;
      ctx.fill();
      if (showLabels) {
        ctx.fillStyle = this.theme.text3;
        ctx.fillText(poi.name, p.x, p.y + 7);
      }
    }
  }

  private drawVehicles(proj: ReturnType<typeof createProjector>, s: MapScene, t: ThemeColors): void {
    const ctx = this.ctx;

    for (const v of s.vehicles) {
      if (v.isSelf) continue;
      const p = proj.toScreen({ lng: v.lng, lat: v.lat });
      if (p.x < -20 || p.x > this.w + 20 || p.y < -20 || p.y > this.h + 20) continue;
      this.drawCarShape(ctx, p.x, p.y, v.heading, t.vehicleOther, 11);
    }

    const self = s.vehicles.find((v) => v.isSelf);
    if (self) {
      const p = proj.toScreen({ lng: self.lng, lat: self.lat });
      // 本车：柔光晕 + 白色车形。光晕用 accent 而不是危险色，
      // 因为"我的车在哪"是定位信息，不是告警。
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 46);
      glow.addColorStop(0, t.routeGlow);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 46, 0, Math.PI * 2);
      ctx.fill();
      this.drawCarShape(ctx, p.x, p.y, self.heading, t.vehicle, 17);
    }
  }

  /** 车形：一个圆角矩形 + 前挡风缺口，比三角箭头更"车" */
  private drawCarShape(ctx: CanvasRenderingContext2D, x: number, y: number, headingDeg: number, color: string, size: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((headingDeg * Math.PI) / 180);
    const w = size * 0.62;
    const h = size;
    const r = w * 0.42;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    ctx.lineTo(w / 2, h / 2 - r);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  destroy(): void {
    this.stop();
  }
}

export { lerpAngle, smoothTo };
