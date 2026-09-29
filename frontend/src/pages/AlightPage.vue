<script setup lang="ts">
/**
 * 下车。
 *
 * 这是全车唯一一个"按错了会伤人"的按钮，所以规则写得很硬：
 *   车辆必须已经到达，且时速不超过 1 公里，开门按钮才可用。
 * 条件不满足时按钮是禁用态，并且**在按钮上和按钮上方都写清原因**，
 * 绝不能只变灰让乘客猜。开门失败时把后端给的原话就地显示出来。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import IconBase from '@/components/IconBase.vue';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';
import { formatDistance, formatDuration } from '@/map/geo';

interface LuggageItem {
  key: string;
  label: string;
}

const router = useRouter();
const ride = useRideStore();
const session = useSessionStore();

const luggage: LuggageItem[] = [
  { key: 'phone', label: '手机' },
  { key: 'bag', label: '随身包' },
  { key: 'umbrella', label: '雨伞' },
  { key: 'other', label: '其他' },
];

const checked = ref<string[]>([]);
const error = ref('');
const opening = ref(false);
const completing = ref(false);
const opened = ref(false);

const speedKph = computed(() => Math.round(ride.vehicle?.speedKph ?? 0));
const isArrived = computed(() => ride.view?.status === 'ARRIVED');
/** 注意：store 在还没有行程时会把 status 兜底成 COMPLETED，所以这里必须要求 view 存在 */
const isDone = computed(() => !!ride.view && ride.status === 'COMPLETED');

/** 停稳判定：已到达 + 时速不超过 1 公里 */
const canOpen = computed(() => isArrived.value && !!ride.vehicle && speedKph.value <= 1);

const lockReason = computed(() => {
  if (!ride.view) return '还没有读取到这段行程，等车机同步完成再试';
  if (isDone.value) return '行程已经结束，车门状态交回车辆管理';
  if (!isArrived.value) return '车辆还没有停稳，停稳之后开门按钮会自动可用';
  if (!ride.vehicle) return '正在确认车辆是否已经完全停止';
  if (speedKph.value > 1) return `车辆还在移动，当前时速 ${speedKph.value} 公里`;
  return '';
});

const destName = computed(() => ride.view?.dest.name ?? '目的地');

function toggle(key: string): void {
  checked.value = checked.value.includes(key) ? checked.value.filter((k) => k !== key) : [...checked.value, key];
}

async function onOpenDoor(): Promise<void> {
  if (!canOpen.value || opening.value) return;
  opening.value = true;
  error.value = '';
  try {
    const r = await ride.openDoor();
    opened.value = r.ok;
    if (!r.ok) error.value = '车门暂时没有打开，请再按一次';
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '车门暂时没有打开，请再按一次';
  } finally {
    opening.value = false;
  }
}

async function onComplete(): Promise<void> {
  if (completing.value) return;
  completing.value = true;
  error.value = '';
  try {
    await ride.complete();
    await router.push('/summary');
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '暂时没能结束行程，请再试一次';
  } finally {
    completing.value = false;
  }
}

/** 行程已经结束就不要再停留在下车页 */
watch(isDone, (v) => {
  if (v) router.replace('/summary');
});

onMounted(() => {
  ride.refresh().catch(() => undefined);
  ride.fetchEvents(10).catch(() => undefined);
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">下车</p>
      <h1 class="page__title">{{ opened ? '车门已经开启' : '准备下车' }}</h1>
      <p class="page__lead">
        {{ opened ? '下车前再看一眼座位和脚下，注意后方来车与自行车。' : '车辆停稳之后，开门按钮才会变成可用状态。' }}
      </p>
    </header>

    <div v-if="!ride.view && !isDone" class="page__body page__body--empty">
      <EmptyState
        icon="car"
        title="还没有读到正在进行的行程"
        detail="行程开始并到达之后，这一屏才会负责开门与结束行程。"
      >
        <template #action>
          <AppButton variant="soft" size="lg" icon="map" @click="router.push('/trip')">回到行程地图</AppButton>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="isDone" class="page__body page__body--empty">
      <EmptyState
        icon="check"
        title="这段行程已经结束"
        detail="行程小结里可以看到这段路的里程、时长与费用构成。"
      >
        <template #action>
          <AppButton variant="primary" size="lg" icon="list" @click="router.push('/summary')">查看行程小结</AppButton>
        </template>
      </EmptyState>
    </div>

    <div v-else class="page__body alight">
      <div class="alight__main">
        <!-- 开门：安全关键区 -->
        <section class="door" :class="{ 'door--ready': canOpen }">
          <div class="door__state">
            <span class="door__icon"><IconBase :name="opened ? 'door' : 'seatbelt'" :size="24" /></span>
            <div class="door__text">
              <p class="door__title">
                <template v-if="opened">车门已开启</template>
                <template v-else-if="canOpen">车辆已停稳，可以开门</template>
                <template v-else>现在还不能开门</template>
              </p>
              <p class="door__detail">
                <template v-if="opened">请注意后方来车与自行车，随身物品别忘了带。</template>
                <template v-else-if="canOpen">开门前先看一眼后方，确认安全再推门。</template>
                <template v-else>{{ lockReason }}</template>
              </p>
            </div>
          </div>

          <div class="door__speed">
            <span class="door__speed-label">当前时速</span>
            <span class="door__speed-value"><span class="num">{{ speedKph }}</span> km/h</span>
            <span class="door__speed-state">{{ isArrived ? '已到达下车点' : '尚未到达下车点' }}</span>
          </div>

          <AppButton
            v-if="!opened"
            variant="primary"
            size="xl"
            icon="door"
            block
            :loading="opening"
            :disabled="!canOpen"
            :hint="canOpen ? '车辆已停稳，按下即开门' : lockReason"
            @click="onOpenDoor"
          >
            打开车门
          </AppButton>
          <AppButton
            v-else
            variant="primary"
            size="xl"
            icon="check"
            block
            :loading="completing"
            hint="结束之后进入行程小结"
            @click="onComplete"
          >
            结束行程
          </AppButton>
        </section>

        <!-- 本次行程的基本信息，让人确认坐的是哪一趟 -->
        <section class="tripinfo">
          <h2 class="tripinfo__title">本次行程</h2>
          <div class="tripinfo__row">
            <span class="tripinfo__label">上车点</span>
            <span class="tripinfo__value">{{ ride.view?.origin.name }}</span>
          </div>
          <div class="tripinfo__row">
            <span class="tripinfo__label">下车点</span>
            <span class="tripinfo__value">{{ destName }}</span>
          </div>
          <div class="tripinfo__row">
            <span class="tripinfo__label">里程</span>
            <span class="tripinfo__value num">{{ formatDistance(ride.view?.planDistanceM ?? 0) }}</span>
          </div>
          <div class="tripinfo__row">
            <span class="tripinfo__label">时长</span>
            <span class="tripinfo__value num">{{ formatDuration(ride.view?.planDurationS ?? 0) }}</span>
          </div>
          <p class="tripinfo__note">账单会在行程结束后同步到你的手机，车上不需要付款。</p>
        </section>
      </div>

      <!-- 遗留物品清单 -->
      <section class="luggage">
        <header class="luggage__head">
          <h2 class="luggage__title">带走你的东西</h2>
          <p class="luggage__sub">点一遍再下车，车门关上之后就不好回头拿了。</p>
        </header>
        <ul class="luggage__list">
          <li v-for="item in luggage" :key="item.key">
            <button
              class="check pressable"
              type="button"
              :class="{ 'check--on': checked.includes(item.key) }"
              :aria-pressed="checked.includes(item.key)"
              @click="toggle(item.key)"
            >
              <span class="check__box">
                <IconBase v-if="checked.includes(item.key)" name="check" :size="26" />
              </span>
              <span class="check__label">{{ item.label }}</span>
            </button>
          </li>
        </ul>
        <p class="luggage__note">万一还是落下了东西，可以在帮助页联系远程安全员。</p>
      </section>
    </div>

    <p v-if="error" class="alert" role="alert">{{ error }}</p>

    <p v-if="opened" class="ok" role="status">请注意后方来车与自行车，慢一点下车。</p>
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
}
.page__head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
.page__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.page__body--empty {
  display: grid;
  place-items: center;
}

.alight {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  gap: var(--sp-5);
  align-items: start;
}
.alight__main {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

/* ---- 开门 ---- */
.door {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.door--ready {
  border-color: var(--c-accent-border);
}
.door__state {
  display: flex;
  gap: var(--sp-4);
}
.door__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
}
.door--ready .door__icon {
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
  color: var(--c-accent);
}
.door__title {
  font-size: var(--fs-title);
  font-weight: 650;
  color: var(--c-text-1);
}
.door__detail {
  margin-top: 4px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: var(--lh-body);
}
.door__speed {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border);
}
.door__speed-label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.08em;
}
.door__speed-value {
  font-size: var(--fs-title-l);
  font-weight: 700;
  color: var(--c-text-1);
}
.door__speed-state {
  margin-left: auto;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}

/* ---- 本次行程 ---- */
.tripinfo {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5) var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.tripinfo__title {
  font-size: var(--fs-title);
  font-weight: 650;
}
.tripinfo__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  font-size: var(--fs-body-s);
}
.tripinfo__label {
  color: var(--c-text-3);
  flex: none;
}
.tripinfo__value {
  color: var(--c-text-1);
  font-weight: 600;
  text-align: right;
  min-width: 0;
}
.tripinfo__note {
  margin-top: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: 1.6;
}

/* ---- 遗留物品清单 ---- */
.luggage {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.luggage__title {
  font-size: var(--fs-title);
  font-weight: 650;
}
.luggage__sub {
  margin-top: 4px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.luggage__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}
.check {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  width: 100%;
  min-height: 80px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.check__box {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border-strong);
  color: var(--c-on-accent);
}
.check__label {
  font-size: var(--fs-title-s);
  font-weight: 600;
  color: var(--c-text-1);
}
.check--on {
  border-color: var(--c-accent-border);
  background: var(--c-accent-weak);
}
.check--on .check__box {
  background: var(--c-accent);
  border-color: transparent;
}
.luggage__note {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: 1.6;
}

/* ---- 提示 ---- */
.alert {
  flex: none;
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-chip);
  background: var(--c-danger-weak);
  border: 1px solid color-mix(in srgb, var(--c-danger) 40%, transparent);
  color: var(--c-danger);
  font-size: var(--fs-body-s);
}
.ok {
  flex: none;
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-chip);
  background: var(--c-success-weak);
  border: 1px solid color-mix(in srgb, var(--c-success) 38%, transparent);
  color: var(--c-success);
  font-size: var(--fs-body-s);
}
</style>
