<script setup lang="ts">
/**
 * 应用外壳：负责三件事
 *   1. 车机启动（bootstrap）与实时连接（SSE）
 *   2. 由后端状态驱动页面跳转（前端不自己推断状态机）
 *   3. 决定当前页面用哪种外壳（带行程卡 / 全屏聚焦）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CabinLayout from '@/components/CabinLayout.vue';
import { useSessionStore } from '@/stores/session';
import { useRideStore } from '@/stores/ride';
import { useRealtimeStore } from '@/stores/realtime';
import { useCabinStore } from '@/stores/cabin';
import { useUiStore } from '@/stores/ui';
import type { ScreenState } from '@/api/types';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const ride = useRideStore();
const realtime = useRealtimeStore();
const cabin = useCabinStore();
const ui = useUiStore();

const booting = ref(true);
let pollTimer: number | null = null;

const bare = computed(() => route.meta.bare === true);
const aside = computed(() => (route.meta.aside as 'auto' | 'always' | 'none') ?? 'auto');
const bar = computed(() => (route.meta.bar as 'auto' | 'always' | 'none') ?? 'auto');

/**
 * 状态 → 页面。用一张显式的「交接表」而不是一堆 if：
 *
 * 表里写的是**允许被状态机接管的来源页**。乘客如果停在别的页面上
 * （环境控制、停靠、帮助、偏好……），说明他正在主动做某件事，任何状态变化都不打断他。
 *
 * 这一条不是锦上添花，是必须的：
 *   行程中底部功能条会把人带到 /cabin 和 /stop，如果无脑跟随状态，
 *   乘客点开环境控制就会被立刻弹回地图，整个功能条等于失效。
 */
const HANDOFF: Record<ScreenState, string[]> = {
  IDLE: [],
  WAITING: ['/boot', '/idle'],
  WELCOME: ['/boot', '/idle', '/waiting'],
  READY: ['/boot', '/idle', '/waiting', '/welcome', '/verify'],
  TRIP: ['/boot', '/waiting', '/welcome', '/verify', '/ready'],
  ARRIVING: ['/boot', '/ready', '/trip'],
  ARRIVED: ['/boot', '/ready', '/trip', '/arriving'],
  SUMMARY: ['/boot', '/waiting', '/welcome', '/verify', '/ready', '/trip', '/arriving', '/alight'],
};

function routeForState(state: ScreenState): string | null {
  switch (state) {
    case 'WAITING':
      return '/waiting';
    case 'WELCOME':
      return '/welcome';
    case 'READY':
      return '/ready';
    case 'TRIP':
      return '/trip';
    case 'ARRIVING':
      return '/arriving';
    case 'ARRIVED':
      return '/alight';
    case 'SUMMARY':
      return '/summary';
    default:
      return null;
  }
}

function applyStateRoute(state: ScreenState): void {
  const target = routeForState(state);
  if (!target) return;
  const cur = route.path;
  if (cur === target) return;
  if (!HANDOFF[state].includes(cur)) return;

  // 手指还按在屏幕上就绝不换屏。车辆进入"即将到达"时后端会立刻推状态，
  // 如果乘客此刻正在拖地图，页面就会在他手指底下消失——看起来就像
  // "一拖动地图就跳到了停靠页"，其实跳转跟拖动没有因果关系，只是撞在一起了。
  if (ui.isInteracting()) return;

  // 乘客手动拖过地图，这一屏就归他：他要自己看位置，谁也别收走。
  // 状态变化本身不会丢——底部的停靠页入口、以及到站后地图上的提示卡都还在。
  if (cur === '/trip' && ui.mapManual) return;

  router.replace(target);
}

async function bootstrap(): Promise<void> {
  const b = await session.bootstrap();
  if (!b) return;
  if (b.ride) {
    // bootstrap 已经带了行程与车辆，直接同步给 ride store，省掉一次往返
    ride.view = b.ride;
    ride.syncCountdown();
  }
  applyStateRoute(b.state);
}

onMounted(async () => {
  // 全局记录"手指是否在屏幕上"。用捕获阶段，保证任何页面的手势都算数，
  // 不依赖各页面自己上报。
  window.addEventListener('pointerdown', onGlobalDown, true);
  window.addEventListener('pointerup', onGlobalUp, true);
  window.addEventListener('pointercancel', onGlobalUp, true);

  await bootstrap();
  await cabin.load().catch(() => undefined);
  await ride.refresh().catch(() => undefined);
  ride.startCountdown();

  realtime.connect([
    'vehicle.position',
    'ride.status_changed',
    'ride.progress',
    'ride.behavior',
    'notify.notice',
  ]);

  // 兜底轮询：SSE 在弱网/休眠恢复后可能已经断了，定期对齐一次服务端真相
  pollTimer = window.setInterval(() => {
    bootstrap().catch(() => undefined);
  }, 8000);

  booting.value = false;
});

onBeforeUnmount(() => {
  if (pollTimer !== null) clearInterval(pollTimer);
  window.removeEventListener('pointerdown', onGlobalDown, true);
  window.removeEventListener('pointerup', onGlobalUp, true);
  window.removeEventListener('pointercancel', onGlobalUp, true);
  realtime.disconnect();
  ride.stopCountdown();
});

function onGlobalDown(): void {
  ui.setTouching(true);
}
function onGlobalUp(): void {
  ui.setTouching(false);
}

// 后端状态一变，立刻重新对齐（不等轮询）
watch(
  () => realtime.statusChange?.at,
  () => {
    bootstrap().catch(() => undefined);
    ride.refresh().catch(() => undefined);
  },
);

// 拿到新行程时同步一次车辆与座舱；同时让状态变化本身也成为一次换屏依据
// （启动页上点"重试"是直接调 session.bootstrap()，绕过上面的包装函数，
//   所以必须监听 state 才能把乘客从启动页带出去）
watch(
  () => session.state,
  (s) => {
    applyStateRoute(s);
    if (s === 'TRIP') {
      ride.refresh().catch(() => undefined);
      cabin.load().catch(() => undefined);
      ride.startCountdown();
    }
  },
);

// 行程结束后停掉每秒回退的倒计时，避免后台空转
watch(
  () => ride.isOngoing,
  (ongoing) => {
    if (!ongoing) ride.stopCountdown();
  },
);
</script>

<template>
  <!-- 启动页与演示控制台使用裸外壳：它们不属于乘客动线 -->
  <template v-if="booting || bare">
    <RouterView />
  </template>

  <CabinLayout v-else :aside="aside" :bar="bar">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </CabinLayout>
</template>

<style>
/* 页面切换：车内动作放慢，不做位移过大的转场（易晕车） */
.page-enter-active,
.page-leave-active {
  transition: opacity var(--d-base) var(--ease-out), transform var(--d-base) var(--ease-out);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
