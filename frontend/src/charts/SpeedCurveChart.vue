<script setup lang="ts">
/**
 * 本次行程的速度曲线（面积图）。
 *
 * 目的不是"展示数据"，而是让乘客看懂"这段路是怎么走的"：
 * 曲线哪里平、哪里陡，一眼就知道车在哪儿慢下来了。
 * 所以坐标轴、网格线全部去掉，只保留最高速的一个直接标注和一句话结论。
 */
import { computed, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import EmptyState from '@/components/EmptyState.vue';
import { useChart } from './useChart';
import { CHART_FONT_FAMILY, CHART_FONT_SIZE, CHART_FONT_SIZE_STRONG, readChartTokens, withAlpha } from './theme';

const props = defineProps<{ points: { t: number; v: number }[] }>();

interface CurvePoint {
  minute: number;
  v: number;
}

const el = ref<HTMLElement | null>(null);

/**
 * 后端给的 t 是路线采样点的绝对时间戳（毫秒），这里换算成"出发后的分钟数"。
 * 顺手兼容后端将来直接给"秒"的情况：看数量级判断单位。
 */
const curve = computed<{ points: CurvePoint[]; bySample: boolean }>(() => {
  const raw = props.points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (raw.length < 2) return { points: [], bySample: false };

  const base = raw[0].t;
  const msUnit = Math.abs(base) > 1e11;
  const points = raw.map((p) => ({
    minute: Math.max(0, (p.t - base) / (msUnit ? 60000 : 60)),
    v: Math.max(0, p.v),
  }));

  // 采样点时间戳全都一样时，退化成"按采样顺序"，至少让曲线画得出来
  if (points[points.length - 1].minute <= 0) {
    return { points: points.map((p, i) => ({ minute: i, v: p.v })), bySample: true };
  }
  return { points, bySample: false };
});

const stats = computed(() => {
  const pts = curve.value.points;
  if (pts.length < 2) return null;
  const sum = pts.reduce((acc, p) => acc + p.v, 0);
  const max = pts.reduce((acc, p) => (p.v > acc.v ? p : acc), pts[0]);
  return {
    avg: Math.round(sum / pts.length),
    max: Math.round(max.v),
    maxPoint: max,
  };
});

const conclusion = computed(() => {
  const s = stats.value;
  if (!s) return '';
  return `全程平均 ${s.avg} km/h，最高 ${s.max} km/h`;
});

const axisNote = computed(() =>
  curve.value.bySample ? '横轴是采样顺序，纵轴是当时的车速' : '横轴是出发后的分钟，纵轴是当时的车速',
);

function buildOption(): EChartsOption | null {
  const pts = curve.value.points;
  const s = stats.value;
  if (pts.length < 2 || !s) return null;

  const t = readChartTokens();
  const top = Math.max(20, Math.ceil(s.maxPoint.v / 10) * 10);

  return {
    // 留白是手写的：顶部放最高速标注，底部放时间刻度（ECharts 6 已废弃 grid.containLabel）
    grid: { left: 12, right: 22, top: 46, bottom: 26 },
    xAxis: {
      type: 'value',
      min: 0,
      max: pts[pts.length - 1].minute,
      splitNumber: 3,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        show: true,
        color: t.text3,
        fontSize: CHART_FONT_SIZE,
        fontFamily: CHART_FONT_FAMILY,
        formatter: '{value}',
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: top,
      show: false,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    series: [
      {
        type: 'line',
        name: '车速',
        smooth: 0.35,
        symbol: 'none',
        silent: true,
        lineStyle: { width: 2.5, color: t.accent, cap: 'round' },
        // 面积用"accent 到透明"的渐变，而不是实心色块
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(t.accent, 0.3) },
              { offset: 1, color: withAlpha(t.accent, 0) },
            ],
          },
        },
        data: pts.map((p): [number, number] => [Number(p.minute.toFixed(2)), Number(p.v.toFixed(1))]),
        // 只标最高速这一个点，别把每个点都写成数字
        markPoint: {
          silent: true,
          symbol: 'circle',
          symbolSize: 9,
          itemStyle: { color: t.accent, borderColor: t.surface, borderWidth: 2 },
          label: {
            show: true,
            position: 'top',
            distance: 8,
            formatter: '{c} km/h',
            color: t.text1,
            fontSize: CHART_FONT_SIZE_STRONG,
            fontFamily: CHART_FONT_FAMILY,
            fontWeight: 600,
            backgroundColor: t.surfaceRaised,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: [4, 8],
          },
          data: [
            {
              name: '最高速',
              coord: [Number(s.maxPoint.minute.toFixed(2)), Number(s.maxPoint.v.toFixed(1))],
              value: s.max,
            },
          ],
        },
      },
    ],
  };
}

const { hasData } = useChart(el, buildOption);
</script>

<template>
  <section class="curve">
    <template v-if="hasData">
      <p class="curve__conclusion">
        这段路 <span class="num">{{ conclusion }}</span>
      </p>
      <div ref="el" class="curve__canvas" role="img" :aria-label="`速度曲线，${conclusion}`" />
      <p class="curve__note">{{ axisNote }}</p>
    </template>

    <EmptyState
      v-else
      icon="route"
      title="这段行程还没有速度曲线"
      detail="采样点还不够，可能行程很短或者数据还在同步。回到地图稍后再来看一次。"
    />
  </section>
</template>

<style scoped>
.curve {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-height: 0;
}
.curve__conclusion {
  font-size: var(--fs-title-s);
  font-weight: 600;
  color: var(--c-text-1);
}
.curve__canvas {
  width: 100%;
  height: 176px;
}
.curve__note {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.02em;
}
</style>
