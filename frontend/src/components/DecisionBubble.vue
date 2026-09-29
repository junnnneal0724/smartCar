<script setup lang="ts">
/**
 * 决策气泡：车内产品的第一功能。
 *
 * 乘客坐在一台没有司机的车里，最大的焦虑不是"多久到"，而是"它刚才为什么那样开"。
 * 这个气泡在车辆每次行为变化时出现，给一句人话解释，并在几秒后自动收起。
 *
 * 关键克制：不做弹窗、不发声音、不阻挡任何操作 —— 只在视野边缘安静地说一句。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import IconBase from './IconBase.vue';
import { useRealtimeStore } from '@/stores/realtime';
import { useRideStore } from '@/stores/ride';

const realtime = useRealtimeStore();
const ride = useRideStore();

const visible = ref(false);
const expanded = ref(false);
let hideTimer: number | null = null;
let collapseTimer: number | null = null;

const behavior = computed(() => ride.behavior ?? realtime.behavior ?? null);
const title = computed(() => behavior.value?.title ?? '');
const detail = computed(() => behavior.value?.detail ?? '');
const icon = computed(() => behavior.value?.icon ?? 'cruise');
const slows = computed(() => behavior.value?.slowsDown ?? false);

watch(
  () => behavior.value?.type ?? title.value,
  () => {
    if (!title.value || !ride.isOngoing) return;
    visible.value = true;
    expanded.value = false;
    if (hideTimer !== null) clearTimeout(hideTimer);
    // 停留 6 秒后收起；如果乘客展开过，则不自动收
    hideTimer = window.setTimeout(() => {
      if (!expanded.value) visible.value = false;
    }, 6000);
  },
);

function toggle(): void {
  expanded.value = !expanded.value;
  if (expanded.value) {
    if (hideTimer !== null) clearTimeout(hideTimer);
    if (collapseTimer !== null) clearTimeout(collapseTimer);
  } else {
    collapseTimer = window.setTimeout(() => (visible.value = false), 1500);
  }
}

function close(): void {
  visible.value = false;
  expanded.value = false;
}

onBeforeUnmount(() => {
  if (hideTimer !== null) clearTimeout(hideTimer);
  if (collapseTimer !== null) clearTimeout(collapseTimer);
});
</script>

<template>
  <Transition name="bubble">
    <div v-if="visible && ride.isOngoing" class="bubble" :class="{ 'bubble--slow': slows, 'bubble--open': expanded }">
      <button class="bubble__main" type="button" @click="toggle">
        <span class="bubble__icon"><IconBase :name="icon" :size="20" /></span>
        <span class="bubble__text">
          <span class="bubble__title">{{ title }}</span>
          <span v-if="expanded" class="bubble__detail">{{ detail }}</span>
          <span v-else class="bubble__more">点开看它为什么这样做</span>
        </span>
        <IconBase :name="expanded ? 'chevronDown' : 'chevronRight'" :size="16" class="bubble__chev" />
      </button>
      <button v-if="expanded" class="bubble__close" type="button" aria-label="收起" @click="close">
        <IconBase name="close" :size="15" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.bubble {
  position: absolute;
  left: var(--sp-5);
  bottom: var(--sp-5);
  max-width: 460px;
  border-radius: var(--r-card);
  background: color-mix(in srgb, var(--c-surface) 92%, transparent);
  border: 1px solid var(--c-border);
  box-shadow: var(--sh-2);
  backdrop-filter: blur(14px);
  overflow: hidden;
}
.bubble::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--c-accent);
}
.bubble--slow::before {
  background: var(--c-warn);
}

.bubble__main {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-5);
  text-align: left;
  width: 100%;
}
.bubble__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--r-input);
  background: var(--c-accent-weak);
  color: var(--c-accent);
  flex: none;
}
.bubble--slow .bubble__icon {
  background: var(--c-warn-weak);
  color: var(--c-warn);
}
.bubble__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bubble__title {
  font-size: var(--fs-body);
  font-weight: 650;
  color: var(--c-text-1);
}
.bubble__more {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.bubble__detail {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.55;
}
.bubble__chev {
  color: var(--c-text-3);
  margin-top: 11px;
  margin-left: auto;
}
.bubble__close {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--c-text-3);
}
.bubble__close:active {
  background: var(--c-surface-hover);
}

.bubble-enter-active,
.bubble-leave-active {
  transition: opacity var(--d-base) var(--ease-out), transform var(--d-base) var(--ease-out);
}
.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(14px);
}
</style>
