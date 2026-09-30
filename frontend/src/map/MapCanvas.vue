<script setup lang="ts">
/**
 * 自绘矢量地图组件。
 *
 * 对外只暴露"看"的能力（跟随、缩放、是否显示路名），
 * 数据全部从 store 取：剩余路线由前端在同构路网上现算，已走轨迹来自后端记录。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import mapDataRaw from '@map';
import type { LngLat, MapData } from '@/api/types';
import { MapEngine, type MapScene, type VehicleMarker } from '@/map/engine';
import { RoadGraph } from '@/map/path';
import { useRideStore } from '@/stores/ride';
import { useRealtimeStore } from '@/stores/realtime';
import { useSessionStore } from '@/stores/session';
import { rideApi } from '@/api';

const props = withDefaults(
  defineProps<{
    /** 是否跟随本车 */
    follow?: boolean;
    /** 初始缩放（像素/米） */
    scale?: number;
    /** 是否允许手势缩放拖动 */
    interactive?: boolean;
    /** 已走轨迹（不传则组件自己去后端取） */
    traveled?: LngLat[];
  }>(),
  { follow: true, scale: 0.62, interactive: true },
);

const emit = defineEmits<{ (e: 'zoom-change', v: number): void }>();

const mapData = mapDataRaw as unknown as MapData;
const graph = new RoadGraph(mapData);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const ride = useRideStore();
const realtime = useRealtimeStore();
const session = useSessionStore();

const following = ref(props.follow);
const scale = ref(props.scale);
const showRoadLabels = computed(() => scale.value > 0.42);

let engine: MapEngine | null = null;
let remaining: LngLat[] = [];
let traveledPts: LngLat[] = [];
let routeTimer: number | null = null;

const vehicleId = computed(() => ride.vehicle?.id ?? session.vehicle?.id ?? 'V-01');

/** 剩余路线：在浏览器里用同一份路网现算，保证与后端规划一致 */
function recomputeRemaining(): void {
  const v = ride.view;
  if (!v) {
    remaining = [];
    return;
  }
  const self = realtime.sample(vehicleId.value);
  const from = self ? { lng: self.lng, lat: self.lat } : { lng: v.origin.lng, lat: v.origin.lat };
  const to = { lng: v.dest.lng, lat: v.dest.lat };
  const legs = graph.findPath(graph.nearestNode(from).id, graph.nearestNode(to).id);
  const poly = graph.toPolyline(legs);
  remaining = poly.length ? [from, ...poly] : [from, to];
}

async function pullTraveled(): Promise<void> {
  if (!ride.view || !['ONGOING', 'ARRIVING', 'ARRIVED', 'COMPLETED'].includes(ride.view.status)) return;
  try {
    const pts = await rideApi.route();
    traveledPts = pts.map((p) => ({ lng: p.lng, lat: p.lat }));
  } catch {
    /* 轨迹是增强信息 */
  }
}

function buildScene(): MapScene {
  const v = ride.view;
  const selfId = vehicleId.value;
  const now = performance.now();

  const vehicles: VehicleMarker[] = realtime.sampleAll(now).map((t) => ({
    id: t.id,
    lng: t.lng,
    lat: t.lat,
    heading: t.heading,
    speedKph: t.speedKph,
    isSelf: t.id === selfId,
  }));

  // 本车还没收到推送时，用行程起点兜底，避免地图上"没有车"
  if (!vehicles.some((x) => x.isSelf)) {
    const fallback = v ? { lng: v.origin.lng, lat: v.origin.lat } : mapData.meta.center;
    vehicles.push({ id: selfId, lng: fallback.lng, lat: fallback.lat, heading: 0, speedKph: 0, isSelf: true });
  }

  return {
    camera: { center: mapData.meta.center, scale: scale.value },
    vehicles,
    remaining,
    traveled: props.traveled ?? traveledPts,
    origin: v ? { lng: v.origin.lng, lat: v.origin.lat } : undefined,
    dest: v ? { lng: v.dest.lng, lat: v.dest.lat } : undefined,
    showRoadLabels: showRoadLabels.value,
    following: following.value,
  };
}

/* ------------------------------------------------------------ 手势 */

let dragging = false;
let lastX = 0;
let lastY = 0;
let pinchStart = 0;
let pinchScale = 1;

function onPointerDown(e: PointerEvent): void {
  if (!props.interactive) return;
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  // 失败要吞掉：pointerId 过期、或用脚本合成的事件都会让这里抛异常，
  // 而拖动本身已经在上面记好状态了，不该因为捕获指针失败而中断。
  try {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  } catch {
    /* 捕获不到就算了，拖动照样能用 */
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging || !props.interactive || !engine) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 2) following.value = false;
  // 直接改相机中心：拖动时不需要平滑，否则手指和地图会"脱手"
  const cam = (engine as unknown as { cam: { center: LngLat; scale: number } }).cam;
  const cosLat = Math.cos((cam.center.lat * Math.PI) / 180);
  cam.center.lng -= dx / (111320 * cosLat * cam.scale);
  cam.center.lat += dy / (111320 * cam.scale);
}

function onPointerUp(): void {
  dragging = false;
}

function onWheel(e: WheelEvent): void {
  if (!props.interactive) return;
  e.preventDefault();
  setScale(scale.value * (e.deltaY > 0 ? 0.88 : 1.14));
}

function onTouchStart(e: TouchEvent): void {
  if (e.touches.length === 2) {
    pinchStart = touchDistance(e);
    pinchScale = scale.value;
  }
}
function onTouchMove(e: TouchEvent): void {
  if (e.touches.length === 2 && pinchStart > 0) {
    e.preventDefault();
    setScale(pinchScale * (touchDistance(e) / pinchStart));
  }
}
function onTouchEnd(): void {
  pinchStart = 0;
}
function touchDistance(e: TouchEvent): number {
  const [a, b] = [e.touches[0], e.touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function setScale(v: number): void {
  scale.value = Math.max(0.16, Math.min(3.2, v));
  emit('zoom-change', scale.value);
}

function zoomBy(f: number): void {
  setScale(scale.value * f);
}

function recenter(): void {
  following.value = true;
}

defineExpose({ zoomBy, recenter, setScale });

/* ------------------------------------------------------------ 生命周期 */

let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let roTimer: number | null = null;

onMounted(() => {
  if (!canvasRef.value) return;
  engine = new MapEngine(canvasRef.value, mapData, { center: mapData.meta.center, scale: scale.value });
  engine.setSceneProvider(buildScene);
  engine.start();

  recomputeRemaining();
  pullTraveled();
  routeTimer = window.setInterval(() => {
    recomputeRemaining();
    pullTraveled();
  }, 2500);

  resizeObserver = new ResizeObserver(() => {
    if (roTimer !== null) clearTimeout(roTimer);
    roTimer = window.setTimeout(() => engine?.resize(), 80);
  });
  resizeObserver.observe(canvasRef.value);

  // 主题切换后要重新读取 CSS 变量，否则画布还停留在旧配色
  themeObserver = new MutationObserver(() => engine?.refreshTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast'] });
});

onBeforeUnmount(() => {
  if (routeTimer !== null) clearInterval(routeTimer);
  if (roTimer !== null) clearTimeout(roTimer);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  engine?.destroy();
  engine = null;
});

watch(
  () => ride.view?.dest.name,
  () => recomputeRemaining(),
);
watch(following, (v) => {
  if (v) recomputeRemaining();
});
watch(
  () => realtime.tracks,
  () => {
    if (!remaining.length) recomputeRemaining();
  },
);
</script>

<template>
  <div class="map">
    <canvas
      ref="canvasRef"
      class="map__canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    />

    <!-- 只读状态提示：不抢主内容，放在角落 -->
    <div class="map__hint" :class="{ 'map__hint--off': !following }">
      <span v-if="following">跟随车辆</span>
      <span v-else>已锁定视角</span>
    </div>

    <div class="map__tools" data-touch="compact">
      <button class="tool" type="button" aria-label="放大" @click="zoomBy(1.22)">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
        </svg>
      </button>
      <button class="tool" type="button" aria-label="缩小" @click="zoomBy(0.82)">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
        </svg>
      </button>
      <button v-if="!following" class="tool tool--accent" type="button" aria-label="回到车辆" @click="recenter">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 3l7 4v5.2c0 4.3-2.9 7.6-7 8.8-4.1-1.2-7-4.5-7-8.8V7l7-4z"
            stroke="currentColor"
            stroke-width="1.7"
            fill="none"
            stroke-linejoin="round"
          />
          <circle cx="12" cy="11" r="2.4" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.map {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--c-map-bg);
  border: 1px solid var(--c-border);
}
.map__canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.map__canvas:active {
  cursor: grabbing;
}

.map__hint {
  position: absolute;
  left: var(--sp-4);
  top: var(--sp-4);
  padding: 6px 12px;
  border-radius: var(--r-chip);
  background: color-mix(in srgb, var(--c-surface) 82%, transparent);
  border: 1px solid var(--c-border);
  color: var(--c-text-3);
  font-size: var(--fs-caption);
  letter-spacing: 0.04em;
  backdrop-filter: blur(8px);
  transition: color var(--d-fast) var(--ease-out);
}
.map__hint--off {
  color: var(--c-warn);
}

.map__tools {
  position: absolute;
  right: var(--sp-4);
  top: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
/* 地图缩放是叠在地图上的次要控件，52x52 已是"不挡住路况"与"好按"的平衡点，
   所以显式声明为 compact 档（见 tokens.css 的豁免说明） */
.tool {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: var(--r-input);
  background: color-mix(in srgb, var(--c-surface) 85%, transparent);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  backdrop-filter: blur(8px);
  transition: background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out),
    border-color var(--d-fast) var(--ease-out);
}
.tool:active {
  transform: scale(0.94);
}
.tool--accent {
  color: var(--c-accent);
  border-color: var(--c-accent-border);
}
</style>
