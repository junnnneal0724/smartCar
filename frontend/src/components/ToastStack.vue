<script setup lang="ts">
/**
 * 行程通知条。
 * 只用于"必须让乘客知道"的事（车辆已到达、即将到达、紧急停车已受理），
 * 其余一律走决策气泡。车内最忌讳把屏幕变成消息中心。
 */
import { onBeforeUnmount, watch } from 'vue';
import IconBase from './IconBase.vue';
import { useRealtimeStore } from '@/stores/realtime';

const realtime = useRealtimeStore();
const timers = new Map<number, number>();

watch(
  () => realtime.notices.map((n) => n.id).join(','),
  () => {
    for (const n of realtime.notices) {
      if (timers.has(n.id)) continue;
      const t = window.setTimeout(() => {
        realtime.dismissNotice(n.id);
        timers.delete(n.id);
      }, 7000);
      timers.set(n.id, t);
    }
  },
);

onBeforeUnmount(() => {
  for (const t of timers.values()) clearTimeout(t);
});
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="n in realtime.notices" :key="n.id" class="toast" :class="`toast--${n.kind}`">
        <span class="toast__icon">
          <IconBase :name="n.kind === 'warn' ? 'alert' : n.kind === 'success' ? 'check' : 'info'" :size="18" />
        </span>
        <div class="toast__body">
          <p class="toast__title">{{ n.title }}</p>
          <p v-if="n.detail" class="toast__detail">{{ n.detail }}</p>
        </div>
        <button class="toast__x" type="button" aria-label="关闭" @click="realtime.dismissNotice(n.id)">
          <IconBase name="close" :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: absolute;
  top: var(--sp-5);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  z-index: 40;
  pointer-events: none;
  width: min(560px, 60%);
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  background: color-mix(in srgb, var(--c-surface-raised) 94%, transparent);
  border: 1px solid var(--c-border);
  box-shadow: var(--sh-2);
  backdrop-filter: blur(12px);
}
.toast--success {
  border-color: color-mix(in srgb, var(--c-success) 38%, transparent);
}
.toast--warn {
  border-color: color-mix(in srgb, var(--c-danger) 42%, transparent);
}
.toast__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r-input);
  background: var(--c-surface);
  color: var(--c-accent);
  flex: none;
}
.toast--success .toast__icon {
  color: var(--c-success);
}
.toast--warn .toast__icon {
  color: var(--c-danger);
}
.toast__body {
  min-width: 0;
  flex: 1;
}
.toast__title {
  font-size: var(--fs-body-s);
  font-weight: 600;
}
.toast__detail {
  margin-top: 2px;
  font-size: var(--fs-caption);
  color: var(--c-text-2);
  line-height: 1.5;
}
.toast__x {
  color: var(--c-text-3);
  padding: 4px;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--d-base) var(--ease-out), transform var(--d-base) var(--ease-out);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
