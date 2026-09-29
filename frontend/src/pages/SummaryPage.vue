<script setup lang="ts">
/**
 * 行程小结（/summary）。
 *
 * 场景前提：车已经停稳、乘客还没下车。这一屏是"这段路的三分钟复盘"，
 * 不是账单页更不是数据看板：四个数字 + 两张图 + 一份明细，够了。
 * 收款在手机端完成，车机只负责让乘客看懂。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import SpeedCurveChart from '@/charts/SpeedCurveChart.vue';
import FareDonutChart from '@/charts/FareDonutChart.vue';
import { useRideStore } from '@/stores/ride';
import { formatMoney } from '@/map/geo';
import type { FareBreakdown, SummaryView } from '@/api/types';

const router = useRouter();
const ride = useRideStore();

const data = ref<SummaryView | null>(null);
const loading = ref(true);
const error = ref('');

/** 拉小结。失败就地给可重试的错误态，不弹窗。 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    data.value = await ride.summary();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '小结暂时取不到，稍后再试一次';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

const trip = computed(() => data.value?.ride ?? ride.view);
const stats = computed(() => data.value?.stats ?? null);
const fare = computed<FareBreakdown>(
  () => data.value?.fare ?? trip.value?.fare ?? { base: 0, distance: 0, time: 0, discount: 0, total: 0 },
);

const rideNo = computed(() => trip.value?.rideNo ?? '');
const originName = computed(() => trip.value?.origin.name ?? '上车点');
const destName = computed(() => trip.value?.dest.name ?? '目的地');

const metrics = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { key: 'distance', label: '总里程', value: (s.distanceM / 1000).toFixed(1), unit: '公里' },
    { key: 'duration', label: '总时长', value: String(Math.max(1, Math.round(s.durationS / 60))), unit: '分钟' },
    { key: 'speed', label: '平均车速', value: String(Math.round(s.avgSpeedKph)), unit: 'km/h' },
    { key: 'co2', label: '减碳量', value: String(Math.round(s.co2SavedG)), unit: '克' },
  ];
});

/** 把克数翻成人话。折算系数刻意保守，不吹"种了一片森林" */
const treeLine = computed(() => {
  const grams = Math.max(0, stats.value?.co2SavedG ?? 0);
  if (grams <= 0) return '纯电出行，这一趟没有尾气排放。';
  const trees = Math.floor((grams / 1000) * 0.05);
  if (trees >= 1) return `按一棵树一年吸收的二氧化碳折算，大约相当于 ${trees} 棵树。`;
  const days = Math.max(1, Math.round(grams / 55));
  return `这点量不算多，大约相当于一棵树 ${days} 天的吸收量。`;
});

const fareRows = computed(() => [
  { key: 'base', label: '起步价', amount: fare.value.base, minus: false },
  { key: 'distance', label: '里程费', amount: fare.value.distance, minus: false },
  { key: 'time', label: '时长费', amount: fare.value.time, minus: false },
  { key: 'discount', label: '优惠', amount: fare.value.discount, minus: true },
]);

function amountText(row: { amount: number; minus: boolean }): string {
  if (row.minus && row.amount > 0) return `-¥${formatMoney(row.amount)}`;
  return `¥${formatMoney(row.amount)}`;
}
</script>

<template>
  <div class="page">
    <header class="page__head">
      <div class="head__meta">
        <p class="page__eyebrow">行程小结</p>
        <p v-if="rideNo" class="head__no num">行程号 {{ rideNo }}</p>
      </div>
      <h1 class="page__title">行程已结束</h1>
      <p class="head__route">
        <IconBase name="pin" :size="18" class="head__pin" />
        <span class="head__place">{{ originName }}</span>
        <IconBase name="chevronRight" :size="16" class="head__arrow" />
        <span class="head__place">{{ destName }}</span>
      </p>
    </header>

    <div class="page__body">
      <template v-if="loading">
        <div class="panel"><SkeletonBlock :rows="1" :height="76" /></div>
        <div class="charts">
          <div class="panel"><SkeletonBlock :rows="3" :height="40" /></div>
          <div class="panel"><SkeletonBlock :rows="3" :height="40" /></div>
        </div>
        <div class="panel"><SkeletonBlock :rows="5" :height="16" /></div>
      </template>

      <div v-else-if="error" class="panel fail" role="alert">
        <p class="fail__title">小结没取到</p>
        <p class="fail__detail">{{ error }}</p>
        <AppButton variant="soft" size="lg" icon="sync" @click="load">重新加载</AppButton>
      </div>

      <template v-else>
        <section class="strip" aria-label="这次行程的几个数字">
          <div v-for="m in metrics" :key="m.key" class="strip__cell">
            <p class="strip__label">{{ m.label }}</p>
            <p class="strip__value">
              <span class="num strip__number">{{ m.value }}</span>
              <span class="strip__unit">{{ m.unit }}</span>
            </p>
          </div>
        </section>

        <p class="tree">
          <IconBase name="leaf" :size="18" />
          {{ treeLine }}
        </p>

        <div class="charts">
          <section class="panel charts__curve">
            <h2 class="panel__title">这段路的速度</h2>
            <SpeedCurveChart :points="data?.speedCurve ?? []" />
          </section>
          <section class="panel charts__fare">
            <h2 class="panel__title">钱花在哪了</h2>
            <FareDonutChart :fare="fare" />
          </section>
        </div>

        <section class="panel bill">
          <div class="bill__head">
            <h2 class="panel__title">费用明细</h2>
            <span class="bill__paid">已在手机端支付</span>
          </div>
          <ul class="bill__list">
            <li v-for="r in fareRows" :key="r.key" class="bill__row">
              <span class="bill__label">{{ r.label }}</span>
              <span class="bill__amount num">{{ amountText(r) }}</span>
            </li>
            <li class="bill__row bill__row--total">
              <span class="bill__label">合计</span>
              <span class="bill__amount num">¥{{ formatMoney(fare.total) }}</span>
            </li>
          </ul>
          <p class="bill__note">车机不收款，也不保存支付信息，账单和电子发票都在手机端。</p>
        </section>
      </template>
    </div>

    <footer class="page__foot">
      <AppButton
        variant="primary"
        size="lg"
        icon="star"
        hint="大约 10 秒，帮我们把车开得更好"
        @click="router.push('/rate')"
      >
        为本次行程评分
      </AppButton>
      <AppButton variant="soft" size="lg" icon="share" @click="router.push('/share')">
        把行程同步到手机
      </AppButton>
      <AppButton variant="ghost" size="lg" @click="router.push('/farewell')">完成</AppButton>
    </footer>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: var(--sp-6);
  gap: var(--sp-5);
  /* 只让内容区滚动：主操作永远钉在屏底，任何情况下都不用翻屏去找它 */
  overflow: hidden;
}

/* ---- 头部 ---- */
.page__head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.head__meta {
  display: flex;
  align-items: baseline;
  gap: var(--sp-4);
}
.page__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.head__no {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.page__title {
  font-size: var(--fs-display);
  font-weight: 700;
}
.head__route {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body);
  color: var(--c-text-2);
}
.head__pin {
  color: var(--c-text-3);
}
.head__arrow {
  color: var(--c-text-3);
}
.head__place {
  max-width: 26ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 主体 ---- */
.page__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  overflow-y: auto;
  padding-right: var(--sp-1);
}

.panel {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-panel);
  padding: var(--sp-5);
}
.panel__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
  margin-bottom: var(--sp-3);
}

/* ---- 数字条：一块面板 + 1px 分隔线，不做卡片墙 ---- */
.strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-panel);
  overflow: hidden;
}
.strip__cell {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-4) var(--sp-5);
}
.strip__cell + .strip__cell {
  border-left: 1px solid var(--c-border);
}
.strip__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.08em;
}
.strip__value {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
}
.strip__number {
  font-size: var(--fs-hero);
  font-weight: 700;
  line-height: var(--lh-tight);
  color: var(--c-text-1);
}
.strip__unit {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}

.tree {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-2);
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.tree :deep(svg) {
  color: var(--c-success);
}

/* ---- 图表 ---- */
.charts {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: var(--sp-4);
}

/* ---- 费用明细 ---- */
.bill__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
}
.bill__paid {
  font-size: var(--fs-caption);
  color: var(--c-success);
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  padding: 4px var(--sp-3);
}
.bill__list {
  display: flex;
  flex-direction: column;
}
.bill__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: 10px 0;
  font-size: var(--fs-body-s);
}
.bill__row + .bill__row {
  border-top: 1px solid var(--c-border);
}
.bill__label {
  color: var(--c-text-2);
}
.bill__amount {
  color: var(--c-text-1);
  font-weight: 600;
}
.bill__row--total {
  margin-top: var(--sp-1);
  border-top: 1px solid var(--c-border-strong);
  font-size: var(--fs-body);
}
.bill__row--total .bill__label {
  color: var(--c-text-1);
}
.bill__row--total .bill__amount {
  font-size: var(--fs-title);
  font-weight: 700;
}
.bill__note {
  margin-top: var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: var(--lh-body);
}

/* ---- 失败 ---- */
.fail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-3);
}
.fail__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}
.fail__detail {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}

/* ---- 底部操作 ---- */
.page__foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.page__foot :deep(.btn:first-child) {
  flex: 1.4;
}
.page__foot :deep(.btn:nth-child(2)) {
  flex: 1;
}
</style>
