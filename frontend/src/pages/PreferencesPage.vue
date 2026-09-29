<script setup lang="ts">
/**
 * 我的偏好（/preferences）
 *
 * 这一页存在的理由，是一个乘客必须知道的事实：
 * 行程一开始，座舱就会按你的历史偏好自动套用（温度、氛围灯、是否静音）。
 * 所以这里做两件事：让你当场微调，并且说清楚"下次上车会自动生效"。
 *
 * 两类设置刻意分开：
 *   · 座舱偏好（温度 / 氛围灯 / 上车静音）只保存在这块屏幕上（robotaxi.pref.*），
 *     不写回账号，属于本机展示层面的偏好。
 *   · 无障碍开关是真的接到 useUiStore，按下立刻影响整个车机界面。
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import { useCabinStore } from '@/stores/cabin';
import { useUiStore } from '@/stores/ui';
import type { AmbientLight } from '@/api/types';

const cabin = useCabinStore();
const ui = useUiStore();

const LS = {
  temp: 'robotaxi.pref.temp',
  ambient: 'robotaxi.pref.ambient',
  mute: 'robotaxi.pref.mute',
} as const;

const DEFAULT_TEMP = 24;
const DEFAULT_AMBIENT: AmbientLight = 'warm';
const AMBIENT_KEYS: AmbientLight[] = ['off', 'warm', 'neutral', 'cool'];

function clampTemp(value: number): number {
  const r = cabin.ranges?.temp ?? { min: 16, max: 30, step: 0.5 };
  return Math.min(r.max, Math.max(r.min, Math.round(value * 2) / 2));
}

function readAmbient(): AmbientLight {
  const raw = localStorage.getItem(LS.ambient);
  return AMBIENT_KEYS.includes(raw as AmbientLight) ? (raw as AmbientLight) : DEFAULT_AMBIENT;
}

function readTemp(): number {
  const n = Number(localStorage.getItem(LS.temp));
  return Number.isFinite(n) && n > 0 ? clampTemp(n) : DEFAULT_TEMP;
}

const prefTemp = ref<number>(readTemp());
const prefAmbient = ref<AmbientLight>(readAmbient());
const prefMute = ref<boolean>(localStorage.getItem(LS.mute) === '1');
const notice = ref('');

watch(prefTemp, (v) => localStorage.setItem(LS.temp, String(v)));
watch(prefAmbient, (v) => localStorage.setItem(LS.ambient, v));
watch(prefMute, (v) => localStorage.setItem(LS.mute, v ? '1' : '0'));

const tempRange = computed(() => cabin.ranges?.temp ?? { min: 16, max: 30, step: 0.5 });

interface AmbientChoice {
  key: AmbientLight;
  name: string;
  color?: string;
}

/** 颜色只有后端给了才画色块，拿不到就退回纯文字选项，避免写死颜色值 */
const ambientChoices = computed<AmbientChoice[]>(() => {
  if (cabin.ambientOptions.length) {
    return cabin.ambientOptions.map((o) => ({ key: o.key, name: o.name, color: o.color }));
  }
  return [
    { key: 'off', name: '关闭' },
    { key: 'warm', name: '暖光' },
    { key: 'neutral', name: '自然光' },
    { key: 'cool', name: '冷光' },
  ];
});

function stepPrefTemp(direction: number): void {
  notice.value = '';
  const r = tempRange.value;
  prefTemp.value = Math.min(r.max, Math.max(r.min, prefTemp.value + direction * r.step));
}

function resetAll(): void {
  prefTemp.value = DEFAULT_TEMP;
  prefAmbient.value = DEFAULT_AMBIENT;
  prefMute.value = false;
  ui.fontScale = 'standard';
  ui.contrast = 'normal';
  ui.motion = 'full';
  ui.voiceEnabled = true;
  notice.value = '已经恢复默认，座舱和无障碍选项都回到出厂状态。';
}

function toggleVoice(): void {
  notice.value = '';
  ui.voiceEnabled = !ui.voiceEnabled;
}

function toggleFont(): void {
  notice.value = '';
  ui.toggleFont();
}

function toggleContrast(): void {
  notice.value = '';
  ui.toggleContrast();
}

function toggleMotion(): void {
  notice.value = '';
  ui.toggleMotion();
}

function togglePrefMute(): void {
  notice.value = '';
  prefMute.value = !prefMute.value;
}

function setAmbient(key: AmbientLight): void {
  notice.value = '';
  prefAmbient.value = key;
}

onMounted(() => {
  if (!cabin.setting) void cabin.load();
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">偏好</p>
      <h1 class="page__title">我的偏好</h1>
      <p class="page__lead">
        每次行程开始时，车上会按你的历史偏好自动套用一次：温度、氛围灯、是否静音。这一页让你现在就能改。
      </p>
    </header>

    <p v-if="notice" class="notice" role="status">
      <IconBase name="check" :size="18" />
      {{ notice }}
    </p>

    <!-- 座舱偏好 -->
    <section class="card">
      <div class="card__head">
        <h2 class="card__title">
          <IconBase name="thermometer" :size="20" />
          默认温度
        </h2>
        <span class="chip">上车后自动套用</span>
      </div>
      <div class="stepper">
        <button
          class="stepper__btn"
          type="button"
          aria-label="默认温度调低半度"
          :disabled="prefTemp <= tempRange.min"
          @click="stepPrefTemp(-1)"
        >
          <IconBase name="minus" :size="26" />
        </button>
        <p class="stepper__value">
          <span class="num">{{ prefTemp.toFixed(1) }}</span>
          <span class="stepper__unit">°C</span>
        </p>
        <button
          class="stepper__btn"
          type="button"
          aria-label="默认温度调高半度"
          :disabled="prefTemp >= tempRange.max"
          @click="stepPrefTemp(1)"
        >
          <IconBase name="plus" :size="26" />
        </button>
      </div>
      <p class="card__note">设好之后，上车时左右两侧都会先调到这个温度，你再单独调某一侧也不会影响这个默认值。</p>
    </section>

    <section class="card">
      <div class="card__head">
        <h2 class="card__title">
          <IconBase name="bulb" :size="20" />
          默认氛围灯
        </h2>
        <span class="chip">{{ ambientChoices.find((o) => o.key === prefAmbient)?.name ?? '关闭' }}</span>
      </div>
      <div class="ambients">
        <button
          v-for="opt in ambientChoices"
          :key="opt.key"
          class="ambient"
          :class="{ 'ambient--on': prefAmbient === opt.key }"
          type="button"
          @click="setAmbient(opt.key)"
        >
          <span v-if="opt.color" class="ambient__dot" :style="{ background: opt.color }" />
          <span v-else class="ambient__dot ambient__dot--plain" />
          <span class="ambient__name">{{ opt.name }}</span>
        </button>
      </div>
      <p class="card__note">喜欢暗一点就选「关闭」，夜里上车不会一开门就被灯晃到。</p>
    </section>

    <section class="card">
      <div class="card__head">
        <h2 class="card__title">
          <IconBase name="volumeOff" :size="20" />
          上车默认静音
        </h2>
      </div>
      <button
        class="switch"
        :class="{ 'switch--on': prefMute }"
        type="button"
        role="switch"
        :aria-checked="prefMute"
        @click="togglePrefMute"
      >
        <span class="switch__body">
          <span class="switch__title">上车后把音量调到 0</span>
          <span class="switch__desc">打开后音量归零，导航与安全提示音仍然会保留，需要广播信息时不会被漏掉。</span>
        </span>
        <span class="switch__track" aria-hidden="true"><span class="switch__knob" /></span>
      </button>
    </section>

    <!-- 无障碍：即时生效 -->
    <section class="card">
      <div class="card__head">
        <h2 class="card__title">
          <IconBase name="wheelchair" :size="20" />
          无障碍与观看
        </h2>
        <span class="chip">按下立刻生效</span>
      </div>

      <button
        class="switch"
        :class="{ 'switch--on': ui.fontScale === 'large' }"
        type="button"
        role="switch"
        :aria-checked="ui.fontScale === 'large'"
        @click="toggleFont()"
      >
        <span class="switch__body">
          <span class="switch__title">大字模式</span>
          <span class="switch__desc">打开后整块屏幕的文字整体放大一档，坐在后排、眼睛不太舒服的时候也看得清。</span>
        </span>
        <span class="switch__track" aria-hidden="true"><span class="switch__knob" /></span>
      </button>

      <button
        class="switch"
        :class="{ 'switch--on': ui.contrast === 'high' }"
        type="button"
        role="switch"
        :aria-checked="ui.contrast === 'high'"
        @click="toggleContrast()"
      >
        <span class="switch__body">
          <span class="switch__title">高对比模式</span>
          <span class="switch__desc">打开后文字和描边更分明，白天靠窗坐、屏幕被阳光照到的时候更好认。</span>
        </span>
        <span class="switch__track" aria-hidden="true"><span class="switch__knob" /></span>
      </button>

      <button
        class="switch"
        :class="{ 'switch--on': ui.motion === 'calm' }"
        type="button"
        role="switch"
        :aria-checked="ui.motion === 'calm'"
        @click="toggleMotion()"
      >
        <span class="switch__body">
          <span class="switch__title">减少动效</span>
          <span class="switch__desc">关闭过场动画，适合容易晕车的乘客，屏幕不会再有滑动和缩放。</span>
        </span>
        <span class="switch__track" aria-hidden="true"><span class="switch__knob" /></span>
      </button>

      <button
        class="switch"
        :class="{ 'switch--on': ui.voiceEnabled }"
        type="button"
        role="switch"
        :aria-checked="ui.voiceEnabled"
        @click="toggleVoice"
      >
        <span class="switch__body">
          <span class="switch__title">语音播报</span>
          <span class="switch__desc">打开后快到站、车辆停稳这类关键节点会有一句语音提醒，想安静就关掉。</span>
        </span>
        <span class="switch__track" aria-hidden="true"><span class="switch__knob" /></span>
      </button>
    </section>

    <footer class="page__foot">
      <AppButton size="lg" icon="sync" @click="resetAll">恢复默认</AppButton>
      <p class="page__footnote">
        偏好在每次上车时会自动应用。恢复默认会还原上面的温度、氛围灯、静音与无障碍选项，不影响正在进行的行程。
      </p>
    </footer>

    <p class="page__tip">
      <IconBase name="info" :size="16" />
      演示环境里这一页的温度、氛围灯和静音只保存在这块屏幕上，不会回写账号偏好。
    </p>
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
  overflow-y: auto;
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
  max-width: 78ch;
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-input);
  background: var(--c-success-weak);
  border: 1px solid color-mix(in srgb, var(--c-success) 38%, transparent);
  color: var(--c-success);
  font-size: var(--fs-body-s);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
}
.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}
.card__title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}
.card__note {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.5;
}
.chip {
  flex: none;
  padding: 5px var(--sp-3);
  border-radius: var(--r-chip);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

/* ---- 大号加减 ---- */
.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-2);
  border-radius: var(--r-btn);
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border);
  max-width: 420px;
}
.stepper__btn {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  flex: none;
  border-radius: 50%;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-1);
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out), opacity var(--d-fast) var(--ease-out);
}
.stepper__btn:active {
  transform: scale(0.95);
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
}
.stepper__btn:disabled {
  opacity: 0.34;
  pointer-events: none;
}
.stepper__value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 3px;
  flex: 1;
  min-width: 0;
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--c-text-1);
}
.stepper__unit {
  font-size: var(--fs-body);
  font-weight: 500;
  color: var(--c-text-3);
}

/* ---- 氛围灯 ---- */
.ambients {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.ambient {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  min-width: 84px;
  min-height: 88px;
  padding: var(--sp-3);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}
.ambient:active {
  transform: scale(0.97);
}
.ambient--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
}
.ambient__dot {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--c-border-strong);
}
.ambient__dot--plain {
  background: var(--c-surface-sunken);
}
.ambient--on .ambient__dot {
  border: 2px solid var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-weak);
}
.ambient__name {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.ambient--on .ambient__name {
  color: var(--c-accent);
  font-weight: 600;
}

/* ---- 开关行 ---- */
.switch {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  width: 100%;
  min-height: 76px;
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}
.switch:active {
  transform: scale(0.99);
}
.switch--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
}
.switch__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.switch__title {
  font-size: var(--fs-body);
  font-weight: 650;
  color: var(--c-text-1);
}
.switch--on .switch__title {
  color: var(--c-accent);
}
.switch__desc {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.5;
}
.switch__track {
  position: relative;
  flex: none;
  width: 64px;
  height: 36px;
  border-radius: var(--r-btn);
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border-strong);
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.switch--on .switch__track {
  background: var(--c-accent);
  border-color: var(--c-accent);
}
.switch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--c-text-1);
  transition: transform var(--d-base) var(--ease-out), background var(--d-fast) var(--ease-out);
}
.switch--on .switch__knob {
  transform: translateX(28px);
  background: var(--c-on-accent);
}

/* ---- 底部 ---- */
.page__foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  flex-wrap: wrap;
}
.page__footnote {
  flex: 1;
  min-width: 260px;
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: 1.5;
}
.page__tip {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
</style>
