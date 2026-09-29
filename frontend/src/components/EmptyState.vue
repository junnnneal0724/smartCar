<script setup lang="ts">
import IconBase from './IconBase.vue';

/** 空状态：必须解释"为什么空"和"接下来能做什么"，而不是只画一个灰色图标 */
withDefaults(
  defineProps<{
    icon?: string;
    title: string;
    detail?: string;
  }>(),
  { icon: 'info' },
);
</script>

<template>
  <div class="empty">
    <span class="empty__badge"><IconBase :name="icon" :size="26" /></span>
    <p class="empty__title">{{ title }}</p>
    <p v-if="detail" class="empty__detail">{{ detail }}</p>
    <div v-if="$slots.action" class="empty__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  padding: var(--sp-7) var(--sp-5);
  text-align: center;
}
.empty__badge {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-3);
}
.empty__title {
  font-size: var(--fs-title-s);
  font-weight: 600;
  color: var(--c-text-1);
}
.empty__detail {
  max-width: 46ch;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: var(--lh-body);
}
.empty__action {
  margin-top: var(--sp-2);
}
</style>
