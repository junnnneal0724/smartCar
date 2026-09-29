<script setup lang="ts">
/**
 * 顶部状态条（56px）。
 *
 * 车内最有价值的信息都在这里，且必须是"一眼可读"的：
 *   车辆编号 / 电量 / 摄像头工作中的提示 / 当前道路与车速 / 时间 / 无障碍开关
 * 其中「摄像头工作中」是刻意的：乘客有权随时知道自己在被拍摄。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import IconBase from './IconBase.vue';
import { useUiStore } from '@/stores/ui';
import { useRideStore } from '@/stores/ride';
import { useRealtimeStore } from '@/stores/realtime';
import { useSessionStore } from '@/stores/session';

const ui = useUiStore();
const ride = useRideStore();
const realtime = useRealtimeStore();
const session = useSessionStore();

const now = ref(Date.now());
const clockTimer = window.setInterval(() => (now.value = Date.now()), 10_000);
onBeforeUnmount(() => clearInterval(clockTimer));

const time = computed(() =>
  new Date(now.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
);

const plate = computed(() => session.vehicle?.plateNo ?? ride.vehicle?.plateNo ?? '--');
const cabin = computed(() => session.vehicle?.cabinNo ?? ride.vehicle?.cabinNo ?? '--');
const battery = computed(() => session.vehicle?.battery ?? ride.vehicle?.battery ?? 0);
const speed = computed(() => ride.vehicle?.speedKph ?? 0);
const road = computed(() => realtime.trackOf(session.vehicle?.id ?? 'V-01')?.roadName || ride.vehicle?.roadName || '');
const cameraOn = computed(() => session.vehicle?.cameraOn ?? ride.vehicle?.cameraOn ?? false);

const batteryTone = computed(() => (battery.value <= 20 ? 'warn' : battery.value <= 10 ? 'danger' : 'ok'));
const linkTone = computed(() => (realtime.connected ? 'ok' : 'warn'));

/**
 * 状态条中央的那句话。
 *
 * 行程已经开始/进行中的时候这里显示车速与当前道路；
 * 其余情况显示行程状态，但"已结束/已取消"不能沿用行程中的标签，
 * 否则待机屏顶上会写着"等待开始行程"，和屏幕中间的"待机中"自相矛盾。
 */
const centerLabel = computed(() => {
  const status = ride.view?.status as string | undefined;
  if (!status || status === 'COMPLETED' || status === 'CANCELLED') return '待机中';
  return ride.view?.statusLabel ?? '待机中';
});

const themeLabel = computed(() => ({ dark: '深色', light: '浅色', auto: '自动' })[ui.theme]);
</script>

<template>
  <header class="bar">
    <!-- 左：车辆身份 -->
    <div class="bar__side">
      <span class="tag">
        <IconBase name="car" :size="16" />
        <span class="num">{{ plate }}</span>
      </span>
      <span class="tag tag--dim">
        <IconBase name="list" :size="15" />
        <span class="num">{{ cabin }}</span>
      </span>
    </div>

    <!-- 中：当前路况（行车中最需要的一句话） -->
    <div class="bar__center">
      <span v-if="ride.isOngoing" class="speed">
        <span class="speed__v num">{{ speed }}</span>
        <span class="speed__u">km/h</span>
      </span>
      <span v-if="road" class="road">{{ road }}</span>
      <span v-if="!ride.isOngoing" class="road">{{ centerLabel }}</span>
    </div>

    <!-- 右：设备与系统状态 -->
    <div class="bar__side bar__side--right">
      <span class="tag" :class="`tag--${batteryTone}`" :title="`电量 ${battery}%`">
        <IconBase name="battery" :size="16" />
        <span class="num">{{ battery }}%</span>
      </span>

      <span v-if="cameraOn" class="tag tag--rec" title="车内摄像头正在工作，仅用于行车安全">
        <span class="rec" aria-hidden="true" />
        录像中
      </span>

      <span class="tag" :class="`tag--${linkTone}`" :title="realtime.connected ? '实时连接正常' : '连接不稳定，正在重连'">
        <IconBase :name="realtime.connected ? 'wifi' : 'wifiOff'" :size="16" />
      </span>

      <span class="tag num">{{ time }}</span>

      <div class="bar__tools" data-touch="compact">
        <button class="mini" type="button" :title="`主题：${themeLabel}`" @click="ui.cycleTheme()">
          <IconBase :name="ui.resolvedTheme === 'dark' ? 'moon' : 'sparkle'" :size="16" />
        </button>
        <button
          class="mini"
          type="button"
          :class="{ 'mini--on': ui.fontScale === 'large' }"
          title="大字模式"
          @click="ui.toggleFont()"
        >
          <IconBase name="textSize" :size="16" />
        </button>
        <button
          class="mini"
          type="button"
          :class="{ 'mini--on': ui.contrast === 'high' }"
          title="高对比模式"
          @click="ui.toggleContrast()"
        >
          <IconBase name="contrast" :size="16" />
        </button>
        <button
          class="mini"
          type="button"
          :class="{ 'mini--on': ui.motion === 'calm' }"
          title="减少动效（易晕车乘客建议开启）"
          @click="ui.toggleMotion()"
        >
          <IconBase name="motion" :size="16" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.bar {
  height: var(--h-statusbar);
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: 0 var(--sp-5);
  background: var(--c-surface-sunken);
  border-bottom: 1px solid var(--c-border);
  flex: none;
}
.bar__side {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.bar__side--right {
  margin-left: auto;
}
.bar__center {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  min-width: 0;
  overflow: hidden;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--r-chip);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  font-size: var(--fs-caption);
  white-space: nowrap;
}
.tag--dim {
  color: var(--c-text-3);
}
.tag--ok {
  color: var(--c-text-2);
}
.tag--warn {
  color: var(--c-warn);
  border-color: color-mix(in srgb, var(--c-warn) 35%, transparent);
}
.tag--danger {
  color: var(--c-danger);
  border-color: color-mix(in srgb, var(--c-danger) 40%, transparent);
}
.tag--rec {
  color: var(--c-text-2);
}

.rec {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c-danger);
  animation: rec-blink 2.6s var(--ease-in-out) infinite;
}
@keyframes rec-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}

.speed {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
}
.speed__v {
  font-size: var(--fs-title);
  font-weight: 700;
  color: var(--c-text-1);
}
.speed__u {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.road {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar__tools {
  display: flex;
  gap: 4px;
}
.mini {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--r-input);
  color: var(--c-text-3);
  transition: color var(--d-fast) var(--ease-out), background var(--d-fast) var(--ease-out);
}
.mini:active {
  background: var(--c-surface);
  color: var(--c-text-1);
}
.mini--on {
  color: var(--c-accent);
  background: var(--c-accent-weak);
}
</style>
