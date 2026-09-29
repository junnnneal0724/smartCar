<script setup lang="ts">
/**
 * 车内终端骨架布局（横屏两栏 + 底部功能条）。
 *
 * ┌──────────────────────────────────────────────┐
 * │ 状态条 56px                                   │
 * ├────────────┬─────────────────────────────────┤
 * │ 行程卡 360 │ 主内容区                         │
 * ├────────────┴─────────────────────────────────┤
 * │ 底部功能条 88px                               │
 * └──────────────────────────────────────────────┘
 *
 * aside / bar 用 'auto' 由行程状态决定：
 *  - 只要存在行程就显示左侧行程卡（包括"车辆来接我"阶段）
 *  - 底部功能条只在行程真正开始后出现（上车前的流程要保持专注）
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StatusBar from './StatusBar.vue';
import TripCard from './TripCard.vue';
import FunctionBar from './FunctionBar.vue';
import ToastStack from './ToastStack.vue';
import IconBase from './IconBase.vue';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';

const props = withDefaults(
  defineProps<{
    aside?: 'auto' | 'always' | 'none';
    bar?: 'auto' | 'always' | 'none';
  }>(),
  { aside: 'auto', bar: 'auto' },
);

const route = useRoute();
const router = useRouter();
const ride = useRideStore();
const session = useSessionStore();

const showAside = computed(() => {
  if (props.aside === 'always') return true;
  if (props.aside === 'none') return false;
  return !!ride.view || !!session.ride;
});

const showBar = computed(() => {
  if (props.bar === 'always') return true;
  if (props.bar === 'none') return false;
  return ride.isOngoing || ride.status === 'ARRIVED';
});

/**
 * 功能条不显示时，功能页必须自己留一个出口。
 * 否则行程开始前从出发确认页进入环境控制，就再也没有回去的路了。
 */
const ENTRY_OR_TERMINAL = ['/boot', '/idle', '/waiting', '/welcome', '/verify', '/ready', '/summary', '/rate', '/farewell', '/ops'];
const showBack = computed(() => !showBar.value && !ENTRY_OR_TERMINAL.includes(route.path));

/** 优先回上一页；如果是被直接打开的新标签页（没有上一页），就回行程主屏 */
function goBack(): void {
  if (window.history.length > 1) router.back();
  else router.push('/trip');
}
</script>

<template>
  <div class="shell">
    <StatusBar />

    <div class="shell__body">
      <TripCard
        v-if="showAside"
        @explain="router.push('/trip/explain')"
        @destination="router.push('/destination')"
      />
      <main class="shell__main">
        <button v-if="showBack" class="shell__back" type="button" @click="goBack">
          <IconBase name="chevronLeft" :size="18" />
          返回
        </button>
        <slot />
      </main>
    </div>

    <FunctionBar v-if="showBar" />
    <ToastStack />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--c-bg);
}
.shell__body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.shell__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* 浮在主内容左上角，不占布局高度，避免把页面的首屏内容整体下压 */
.shell__back {
  position: absolute;
  left: var(--sp-5);
  top: var(--sp-4);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 0 var(--sp-4) 0 var(--sp-3);
  border-radius: var(--r-chip);
  background: color-mix(in srgb, var(--c-surface) 86%, transparent);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  backdrop-filter: blur(10px);
  transition: color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.shell__back:active {
  color: var(--c-text-1);
  border-color: var(--c-border-strong);
}
</style>
