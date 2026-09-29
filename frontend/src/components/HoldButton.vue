<script setup lang="ts">
/**
 * 长按确认按钮。
 *
 * 为什么不用二次确认弹窗：车内屏幕下方的弹窗需要用户"读—找按钮—点"，
 * 而乘客注意力在路况上。长按 1.2 秒既能防误触，又能用手指完成"我确定"的表达，
 * 全程不需要阅读（见 docs/02 §11.4）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import IconBase from './IconBase.vue';

const props = withDefaults(
  defineProps<{
    /** 需要按住的毫秒数 */
    duration?: number;
    label: string;
    hint?: string;
    icon?: string;
    variant?: 'primary' | 'danger';
    disabled?: boolean;
    disabledReason?: string;
  }>(),
  { duration: 1200, variant: 'primary', disabled: false },
);

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>();

const progress = ref(0);
const holding = ref(false);
let raf = 0;
let startAt = 0;

const ringStyle = computed(() => ({
  background: `conic-gradient(currentColor ${progress.value * 360}deg, transparent 0deg)`,
}));

function begin(): void {
  if (props.disabled || holding.value) return;
  holding.value = true;
  startAt = performance.now();
  const tick = () => {
    const p = Math.min(1, (performance.now() - startAt) / props.duration);
    progress.value = p;
    if (p >= 1) {
      finish(true);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function finish(ok: boolean): void {
  cancelAnimationFrame(raf);
  const held = progress.value;
  holding.value = false;
  progress.value = 0;
  if (ok) emit('confirm');
  else if (held > 0.12) emit('cancel');
}

onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <button
    class="hold"
    :class="[`hold--${variant}`, { 'hold--holding': holding, 'hold--disabled': disabled }]"
    type="button"
    :disabled="disabled"
    @pointerdown.prevent="begin"
    @pointerup="finish(false)"
    @pointerleave="finish(false)"
    @pointercancel="finish(false)"
    @keydown.space.prevent="begin"
    @keyup.space="finish(false)"
  >
    <span class="hold__ring" :style="ringStyle" aria-hidden="true" />
    <span class="hold__inner">
      <IconBase v-if="icon" :name="icon" :size="24" />
      <span class="hold__text">
        <span class="hold__label">{{ disabled && disabledReason ? disabledReason : label }}</span>
        <span v-if="hint && !holding" class="hold__hint">{{ hint }}</span>
        <span v-else-if="holding" class="hold__hint hold__hint--active">
          继续按住… {{ Math.round(progress * 100) }}%
        </span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.hold {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 72px;
  padding: 3px;
  border-radius: var(--r-btn);
  background: transparent;
  transition: opacity var(--d-fast) var(--ease-out);
}
.hold__ring {
  position: absolute;
  inset: 0;
  border-radius: var(--r-btn);
  opacity: 0;
  transition: opacity var(--d-fast) var(--ease-out);
}
.hold--holding .hold__ring {
  opacity: 1;
}
.hold__inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 66px;
  padding: 0 var(--sp-5);
  border-radius: var(--r-btn);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.hold--primary {
  color: var(--c-accent);
}
.hold--primary .hold__inner {
  background: var(--c-accent);
  border-color: transparent;
  color: var(--c-on-accent);
}
.hold--danger {
  color: var(--c-danger);
}
.hold--danger .hold__inner {
  background: var(--c-danger-weak);
  border-color: color-mix(in srgb, var(--c-danger) 45%, transparent);
  color: var(--c-danger);
}
.hold--holding .hold__inner {
  background: color-mix(in srgb, currentColor 16%, var(--c-surface-raised));
}
.hold--primary.hold--holding .hold__inner {
  background: var(--c-accent-press);
}
.hold__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.hold__label {
  font-size: var(--fs-body);
  font-weight: 650;
  line-height: 1.25;
}
.hold__hint {
  font-size: var(--fs-caption);
  /* 同 AppButton：不靠压透明度做层次，否则危险色与强调色上的副文案会掉到 4:1 以下 */
  opacity: 0.85;
  font-weight: 450;
}
.hold__hint--active {
  opacity: 0.9;
}
.hold--disabled {
  opacity: 0.5;
  pointer-events: none;
}
.hold--disabled .hold__inner {
  background: var(--c-surface);
  border-style: dashed;
  color: var(--c-text-2);
}
</style>
