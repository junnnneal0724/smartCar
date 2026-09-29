<script setup lang="ts">
/**
 * 旅程解释（/trip/explain）。
 *
 * 这是这台车最值钱的一屏：乘客被困在一个没有司机的盒子里，
 * "刚才为什么停""为什么绕了一下"如果没人回答，信任就没了。
 * 所以这里只有三件事：一句话结论、时间都花在哪了、以及每条行为的时间线。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import EmptyState from '@/components/EmptyState.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import TimeStackedChart from '@/charts/TimeStackedChart.vue';
import { useRideStore } from '@/stores/ride';
import { formatTime } from '@/map/geo';
import type { ExplainView } from '@/api/types';

const router = useRouter();
const ride = useRideStore();

const data = ref<ExplainView | null>(null);
const loading = ref(true);
const error = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    data.value = await ride.explain();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '这段路的解释暂时取不到，稍后再试一次';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

/** 后端按时间倒序给，这里翻成从早到晚：一条时间线应该顺着读 */
const timeline = computed(() =>
  [...(data.value?.timeline ?? [])].sort((a, b) => a.created_at - b.created_at),
);
const segments = computed(() => data.value?.segments ?? []);
</script>

<template>
  <div class="page">
    <header class="page__head">
      <AppButton variant="ghost" size="lg" icon="chevronLeft" @click="router.push('/trip')">
        回到地图
      </AppButton>
      <div class="head__text">
        <p class="page__eyebrow">旅程解释</p>
        <h1 class="page__title">这趟车都经历了什么</h1>
        <p class="page__lead">把这段时间都花在哪了，一次说清楚。</p>
      </div>
    </header>

    <div class="page__body">
      <template v-if="loading">
        <div class="panel"><SkeletonBlock :rows="2" :height="30" /></div>
        <div class="columns">
          <div class="panel"><SkeletonBlock :rows="4" :height="24" /></div>
          <div class="panel"><SkeletonBlock :rows="5" :height="20" /></div>
        </div>
      </template>

      <div v-else-if="error" class="panel fail" role="alert">
        <p class="fail__title">解释没取到</p>
        <p class="fail__detail">{{ error }}</p>
        <AppButton variant="soft" size="lg" icon="sync" @click="load">重新加载</AppButton>
      </div>

      <template v-else>
        <!-- 核心价值：把黑箱讲明白的那一句话 -->
        <section class="conclusion" aria-label="本次行程的结论">
          <span class="conclusion__badge"><IconBase name="sparkle" :size="22" /></span>
          <p class="conclusion__text">{{ data?.conclusion }}</p>
        </section>

        <div class="columns">
          <section class="panel columns__chart">
            <h2 class="panel__title">这段时间都花在哪了</h2>
            <TimeStackedChart :segments="segments" />
          </section>

          <section class="panel columns__timeline">
            <h2 class="panel__title">车辆动作记录</h2>

            <ol v-if="timeline.length" class="tl">
              <li v-for="e in timeline" :key="e.id" class="tl__item">
                <span class="tl__mark"><IconBase :name="e.icon || 'info'" :size="18" /></span>
                <div class="tl__body">
                  <div class="tl__row">
                    <p class="tl__title">{{ e.title }}</p>
                    <time class="tl__time num" :datetime="String(e.created_at)">{{ formatTime(e.created_at) }}</time>
                  </div>
                  <p class="tl__detail">{{ e.detail }}</p>
                </div>
              </li>
            </ol>

            <EmptyState
              v-else
              icon="clock"
              title="行程刚开始，还没有足够的行为记录"
              detail="等车跑起来，每一次礼让、等待和绕行都会记在这里，随时可以回来看看刚才发生了什么。"
            >
              <template #action>
                <AppButton variant="soft" size="lg" icon="map" @click="router.push('/trip')">
                  回到地图
                </AppButton>
              </template>
            </EmptyState>
          </section>
        </div>
      </template>
    </div>
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
  overflow: hidden;
}

/* ---- 头部 ---- */
.page__head {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: var(--sp-5);
}
.head__text {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.page__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.page__title {
  font-size: var(--fs-display);
  font-weight: 700;
}
.page__lead {
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

/* ---- 主体 ---- */
.page__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.panel {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-panel);
  padding: var(--sp-5);
  min-height: 0;
}
.panel__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
  margin-bottom: var(--sp-3);
}

.conclusion {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-5);
  border-radius: var(--r-panel);
  background: var(--c-accent-weak);
  border: 1px solid var(--c-accent-border);
}
.conclusion__badge {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50%;
  background: var(--c-surface);
  color: var(--c-accent);
}
.conclusion__text {
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--c-text-1);
  line-height: 1.45;
}

.columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: var(--sp-4);
}
.columns__chart,
.columns__timeline {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* ---- 时间线 ---- */
.tl {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.tl__item {
  position: relative;
  padding-left: 52px;
}
.tl__item::before {
  content: '';
  position: absolute;
  left: 17px;
  top: 40px;
  bottom: calc(var(--sp-4) * -1);
  width: 1px;
  background: var(--c-border);
}
.tl__item:last-child::before {
  display: none;
}
.tl__mark {
  position: absolute;
  left: 0;
  top: 0;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-accent);
}
.tl__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tl__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
}
.tl__title {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-text-1);
}
.tl__time {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  flex: none;
}
.tl__detail {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
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
</style>
