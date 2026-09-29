<script setup lang="ts">
/**
 * 费用构成环形图。
 *
 * 车机不收款，这一屏只回答一个问题："钱花在哪了"。
 * 所以不做 legend，每个扇区直接写名称与金额，中心放合计；
 * 优惠不做成一个扇区（它不是花费），只在下方用一行说明。
 *
 * 金额单位是分，展示一律走 formatMoney()。
 */
import { computed, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import EmptyState from '@/components/EmptyState.vue';
import { formatMoney } from '@/map/geo';
import { useChart } from './useChart';
import { CHART_FONT_FAMILY, CHART_FONT_SIZE, chartPalette, readChartTokens } from './theme';

const props = defineProps<{
  fare: { base: number; distance: number; time: number; discount: number; total: number };
}>();

interface Slice {
  key: string;
  name: string;
  value: number;
}

const el = ref<HTMLElement | null>(null);

const slices = computed<Slice[]>(() => {
  const f = props.fare;
  const parts: Slice[] = [
    { key: 'base', name: '起步价', value: Math.max(0, f.base) },
    { key: 'distance', name: '里程费', value: Math.max(0, f.distance) },
    { key: 'time', name: '时长费', value: Math.max(0, f.time) },
  ];
  return parts.filter((p) => p.value > 0);
});

const total = computed(() => Math.max(0, props.fare.total));
const discount = computed(() => Math.max(0, props.fare.discount));
const hasData = computed(() => slices.value.length > 0 && total.value > 0);

function buildOption(): EChartsOption | null {
  if (!hasData.value) return null;

  const t = readChartTokens();
  // 颜色在 buildOption 里现取，主题一换就跟着换
  const palette = chartPalette(t);
  return {
    series: [
      {
        type: 'pie',
        name: '费用构成',
        // 半径压得比较小：把外圈的空间留给直接标注的名称与金额，标签不会被画布裁掉
        radius: ['44%', '60%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        minAngle: 8,
        labelLayout: { hideOverlap: true },
        // 扇区之间留一道表面色的缝，等于"用底色切分"，比描边更柔
        itemStyle: { borderColor: t.surface, borderWidth: 3 },
        // 车机是触摸屏，不存在 hover，索性关掉强调态
        emphasis: { disabled: true },
        label: {
          show: true,
          position: 'outside',
          color: t.text2,
          fontSize: CHART_FONT_SIZE,
          fontFamily: CHART_FONT_FAMILY,
          lineHeight: 16,
          align: 'center',
        },
        labelLine: {
          show: true,
          length: 8,
          length2: 10,
          lineStyle: { color: t.borderStrong, width: 1 },
        },
        data: slices.value.map((s, i) => ({
          name: s.name,
          value: s.value,
          itemStyle: { color: palette[i % palette.length] },
          // 直接标注：名称 + 金额，两行，替代 legend
          label: { formatter: `${s.name}\n¥${formatMoney(s.value)}` },
        })),
      },
    ],
  };
}

const { hasData: drawn } = useChart(el, buildOption);
</script>

<template>
  <section class="donut">
    <template v-if="drawn">
      <div class="donut__ring">
        <div ref="el" class="donut__canvas" role="img" :aria-label="`费用构成，合计 ${formatMoney(total)} 元`" />
        <div class="donut__center">
          <p class="donut__center-label">本次合计</p>
          <p class="donut__center-value num">¥{{ formatMoney(total) }}</p>
        </div>
      </div>
      <p class="donut__note">
        <template v-if="discount > 0">已优惠 ¥{{ formatMoney(discount) }}，优惠在手机端结算时抵扣。</template>
        <template v-else>每一笔都列在扇区上，账单已在手机端结清。</template>
      </p>
    </template>

    <EmptyState
      v-else
      icon="info"
      title="这次没有产生费用"
      detail="行程太短或者账单还在结算中，回到这一屏再看一次就好。"
    />
  </section>
</template>

<style scoped>
.donut {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-height: 0;
}
.donut__ring {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.donut__canvas {
  width: 100%;
  height: 232px;
}
.donut__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}
.donut__center-label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.08em;
}
.donut__center-value {
  font-size: var(--fs-title-l);
  font-weight: 700;
  color: var(--c-text-1);
  line-height: var(--lh-tight);
}
.donut__note {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: var(--lh-body);
}
</style>
