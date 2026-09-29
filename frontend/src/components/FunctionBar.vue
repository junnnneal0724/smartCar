<script setup lang="ts">
/**
 * 底部功能条（88px，最多 4 项）。
 *
 * 车内不做娱乐，所以只有四项：行程 / 环境 / 停靠 / 帮助。
 * 每一项都是"乘客此刻能做的事"，没有一个是"管理"。
 * 帮助永远在最右，且从任何页面都只需要一次点击。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IconBase from './IconBase.vue';

const route = useRoute();
const router = useRouter();

const items = [
  { key: 'trip', label: '行程', icon: 'route', to: '/trip' },
  { key: 'cabin', label: '环境', icon: 'fan', to: '/cabin' },
  { key: 'stop', label: '停靠', icon: 'pin', to: '/stop' },
  { key: 'help', label: '帮助', icon: 'question', to: '/help' },
];

const activeKey = computed(() => {
  const p = route.path;
  if (p.startsWith('/trip')) return 'trip';
  if (p.startsWith('/cabin') || p.startsWith('/preferences')) return 'cabin';
  if (p.startsWith('/stop') || p.startsWith('/destination') || p.startsWith('/alight') || p.startsWith('/arriving')) return 'stop';
  if (p.startsWith('/help') || p.startsWith('/share')) return 'help';
  return '';
});
</script>

<template>
  <nav class="fbar" aria-label="主要功能">
    <button
      v-for="it in items"
      :key="it.key"
      class="fbar__item"
      :class="{ 'fbar__item--on': activeKey === it.key }"
      type="button"
      @click="router.push(it.to)"
    >
      <IconBase :name="it.icon" :size="24" />
      <span class="fbar__label">{{ it.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.fbar {
  height: var(--h-functionbar);
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  background: var(--c-surface-sunken);
  border-top: 1px solid var(--c-border);
}
.fbar__item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  min-height: 56px;
  border-radius: var(--r-card);
  color: var(--c-text-2);
  font-size: var(--fs-body);
  font-weight: 550;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  transition: background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out),
    border-color var(--d-fast) var(--ease-out), transform var(--d-fast) var(--ease-out);
}
.fbar__item:active {
  transform: scale(0.985);
  background: var(--c-surface-hover);
}
.fbar__item--on {
  color: var(--c-accent);
  border-color: var(--c-accent-border);
  background: var(--c-accent-weak);
}
.fbar__label {
  letter-spacing: 0.04em;
}
</style>
