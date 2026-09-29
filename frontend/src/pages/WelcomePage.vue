<script setup lang="ts">
/**
 * 欢迎上车（meta.aside: 'none', meta.bar: 'none'，聚焦流程）。
 *
 * 一单一车的场景里，这一屏是**最重要的一次确认**：
 * 乘客刚拉开车门，必须能在两秒内确认"这就是我叫的那辆车"。
 * 所以车牌是全屏最大的字，行程摘要只留"从哪到哪、多远、多久"。
 *
 * 次要路径不是跳转而是就地展开：车牌对不上时，乘客最需要的是
 * "马上有人管我"和"马上能下车"，把他推去别的页面只会增加不安。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { helpApi } from '@/api';
import { formatDistance, formatDuration } from '@/map/geo';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';

const MODEL_NAMES: Record<string, string> = {
  SOLO: '独享舱',
  COMFORT: '舒适舱',
  SHARE: '共享舱',
};

const router = useRouter();
const session = useSessionStore();
const ride = useRideStore();

const showMismatch = ref(false);
const calling = ref(false);
const assistError = ref('');

const vehicle = computed(() => session.vehicle);
const view = computed(() => ride.view ?? session.ride);

const plateNo = computed(() => vehicle.value?.plateNo ?? '');
const cabinNo = computed(() => vehicle.value?.cabinNo ?? '');
const modelName = computed(() => {
  const code = vehicle.value?.modelCode ?? view.value?.modelCode ?? '';
  return MODEL_NAMES[code] ?? (code || '智行座舱');
});

const originName = computed(() => view.value?.origin.name ?? '上车点');
const destName = computed(() => view.value?.dest.name ?? '');
const distanceText = computed(() => (view.value ? formatDistance(view.value.planDistanceM) : ''));
const durationText = computed(() => (view.value ? formatDuration(view.value.planDurationS) : ''));

async function callAssist(): Promise<void> {
  if (calling.value) return;
  calling.value = true;
  assistError.value = '';
  try {
    await helpApi.callAssist('车牌核对');
    router.push('/help');
  } catch (e) {
    assistError.value = e instanceof Error ? e.message : '远程安全员暂时无法接通，请稍后重试';
  } finally {
    calling.value = false;
  }
}
</script>

<template>
  <div class="welcome">
    <header class="welcome__head">
      <p class="welcome__eyebrow">上车确认</p>
      <h1 class="welcome__title">欢迎上车，请先核对车牌</h1>
      <p class="welcome__lead">确认这是你叫的那辆车，再开始本趟行程。</p>
    </header>

    <div class="welcome__grid">
      <!-- 车辆身份：全屏最大的一块 -->
      <section class="card idcard" aria-label="车辆身份">
        <template v-if="vehicle">
          <p class="idcard__label">车牌号</p>
          <p class="idcard__plate num">{{ plateNo }}</p>
          <div class="idcard__meta">
            <span class="meta">
              <IconBase name="list" :size="16" />
              车内编号 <span class="num">{{ cabinNo }}</span>
            </span>
            <span class="meta">
              <IconBase name="sparkle" :size="16" />
              {{ modelName }}
            </span>
          </div>
          <p class="idcard__note">请与车身前后的号牌逐字核对，号码完全一致才是你的车</p>
        </template>
        <SkeletonBlock v-else :rows="2" :height="34" width="70%" />
      </section>

      <!-- 本趟行程摘要 -->
      <section class="card trip" aria-label="本趟行程">
        <p class="trip__label">本趟行程</p>
        <template v-if="view">
          <div class="trip__route">
            <span class="trip__point">
              <span class="trip__dot" aria-hidden="true" />
              <span class="trip__name">{{ originName }}</span>
            </span>
            <IconBase name="chevronRight" :size="18" class="trip__arrow" />
            <span class="trip__point">
              <span class="trip__dot trip__dot--dest" aria-hidden="true" />
              <span class="trip__name">{{ destName }}</span>
            </span>
          </div>
          <div class="trip__stats">
            <div class="stat">
              <p class="stat__label">预计里程</p>
              <p class="stat__value num">{{ distanceText }}</p>
            </div>
            <div class="stat">
              <p class="stat__label">预计时长</p>
              <p class="stat__value num">{{ durationText }}</p>
            </div>
          </div>
        </template>
        <SkeletonBlock v-else :rows="3" :height="22" />
      </section>
    </div>

    <footer class="welcome__foot">
      <AppButton variant="primary" size="xl" icon="check" block hint="下一步用手机号后 4 位确认身份" @click="router.push('/verify')">
        这是我叫的车，开始校验
      </AppButton>
      <button class="mismatch" type="button" :aria-expanded="showMismatch" @click="showMismatch = !showMismatch">
        <IconBase name="alert" :size="18" />
        车牌对不上
      </button>
    </footer>

    <!-- 就地展开：不跳走，先把"有人管你"和"能下车"给到 -->
    <section v-if="showMismatch" class="mismatch-panel" aria-label="车牌不一致的处理方式">
      <div class="mismatch-panel__text">
        <p class="mismatch-panel__title">车牌不一致时，请不要上车</p>
        <p class="mismatch-panel__detail">
          你可以在这里呼叫远程安全员，安全员会核对订单与车辆信息。也可以直接开门下车，车辆停稳时车门可以手动打开，本趟行程不会开始计费。
        </p>
        <p v-if="assistError" class="mismatch-panel__err" role="alert">{{ assistError }}</p>
      </div>
      <div class="mismatch-panel__actions">
        <AppButton variant="primary" size="lg" icon="user" :loading="calling" @click="callAssist">呼叫安全员</AppButton>
        <AppButton variant="ghost" size="lg" icon="door" @click="router.push('/stop')">我要下车</AppButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.welcome {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  gap: var(--sp-5);
  padding: var(--sp-6) var(--sp-7);
  overflow-y: auto;
}

.welcome__head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.welcome__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}
.welcome__title {
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--c-text-1);
}
.welcome__lead {
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

.welcome__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: var(--sp-5);
  align-items: stretch;
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5) var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}

/* ---- 车辆身份 ---- */
.idcard {
  justify-content: center;
  min-height: 260px;
}
.idcard__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}
.idcard__plate {
  font-size: var(--fs-mega);
  font-weight: 700;
  line-height: 1.1;
  color: var(--c-text-1);
}
.idcard__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 var(--sp-4);
  border-radius: var(--r-chip);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
}
.idcard__note {
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
  line-height: 1.6;
}

/* ---- 行程摘要 ---- */
.trip {
  justify-content: center;
}
.trip__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}
.trip__route {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.trip__point {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.trip__dot {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
  border: 2px solid var(--c-text-3);
}
.trip__dot--dest {
  border-color: var(--c-accent);
  background: var(--c-accent);
}
.trip__name {
  font-size: var(--fs-title-s);
  font-weight: 600;
  color: var(--c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trip__arrow {
  flex: none;
  color: var(--c-text-3);
}
.trip__stats {
  display: flex;
  gap: var(--sp-4);
}
.stat {
  flex: 1;
  min-width: 0;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
}
.stat__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.stat__value {
  margin-top: 2px;
  font-size: var(--fs-title-l);
  font-weight: 700;
  color: var(--c-text-1);
}

/* ---- 操作 ---- */
.welcome__foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}
.welcome__foot > :first-child {
  flex: 1;
}
.mismatch {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 64px;
  padding: 0 var(--sp-5);
  flex: none;
  border-radius: var(--r-btn);
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text-2);
  font-size: var(--fs-body);
  font-weight: 600;
  transition: color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.mismatch:active {
  color: var(--c-warn);
  border-color: var(--c-warn);
}

.mismatch-panel {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: var(--sp-5) var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-warn-weak);
  border: 1px solid color-mix(in srgb, var(--c-warn) 32%, transparent);
}
.mismatch-panel__text {
  min-width: 0;
}
.mismatch-panel__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-warn);
}
.mismatch-panel__detail {
  margin-top: var(--sp-2);
  max-width: 68ch;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.7;
}
.mismatch-panel__err {
  margin-top: var(--sp-2);
  font-size: var(--fs-body-s);
  color: var(--c-danger);
}
.mismatch-panel__actions {
  display: flex;
  gap: var(--sp-3);
  flex: none;
}
</style>
