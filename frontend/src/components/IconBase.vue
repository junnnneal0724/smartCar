<script setup lang="ts">
import { computed } from 'vue';
import { icons } from './icons';

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number | string;
    /** 描边粗细：车机上一般不用改，只在超大号图标时略调细 */
    stroke?: number;
  }>(),
  { size: 20, stroke: 1.8 },
);

const markup = computed(() => icons[props.name] ?? icons.info);
const px = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));
</script>

<template>
  <svg
    class="icon"
    :style="{ width: px, height: px }"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="markup"
  />
</template>

<style scoped>
.icon {
  display: block;
  flex: none;
  overflow: visible;
}
</style>
