<script setup lang="ts">
/**
 * 车机主按钮。
 * 车机是触摸屏：没有 hover、没有鼠标，所以按下态（:active）必须明显，
 * 并且高度按 64px 起（见 docs/02 §11.4 的触控目标要求）。
 */
import IconBase from './IconBase.vue';

withDefaults(
  defineProps<{
    variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'quiet';
    size?: 'md' | 'lg' | 'xl';
    block?: boolean;
    icon?: string;
    iconRight?: string;
    disabled?: boolean;
    loading?: boolean;
    /** 次要说明文字，放在标签下方，用于"说清楚按下去会发生什么" */
    hint?: string;
  }>(),
  { variant: 'soft', size: 'lg', block: false, disabled: false, loading: false },
);
</script>

<template>
  <button
    class="btn pressable"
    :class="[`btn--${variant}`, `btn--${size}`, { 'btn--block': block, 'btn--disabled': disabled || loading }]"
    type="button"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <IconBase v-else-if="icon" :name="icon" :size="size === 'xl' ? 26 : size === 'lg' ? 22 : 19" />
    <span class="btn__text">
      <span class="btn__label"><slot /></span>
      <span v-if="hint" class="btn__hint">{{ hint }}</span>
    </span>
    <IconBase v-if="iconRight" :name="iconRight" :size="20" class="btn__right" />
  </button>
</template>

<style scoped>
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  border-radius: var(--r-btn);
  font-weight: 600;
  letter-spacing: 0.01em;
  border: 1px solid transparent;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    color var(--d-fast) var(--ease-out), transform var(--d-fast) var(--ease-out), opacity var(--d-fast) var(--ease-out);
  text-align: left;
}

.btn--md {
  min-height: 48px;
  padding: 0 var(--sp-5);
  font-size: var(--fs-body-s);
}
.btn--lg {
  min-height: 64px;
  padding: 0 var(--sp-5);
  font-size: var(--fs-body);
}
.btn--xl {
  min-height: 76px;
  padding: 0 var(--sp-6);
  font-size: var(--fs-title-s);
}

.btn--block {
  display: flex;
  width: 100%;
}

.btn__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.btn--block .btn__text {
  flex: 1;
}
.btn__label {
  line-height: 1.28;
}
.btn__hint {
  font-size: var(--fs-caption);
  font-weight: 450;
  /* 层次靠字号与字重，不靠压透明度。
     primary 变体上文字是深色压在强调色上，透明度一降对比度就掉到 4.3:1 以下。 */
  opacity: 0.85;
  line-height: 1.3;
}
.btn__right {
  margin-left: auto;
  opacity: 0.7;
}

/* ---- 变体 ---- */
.btn--primary {
  background: var(--c-accent);
  color: var(--c-on-accent);
  box-shadow: var(--sh-accent);
}
.btn--primary:active {
  background: var(--c-accent-press);
}

.btn--soft {
  background: var(--c-surface-raised);
  border-color: var(--c-border);
  color: var(--c-text-1);
}
.btn--soft:active {
  background: var(--c-surface-hover);
  border-color: var(--c-border-strong);
}

.btn--ghost {
  background: transparent;
  border-color: var(--c-border);
  color: var(--c-text-2);
}
.btn--ghost:active {
  color: var(--c-text-1);
  border-color: var(--c-border-strong);
}

.btn--quiet {
  background: transparent;
  color: var(--c-text-3);
  padding: 0 var(--sp-4);
}
.btn--quiet:active {
  color: var(--c-text-1);
}

.btn--danger {
  background: var(--c-danger-weak);
  border-color: color-mix(in srgb, var(--c-danger) 42%, transparent);
  color: var(--c-danger);
}
.btn--danger:active {
  background: color-mix(in srgb, var(--c-danger) 20%, transparent);
}

.btn--disabled {
  opacity: 0.42;
  pointer-events: none;
}

.btn__spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: btn-spin 0.7s linear infinite;
}
@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
