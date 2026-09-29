<script setup lang="ts">
/** 骨架屏：车内屏幕上"转圈"没有意义，用形状预示即将出现的内容更安定 */
withDefaults(defineProps<{ rows?: number; height?: number; radius?: string; width?: string }>(), {
  rows: 3,
  height: 16,
  width: '100%',
});
</script>

<template>
  <div class="sk" role="status" aria-label="加载中">
    <span
      v-for="i in rows"
      :key="i"
      class="sk__bar"
      :style="{
        height: `${height}px`,
        width: i === rows && rows > 1 ? '62%' : width,
        borderRadius: radius ?? 'var(--r-input)',
        animationDelay: `${i * 90}ms`,
      }"
    />
  </div>
</template>

<style scoped>
.sk {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  width: 100%;
}
.sk__bar {
  display: block;
  background: linear-gradient(
    90deg,
    var(--c-surface-raised) 0%,
    color-mix(in srgb, var(--c-border) 60%, var(--c-surface-raised)) 50%,
    var(--c-surface-raised) 100%
  );
  background-size: 220% 100%;
  animation: sk-shimmer 1.5s var(--ease-in-out) infinite;
}
@keyframes sk-shimmer {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -120% 0;
  }
}
</style>
