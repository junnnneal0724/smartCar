<script setup lang="ts">
/**
 * 旅程解释的时间分配（单条横向堆叠条）。
 *
 * 回答的是乘客心里那句话："为什么花了这么久"。
 * 所以只有一条、没有坐标轴、没有 legend：颜色负责区分，下面的列表负责讲清楚，
 * 点开每一段还能看到这段行为的解释文案。
 */
import { computed, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import EmptyState from '@/components/EmptyState.vue';
import IconBase from '@/components/IconBase.vue';
import { useChart } from './useChart';
import { useChartPalette } from './theme';

const props = defineProps<{
  segments: { type: string; label: string; detail: string; count: number; ratio: number }[];
}>();

const el = ref<HTMLElement | null>(null);
const expanded = ref<string>('');
const palette = useChartPalette();

const rows = computed(() => props.segments.filter((s) => Number.isFinite(s.ratio) && s.ratio > 0));
const totalRatio = computed(() => Math.min(1, Math.max(0.001, rows.value.reduce((a, s) => a + s.ratio, 0))));

function colorAt(i: number): string {
  const list = palette.value;
  return list[i % list.length];
}

function percent(ratio: number): number {
  return Math.round(ratio * 100);
}

function toggle(type: string): void {
  expanded.value = expanded.value === type ? '' : type;
}

function buildOption(): EChartsOption | null {
  const list = rows.value;
  if (list.length === 0) return null;

  const max = totalRatio.value;

  return {
    grid: { left: 0, right: 0, top: 6, bottom: 6 },
    xAxis: {
      type: 'value',
      min: 0,
      max,
      show: false,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category',
      data: [''],
      show: false,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    series: list.map((s, i) => {
      const first = i === 0;
      const last = i === list.length - 1;
      const radius = first && last ? 14 : first ? [14, 0, 0, 14] : last ? [0, 14, 14, 0] : 0;
      return {
        type: 'bar' as const,
        name: s.label,
        stack: 'allocation',
        barWidth: 44,
        silent: true,
        itemStyle: { color: colorAt(i), borderRadius: radius },
        data: [s.ratio],
      };
    }),
  };
}

const { hasData } = useChart(el, buildOption);
</script>

<template>
  <section class="stack">
    <template v-if="hasData">
      <div ref="el" class="stack__canvas" role="img" aria-label="本次行程的时间分配" />

      <ul class="stack__list">
        <li v-for="(s, i) in rows" :key="s.type" class="stack__item">
          <button
            class="seg pressable"
            type="button"
            :aria-expanded="expanded === s.type"
            @click="toggle(s.type)"
          >
            <span class="seg__dot" :style="{ background: colorAt(i) }" aria-hidden="true" />
            <span class="seg__label">{{ s.label }}</span>
            <span class="seg__pct num">{{ percent(s.ratio) }}%</span>
            <span class="seg__count">记录了 {{ s.count }} 次</span>
            <IconBase
              :name="expanded === s.type ? 'chevronDown' : 'chevronRight'"
              :size="18"
              class="seg__chev"
            />
          </button>
          <p v-if="expanded === s.type" class="seg__detail">
            {{ s.detail || '这一段暂时没有更多说明。' }}
          </p>
        </li>
      </ul>
    </template>

    <EmptyState
      v-else
      icon="clock"
      title="还没有时间分配可以看"
      detail="车刚出发，车辆行为记录还很少。跑一段路再回来，这里会把每一次等待和礼让都算给你看。"
    />
  </section>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 0;
}
.stack__canvas {
  width: 100%;
  height: 60px;
}

.stack__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.stack__item {
  display: flex;
  flex-direction: column;
  border-radius: var(--r-input);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  overflow: hidden;
}

.seg {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 56px;
  padding: 0 var(--sp-4);
  text-align: left;
  width: 100%;
  color: var(--c-text-2);
}
.seg:active {
  background: var(--c-surface-hover);
}
.seg__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.seg__label {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-text-1);
}
.seg__pct {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}
.seg__count {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.seg__chev {
  margin-left: auto;
  color: var(--c-text-3);
}

.seg__detail {
  padding: 0 var(--sp-4) var(--sp-4) calc(var(--sp-4) + 22px);
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: var(--lh-body);
}
</style>
