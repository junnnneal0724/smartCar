<script setup lang="ts">
/**
 * 即将到达。
 *
 * 行程后段乘客会开始起身、收拾东西，所以这一屏把两件事放在最前面：
 *   "还有多久到"（大到一眼可读）与"别把东西落下"（可以勾一遍的清单）。
 * 下车相关的动作都放在这一屏，但开门本身留给 /alight，因为那里会判定车辆是否真的停稳。
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

/** 勾选状态只留在这块屏幕上，不上传 */
const checked = ref<string[]>([]);
const error = ref('');
const requested = ref(false);
const submitting = ref(false);

const destName = computed(() => ride.view?.dest.name ?? '目的地');
const remainText = computed(() => formatDuration(ride.remainTimeS));
const remainDistanceText = computed(() => formatDistance(ride.remainDistanceM));
const progressPct = computed(() => Math.round(Math.min(1, Math.max(0, ride.progress)) * 100));
const isArrived = computed(() => ride.status === 'ARRIVED');

function toggle(key: string): void {
  checked.value = checked.value.includes(key) ? checked.value.filter((k) => k !== key) : [...checked.value, key];
}

async function requestStop(): Promise<void> {
  if (submitting.value || requested.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await ride.requestStop({ kind: 'NORMAL' });
    requested.value = true;
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '暂时没能提交下车请求，请再试一次';
  } finally {
    submitting.value = false;
  }
}

/** 车辆已经停稳就不要再让乘客停在这一屏了，直接接管到下车流程 */
watch(isArrived, (v) => {
  if (v) router.replace('/alight');
});

onMounted(() => {
  ride.refresh().catch(() => undefined);
  ride.fetchEvents(20).catch(() => undefined);
  if (isArrived.value) router.replace('/alight');
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">即将到达</p>
      <h1 class="page__title">马上就到 {{ destName }}</h1>
      <p class="page__lead">车辆正在减速找位置靠边，先坐稳，等它停稳再解开安全带。</p>
    </header>

    <div v-if="!ride.view" class="page__body page__body--empty">
      <EmptyState
        icon="car"
        title="还没有读到正在进行的行程"
        detail="行程开始之后，这一屏会显示到达倒计时、下车点与遗留物品提醒。"
      >
        <template #action>
          <AppButton variant="soft" size="lg" icon="map" @click="router.push('/trip')">回到行程地图</AppButton>
        </template>
      </EmptyState>
    </div>

    <div v-else class="page__body arrival">
      <section class="hero">
        <div class="hero__numbers">
          <p class="hero__label">预计还需</p>
          <p class="hero__value num">{{ remainText }}</p>
          <p class="hero__sub">
            还有 <span class="num">{{ remainDistanceText }}</span> 到 {{ destName }}
          </p>
        </div>

        <div class="hero__progress">
          <div class="bar">
            <span class="bar__fill" :style="{ width: `${progressPct}%` }" />
          </div>
          <div class="bar__meta">
            <span>行程已完成 <span class="num">{{ progressPct }}</span>%</span>
            <span v-if="ride.behavior" class="bar__action">{{ ride.behavior.short }}</span>
          </div>
        </div>

        <div class="hero__hint">
          <IconBase name="pin" :size="20" />
          <span>下车点：{{ destName }} 一侧的路边安全位置，车辆会尽量贴近人行道停靠。</span>
        </div>
      </section>

      <section class="luggage">
        <header class="luggage__head">
          <h2 class="luggage__title">下车前看一眼</h2>
          <p class="luggage__sub">后排座椅和脚下最容易落下东西，点一遍更放心。</p>
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

        <p class="luggage__note">勾选只在这块屏幕上生效，不会被上传，也不会写进行程记录。</p>
      </section>
    </div>

    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <p v-else-if="requested" class="ok" role="status">已经告诉车辆，它会在前方安全位置靠边停下。</p>

    <p class="safety">
      <IconBase name="shield" :size="18" />
      <span>请在车辆完全停稳后再解开安全带，不差这一小会儿。</span>
    </p>

    <footer class="page__foot">
      <AppButton
        variant="soft"
        size="xl"
        icon="pin"
        :loading="submitting"
        :disabled="requested || !ride.isOngoing"
        :hint="ride.isOngoing ? '临时停靠，不结束行程' : '行程进行中才能请求停车'"
        @click="requestStop"
      >
        我要在这里下车
      </AppButton>
      <AppButton
        variant="primary"
        size="xl"
        icon="chevronRight"
        hint="车辆完全停稳后开门"
        @click="router.push('/alight')"
      >
        车辆已经停稳，准备下车
      </AppButton>
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

.arrival {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  gap: var(--sp-5);
  align-items: start;
}

/* ---- 主视觉：剩余时间 ---- */
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.hero__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.hero__value {
  margin-top: 2px;
  font-size: var(--fs-mega);
  font-weight: 700;
  line-height: 1.05;
  color: var(--c-text-1);
}
.hero__sub {
  margin-top: var(--sp-2);
  font-size: var(--fs-title-s);
  color: var(--c-text-2);
}

.hero__progress {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.bar {
  height: 12px;
  border-radius: var(--r-chip);
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border);
  overflow: hidden;
}
.bar__fill {
  display: block;
  height: 100%;
  border-radius: var(--r-chip);
  background: var(--c-accent);
  transition: width var(--d-slow) var(--ease-out);
}
.bar__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.bar__action {
  color: var(--c-text-1);
  font-weight: 600;
}

.hero__hint {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  line-height: var(--lh-body);
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

/* ---- 提示与主操作 ---- */
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
.safety {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.page__foot {
  flex: none;
  display: flex;
  gap: var(--sp-3);
}
.page__foot > * {
  flex: 1;
}
</style>
