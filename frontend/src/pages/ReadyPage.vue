<script setup lang="ts">
/**
 * 出发前确认（meta.bar: 'none'）。
 *
 * 这是乘客按下"开始行程"之前的最后一屏。车不会自己启动，需要乘客确认，
 * 所以这一屏的任务不是收集信息，而是**让人安心**：先把该做的三件事做完，
 * 再把"这趟没人开车但一直有人管你"讲清楚。
 *
 * 按钮禁用不用弹窗，原因直接写在按钮下方：车内弹窗要读、要找按钮、要点，
 * 而乘客此时的注意力在路上。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { formatDistance, formatDuration, formatMoney } from '@/map/geo';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';

interface CheckItem {
  key: string;
  icon: string;
  title: string;
  detail: string;
  reason: string;
}

const CHECKS: CheckItem[] = [
  {
    key: 'belt',
    icon: 'seatbelt',
    title: '系好安全带',
    detail: '落座后请先扣好安全带，车辆确认后才会起步',
    reason: '请先确认已系好安全带',
  },
  {
    key: 'items',
    icon: 'bag',
    title: '随身物品已放稳',
    detail: '背包与行李放在脚边或行李位，不要挡住安全气囊与车门',
    reason: '请先确认随身物品已经放稳',
  },
  {
    key: 'dest',
    icon: 'pin',
    title: '确认目的地',
    detail: '确认本趟要去的终点，行程中可以随时改目的地',
    reason: '请先确认本趟目的地',
  },
];

const NOTES: { icon: string; text: string }[] = [
  { icon: 'car', text: '这趟车没有司机，全程由自动驾驶系统行驶，你不需要做任何操作' },
  { icon: 'thermometer', text: '屏幕上可以随时调节温度、风量与氛围灯，也可以一键应用预设场景' },
  { icon: 'shield', text: '遇到任何问题，都可以从这里接通远程安全员，行程开始后屏幕底部的帮助也随时可用' },
  { icon: 'user', text: '行驶中车辆会主动礼让行人，屏幕上会同步说明它为什么减速或停车' },
];

const router = useRouter();
const session = useSessionStore();
const ride = useRideStore();

const done = ref<Record<string, boolean>>({});
const starting = ref(false);
const error = ref('');

const view = computed(() => ride.view ?? session.ride);

const allChecked = computed(() => CHECKS.every((c) => done.value[c.key] === true));
const missingReason = computed(() => CHECKS.find((c) => done.value[c.key] !== true)?.reason ?? '');
const destName = computed(() => view.value?.dest.name ?? '');
const distanceText = computed(() => formatDistance(view.value?.planDistanceM ?? 0));
const durationText = computed(() => formatDuration(view.value?.planDurationS ?? 0));
const fareText = computed(() => formatMoney(view.value?.fare.total ?? 0));

function toggle(key: string): void {
  done.value = { ...done.value, [key]: !done.value[key] };
}

async function start(): Promise<void> {
  if (!allChecked.value || starting.value) return;
  starting.value = true;
  error.value = '';
  try {
    await ride.start();
    router.push('/trip');
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '行程没有启动，请重试';
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <div class="ready">
    <header class="ready__head">
      <p class="ready__eyebrow">出发前确认</p>
      <h1 class="ready__title">确认好了，我们就出发</h1>
      <p class="ready__lead">下面三件事确认完，车辆才会起步。</p>
    </header>

    <div class="ready__body">
      <!-- 出发前检查 -->
      <section class="block checks" aria-label="出发前检查">
        <p class="block__label">出发前检查</p>
        <ul class="checks__list">
          <li v-for="c in CHECKS" :key="c.key">
            <button
              class="check"
              :class="{ 'check--on': done[c.key] === true }"
              type="button"
              role="checkbox"
              :aria-checked="done[c.key] === true"
              @click="toggle(c.key)"
            >
              <span class="check__box">
                <IconBase v-if="done[c.key] === true" name="check" :size="22" />
                <IconBase v-else :name="c.icon" :size="22" />
              </span>
              <span class="check__body">
                <span class="check__title">{{ c.title }}</span>
                <span class="check__detail">{{ c.detail }}</span>
              </span>
              <span class="check__state">{{ done[c.key] === true ? '已确认' : '待确认' }}</span>
            </button>
          </li>
        </ul>
      </section>

      <div class="right">
        <!-- 本趟行程 -->
        <section class="block trip" aria-label="本趟行程">
          <p class="block__label">本趟行程</p>
          <template v-if="view">
            <div class="trip__dest">
              <span class="trip__icon"><IconBase name="pin" :size="20" /></span>
              <div class="trip__text">
                <p class="trip__label">目的地</p>
                <p class="trip__name">{{ destName }}</p>
              </div>
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
              <div class="stat">
                <p class="stat__label">预估费用</p>
                <p class="stat__value num">¥{{ fareText }}</p>
              </div>
            </div>
            <p class="trip__note">结束后按实际里程结算，账单会同步到你的手机</p>
          </template>
          <SkeletonBlock v-else :rows="3" :height="24" />
        </section>

        <!-- 车内说明 -->
        <section class="block notes" aria-label="车内说明">
          <p class="block__label">车内说明</p>
          <ul class="notes__list">
            <li v-for="n in NOTES" :key="n.text" class="note">
              <span class="note__icon"><IconBase :name="n.icon" :size="18" /></span>
              <span class="note__text">{{ n.text }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <p v-if="error" class="ready__err" role="alert">{{ error }}</p>

    <footer class="ready__foot">
      <div class="foot__main">
        <AppButton
          variant="primary"
          size="xl"
          icon="check"
          block
          :disabled="!allChecked"
          :loading="starting"
          @click="start"
        >
          开始行程
        </AppButton>
        <p v-if="!allChecked" class="foot__reason">{{ missingReason }}</p>
        <p v-else class="foot__reason foot__reason--ok">三项都已确认，车辆可以起步了</p>
      </div>

      <AppButton variant="ghost" icon="thermometer" @click="router.push('/cabin')">我想先调一下座舱</AppButton>
      <AppButton variant="ghost" icon="door" @click="router.push('/stop')">我要在这里下车</AppButton>
    </footer>
  </div>
</template>

<style scoped>
.ready {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  gap: var(--sp-5);
  padding: var(--sp-6);
  overflow-y: auto;
}

.ready__head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.ready__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}
.ready__title {
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--c-text-1);
}
.ready__lead {
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

.ready__body {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: var(--sp-5);
  align-items: start;
}
.right {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.block__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}

/* ---- 勾选项 ---- */
.checks__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.check {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  width: 100%;
  min-height: 88px;
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  text-align: left;
  transition: border-color var(--d-fast) var(--ease-out), background var(--d-fast) var(--ease-out);
}
.check:active {
  background: var(--c-surface-hover);
}
.check--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
}
.check__box {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-surface);
  border: 1px solid var(--c-border-strong);
  color: var(--c-text-3);
  transition: background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out),
    border-color var(--d-fast) var(--ease-out);
}
.check--on .check__box {
  background: var(--c-accent);
  border-color: var(--c-accent);
  color: var(--c-on-accent);
}
.check__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.check__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}
.check__detail {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.5;
}
.check__state {
  flex: none;
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}
.check--on .check__state {
  color: var(--c-accent);
  font-weight: 600;
}

/* ---- 本趟行程 ---- */
.trip__dest {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}
.trip__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-surface-raised);
  color: var(--c-accent);
}
.trip__text {
  min-width: 0;
}
.trip__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.trip__name {
  font-size: var(--fs-title);
  font-weight: 650;
  color: var(--c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trip__stats {
  display: flex;
  gap: var(--sp-3);
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
  font-size: var(--fs-title);
  font-weight: 700;
  color: var(--c-text-1);
}
.trip__note {
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
  line-height: 1.6;
}

/* ---- 车内说明 ---- */
.notes__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.note {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
}
.note__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
}
.note__text {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.7;
}

/* ---- 底部 ---- */
.ready__err {
  flex: none;
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-danger);
}
.ready__foot {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
}
.foot__main {
  flex: 1;
  min-width: 0;
}
.foot__reason {
  margin-top: var(--sp-2);
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
  text-align: center;
}
.foot__reason--ok {
  color: var(--c-success);
}
</style>
