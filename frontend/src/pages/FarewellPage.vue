<script setup lang="ts">
/**
 * 送别页（/farewell）。
 *
 * 乘客即将下车。这一屏要做的不是挽留，而是把两件事说清楚：
 *   1. 这趟行程你得到了什么（里程、时长、减碳）
 *   2. 这台公共设备不会带走你的任何个人痕迹（这是最关键的信任点）
 *
 * 倒计时只是"回到待机屏"的告知，不是催促，所以做成细环加一行小字。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { formatDistance, formatDuration } from '@/map/geo';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';

const AUTO_BACK_S = 30;
const CLEAR_ITEMS = [
  '行程记录已同步到你的手机',
  '车内屏幕上的个人标识已清除',
  '摄像头录像将加密保存 30 天后自动删除',
];

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

const router = useRouter();
const ride = useRideStore();
const session = useSessionStore();

const remainS = ref(AUTO_BACK_S);
const leaving = ref(false);
let timer: number | null = null;

const ringOffset = computed(() => RING_C * (1 - remainS.value / AUTO_BACK_S));
const originName = computed(() => ride.view?.origin.name ?? '上车点');
const destName = computed(() => ride.view?.dest.name ?? '下车点');

const distanceText = computed(() => {
  const traveled = ride.view?.traveledM ?? 0;
  const planned = ride.view?.planDistanceM ?? 0;
  const m = traveled > 0 ? traveled : planned;
  return m > 0 ? formatDistance(m) : '里程统计中';
});

const durationText = computed(() => {
  const v = ride.view;
  if (!v) return '时长统计中';
  if (v.startedAt && v.endedAt && v.endedAt > v.startedAt) {
    return formatDuration((v.endedAt - v.startedAt) / 1000);
  }
  return formatDuration(v.planDurationS);
});

const co2Text = computed(() => {
  const g = ride.view?.co2SavedG ?? 0;
  if (g <= 0) return '本次行程由电动车完成，减碳数据还在统计中。';
  if (g >= 1000) return `本次行程减少约 ${(g / 1000).toFixed(1)} 千克碳排放。`;
  return `本次行程减少约 ${Math.round(g)} 克碳排放。`;
});

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

async function backToIdle(): Promise<void> {
  if (leaving.value) return;
  leaving.value = true;
  stopTimer();
  await session.endSession();
  router.push('/idle');
}

function startTimer(): void {
  stopTimer();
  timer = window.setInterval(() => {
    if (remainS.value <= 1) {
      remainS.value = 0;
      backToIdle().catch(() => undefined);
      return;
    }
    remainS.value -= 1;
  }, 1000);
}

onMounted(() => {
  if (!ride.view) ride.refresh().catch(() => undefined);
  startTimer();
});

onBeforeUnmount(stopTimer);
</script>

<template>
  <div class="farewell">
    <div class="farewell__main">
      <header class="farewell__head">
        <p class="farewell__eyebrow">行程结束</p>
        <h1 class="farewell__title">谢谢你，一路平安</h1>
        <p class="farewell__lead">车门就在你旁边，慢慢来，不着急。</p>
      </header>

      <section class="card">
        <SkeletonBlock v-if="!ride.view" :rows="3" :height="16" />
        <template v-else>
          <p class="trip__route">{{ originName }} 到 {{ destName }}</p>
          <dl class="trip__stats">
            <div class="trip__stat">
              <dt>本次里程</dt>
              <dd class="num">{{ distanceText }}</dd>
            </div>
            <div class="trip__stat">
              <dt>本次时长</dt>
              <dd class="num">{{ durationText }}</dd>
            </div>
          </dl>
        </template>
      </section>

      <section class="card card--leaf">
        <span class="leaf__badge"><IconBase name="leaf" :size="24" /></span>
        <div class="leaf__body">
          <p class="leaf__text">{{ co2Text }}</p>
          <p class="leaf__hint">按同里程燃油车折算，只作为参考。</p>
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">离开前，这台屏幕会做三件事</h2>
        <ul class="clear__list">
          <li v-for="item in CLEAR_ITEMS" :key="item" class="clear__item">
            <span class="clear__icon"><IconBase name="check" :size="18" /></span>
            <span class="clear__text">{{ item }}</span>
          </li>
        </ul>
        <p class="clear__note">这台车是公共设备，下一位乘客看不到你的任何信息。</p>
      </section>
    </div>

    <footer class="farewell__foot">
      <div class="countdown">
        <svg class="countdown__ring" viewBox="0 0 48 48" aria-hidden="true">
          <circle class="countdown__track" cx="24" cy="24" :r="RING_R" />
          <circle
            class="countdown__value"
            cx="24"
            cy="24"
            :r="RING_R"
            :stroke-dasharray="RING_C"
            :stroke-dashoffset="ringOffset"
          />
        </svg>
        <p class="countdown__text" aria-live="off">
          屏幕将在 <span class="num">{{ remainS }}</span> 秒后回到待机屏
        </p>
      </div>

      <div class="farewell__actions">
        <AppButton variant="soft" size="lg" icon="share" @click="router.push('/share')">
          把行程带到手机
        </AppButton>
        <AppButton
          class="farewell__done"
          variant="primary"
          size="lg"
          icon="door"
          :loading="leaving"
          @click="backToIdle"
        >
          好了，我下车了
        </AppButton>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.farewell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: var(--sp-5);
  padding: var(--sp-6);
  overflow: hidden;
}
.farewell__main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  overflow-y: auto;
}
.farewell__head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.farewell__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.farewell__title {
  font-size: var(--fs-display);
  font-weight: 700;
}
.farewell__lead {
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

/* ---------------------------------------------------------------- 卡片 */
.card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
}
.card__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
}

.trip__route {
  font-size: var(--fs-title);
  font-weight: 600;
}
.trip__stats {
  display: flex;
  gap: var(--sp-7);
  margin: 0;
}
.trip__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.trip__stat dt {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.trip__stat dd {
  margin: 0;
  font-size: var(--fs-title-s);
  font-weight: 600;
}

.card--leaf {
  flex-direction: row;
  align-items: center;
  gap: var(--sp-4);
}
.leaf__badge {
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--c-success-weak);
  border: 1px solid var(--c-border);
  color: var(--c-success);
}
.leaf__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.leaf__text {
  font-size: var(--fs-title-s);
  font-weight: 600;
}
.leaf__hint {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}

/* ---------------------------------------------------------------- 清理清单 */
.clear__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.clear__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 40px;
}
.clear__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--c-accent-weak);
  color: var(--c-accent);
}
.clear__text {
  font-size: var(--fs-body);
  color: var(--c-text-1);
}
.clear__note {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}

/* ---------------------------------------------------------------- 底部 */
.farewell__foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
}
.countdown {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.countdown__ring {
  flex: none;
  width: 34px;
  height: 34px;
  transform: rotate(-90deg);
}
.countdown__track,
.countdown__value {
  fill: none;
  stroke-width: 2.5;
}
.countdown__track {
  stroke: var(--c-border);
}
.countdown__value {
  stroke: var(--c-accent);
  stroke-linecap: round;
  transition: stroke-dashoffset var(--d-slow) linear;
}
.countdown__text {
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}

.farewell__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.farewell__done {
  min-width: 280px;
}
</style>
