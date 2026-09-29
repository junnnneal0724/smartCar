<script setup lang="ts">
/**
 * 座舱控制（/cabin）
 *
 * 车内最"立刻有用"的一屏：把环境调到舒服。
 * 三条设计决定：
 *   1. 场景卡放最上面。乘客最想要的是"一键变舒服"，逐项调节是次要路径。
 *   2. 温度用大号加减，不用滑条。车在晃，小滑条按不准；加减按钮闭着眼也能按。
 *   3. 每个写操作都是乐观更新（store 已实现），失败会自动回滚，这里就地提示。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { icons } from '@/components/icons';
import { useCabinStore } from '@/stores/cabin';
import { useSessionStore } from '@/stores/session';
import type { CabinSetting, ScenePreset } from '@/api/types';

const router = useRouter();
const cabin = useCabinStore();
const session = useSessionStore();

const error = ref('');
const sceneKey = ref('');
/** 记住静音前的音量：静音是"快捷键"，要能一键还原 */
const volumeBeforeMute = ref(30);

/** 后端给的是场景 key，图标要映射到图标集里真实存在的名字 */
const SCENE_ICONS: Record<string, string> = {
  standard: 'car',
  sleep: 'moon',
  work: 'briefcase',
  relax: 'sparkle',
  motion: 'motion',
};

function sceneIcon(scene: ScenePreset): string {
  return SCENE_ICONS[scene.key] ?? (icons[scene.icon] ? scene.icon : 'sparkle');
}

/** 控件在 setting 到达前不该被渲染，用一个兜底值让模板不必到处判空 */
const FALLBACK: CabinSetting = {
  tempLeft: 24,
  tempRight: 24,
  fanLevel: 2,
  seatHeat: 0,
  seatVent: 0,
  ambientLight: 'warm',
  brightness: 60,
  volume: 30,
  curtain: 0,
  scene: 'custom',
};
const s = computed<CabinSetting>(() => cabin.setting ?? FALLBACK);

const tempRange = computed(() => cabin.ranges?.temp ?? { min: 16, max: 30, step: 0.5 });
const fanLevels = computed(() => Array.from({ length: (cabin.ranges?.fan.max ?? 3) + 1 }, (_, i) => i));
const seatLevels = computed(() => Array.from({ length: (cabin.ranges?.seat.max ?? 3) + 1 }, (_, i) => i));
const brightStep = computed(() => {
  const r = cabin.ranges?.brightness ?? { min: 10, max: 100 };
  return Math.max(1, Math.round((r.max - r.min) / 9));
});
const brightRange = computed(() => cabin.ranges?.brightness ?? { min: 10, max: 100 });
const volumeRange = computed(() => cabin.ranges?.volume ?? { min: 0, max: 100 });
const volumeSteps = computed(() => {
  const r = volumeRange.value;
  return Array.from({ length: 5 }, (_, i) => Math.round(r.min + ((r.max - r.min) * i) / 4));
});

const FAN_LABELS = ['关闭', '低', '中', '高'];
const SEAT_LABELS = ['关闭', '低', '中', '高'];
const VOLUME_LABELS = ['静音', '轻', '适中', '偏大', '最大'];

function levelLabel(labels: string[], value: number): string {
  return labels[value] ?? String(value);
}

/** 统一的写操作出口：乐观更新 + 失败回滚 + 就地提示 */
async function patch(next: Partial<CabinSetting>): Promise<void> {
  error.value = '';
  try {
    await cabin.update(next);
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '调节没有生效，请再按一次';
  }
}

async function chooseScene(key: string): Promise<void> {
  error.value = '';
  sceneKey.value = key;
  try {
    await cabin.applyScene(key);
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '场景没有切换成功，请再试一次';
  } finally {
    sceneKey.value = '';
  }
}

function stepTemp(side: 'left' | 'right', direction: number): void {
  const r = tempRange.value;
  const current = side === 'left' ? s.value.tempLeft : s.value.tempRight;
  const raw = current + direction * r.step;
  const next = Math.min(r.max, Math.max(r.min, Math.round(raw * 2) / 2));
  if (next === current) return;
  void patch(side === 'left' ? { tempLeft: next } : { tempRight: next });
}

function stepBrightness(direction: number): void {
  const r = brightRange.value;
  const next = Math.min(r.max, Math.max(r.min, s.value.brightness + direction * brightStep.value));
  if (next === s.value.brightness) return;
  void patch({ brightness: next });
}

function setVolume(value: number): void {
  if (value > 0) volumeBeforeMute.value = value;
  void patch({ volume: value });
}

function toggleMute(): void {
  if (s.value.volume > 0) {
    volumeBeforeMute.value = s.value.volume;
    void patch({ volume: 0 });
    return;
  }
  void patch({ volume: volumeBeforeMute.value || 30 });
}

async function reload(): Promise<void> {
  error.value = '';
  await cabin.load();
}

onMounted(() => {
  if (!cabin.setting) void cabin.load();
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">座舱</p>
      <h1 class="page__title">环境控制</h1>
      <p class="page__lead">先挑一个场景，再按需要微调。手动调过任意一项后，场景会变成「自定义」。</p>
    </header>

    <p v-if="error" class="alert" role="alert">
      <IconBase name="alert" :size="18" />
      {{ error }}
    </p>

    <div v-if="cabin.loading && !cabin.setting" class="card">
      <SkeletonBlock :rows="4" :height="22" />
    </div>

    <EmptyState
      v-else-if="!cabin.setting"
      icon="fan"
      title="座舱状态还没读上来"
      detail="可能是车机刚唤醒，或者和车辆的连接不稳。点下面的按钮再读一次。"
    >
      <template #action>
        <AppButton size="lg" icon="sync" @click="reload">重新读取座舱状态</AppButton>
      </template>
    </EmptyState>

    <template v-else>
      <!-- 场景：乘客最想要的是"一键变舒服" -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">一键切换场景</h2>
          <span class="chip">当前：{{ cabin.sceneName }}</span>
        </div>
        <p class="card__note">容易晕车的乘客请直接选「舒缓」，它会加大新风、调低屏幕亮度，盯着屏幕会舒服不少。</p>
        <div class="scenes">
          <button
            v-for="scene in cabin.scenes"
            :key="scene.key"
            class="scene"
            :class="{ 'scene--on': s.scene === scene.key, 'scene--busy': sceneKey === scene.key }"
            type="button"
            @click="chooseScene(scene.key)"
          >
            <span class="scene__icon"><IconBase :name="sceneIcon(scene)" :size="24" /></span>
            <span class="scene__name">{{ scene.name }}</span>
            <span class="scene__desc">{{ scene.desc }}</span>
            <span v-if="scene.key === 'motion'" class="scene__tag">晕车乘客建议选它</span>
          </button>
        </div>
      </section>

      <div class="grid">
        <!-- 温度：左右分区，大号加减 -->
        <section class="card card--wide">
          <div class="card__head">
            <h2 class="card__title">
              <IconBase name="thermometer" :size="20" />
              温度
            </h2>
            <span class="chip">左右可以分开调</span>
          </div>
          <div class="zones">
            <div class="zone">
              <p class="zone__name">左侧</p>
              <div class="stepper">
                <button
                  class="stepper__btn"
                  type="button"
                  aria-label="左侧温度调低半度"
                  :disabled="s.tempLeft <= tempRange.min"
                  @click="stepTemp('left', -1)"
                >
                  <IconBase name="minus" :size="26" />
                </button>
                <p class="stepper__value">
                  <span class="num">{{ s.tempLeft.toFixed(1) }}</span>
                  <span class="stepper__unit">°C</span>
                </p>
                <button
                  class="stepper__btn"
                  type="button"
                  aria-label="左侧温度调高半度"
                  :disabled="s.tempLeft >= tempRange.max"
                  @click="stepTemp('left', 1)"
                >
                  <IconBase name="plus" :size="26" />
                </button>
              </div>
            </div>

            <div class="zone">
              <p class="zone__name">右侧</p>
              <div class="stepper">
                <button
                  class="stepper__btn"
                  type="button"
                  aria-label="右侧温度调低半度"
                  :disabled="s.tempRight <= tempRange.min"
                  @click="stepTemp('right', -1)"
                >
                  <IconBase name="minus" :size="26" />
                </button>
                <p class="stepper__value">
                  <span class="num">{{ s.tempRight.toFixed(1) }}</span>
                  <span class="stepper__unit">°C</span>
                </p>
                <button
                  class="stepper__btn"
                  type="button"
                  aria-label="右侧温度调高半度"
                  :disabled="s.tempRight >= tempRange.max"
                  @click="stepTemp('right', 1)"
                >
                  <IconBase name="plus" :size="26" />
                </button>
              </div>
            </div>
          </div>
          <p class="card__note">怕冷的那位可以把属于自己那一侧调高一度，不用两个人迁就一个温度。</p>
        </section>

        <!-- 风量 -->
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">
              <IconBase name="fan" :size="20" />
              风量
            </h2>
            <span class="chip">{{ levelLabel(FAN_LABELS, s.fanLevel) }}</span>
          </div>
          <div class="levels">
            <button
              v-for="lv in fanLevels"
              :key="lv"
              class="level"
              :class="{ 'level--on': s.fanLevel === lv }"
              type="button"
              @click="patch({ fanLevel: lv })"
            >
              <span class="level__label">{{ levelLabel(FAN_LABELS, lv) }}</span>
              <span class="level__sub num">{{ lv }}</span>
            </button>
          </div>
          <p class="card__note">有点闷或者头晕的时候，新风开到中档以上会舒服些。</p>
        </section>

        <!-- 遮阳帘 -->
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">
              <IconBase name="curtain" :size="20" />
              遮阳帘
            </h2>
            <span class="chip">{{ s.curtain === 1 ? '已打开' : '已收起' }}</span>
          </div>
          <div class="levels levels--two">
            <button
              class="level level--tall"
              :class="{ 'level--on': s.curtain === 1 }"
              type="button"
              @click="patch({ curtain: 1 })"
            >
              <span class="level__label">打开</span>
              <span class="level__sub">挡住侧窗的阳光</span>
            </button>
            <button
              class="level level--tall"
              :class="{ 'level--on': s.curtain === 0 }"
              type="button"
              @click="patch({ curtain: 0 })"
            >
              <span class="level__label">收起</span>
              <span class="level__sub">看得到窗外的风景</span>
            </button>
          </div>
          <p class="card__note">下午西晒的时候拉上，屏幕和眼睛都会轻松一点。</p>
        </section>

        <!-- 座椅 -->
        <section class="card card--wide">
          <div class="card__head">
            <h2 class="card__title">
              <IconBase name="seat" :size="20" />
              座椅
            </h2>
            <span class="chip">加热 {{ levelLabel(SEAT_LABELS, s.seatHeat) }} · 通风 {{ levelLabel(SEAT_LABELS, s.seatVent) }}</span>
          </div>

          <div class="seatrow">
            <p class="seatrow__name">加热</p>
            <div class="levels">
              <button
                v-for="lv in seatLevels"
                :key="`heat-${lv}`"
                class="level"
                :class="{ 'level--on': s.seatHeat === lv }"
                type="button"
                @click="patch({ seatHeat: lv })"
              >
                <span class="level__label">{{ levelLabel(SEAT_LABELS, lv) }}</span>
              </button>
            </div>
          </div>

          <div class="seatrow">
            <p class="seatrow__name">通风</p>
            <div class="levels">
              <button
                v-for="lv in seatLevels"
                :key="`vent-${lv}`"
                class="level"
                :class="{ 'level--on': s.seatVent === lv }"
                type="button"
                @click="patch({ seatVent: lv })"
              >
                <span class="level__label">{{ levelLabel(SEAT_LABELS, lv) }}</span>
              </button>
            </div>
          </div>
          <p class="card__note">加热和通风不要同时开，选一个就好，不然座椅会一边热一边吹风。</p>
        </section>

        <!-- 氛围灯 -->
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">
              <IconBase name="bulb" :size="20" />
              氛围灯
            </h2>
          </div>
          <div class="ambients">
            <button
              v-for="opt in cabin.ambientOptions"
              :key="opt.key"
              class="ambient"
              :class="{ 'ambient--on': s.ambientLight === opt.key }"
              type="button"
              @click="patch({ ambientLight: opt.key })"
            >
              <span class="ambient__dot" :style="{ background: opt.color }" />
              <span class="ambient__name">{{ opt.name }}</span>
            </button>
          </div>
          <p class="card__note">想眯一会儿就选「关闭」，车厢会暗下来，更容易睡着。</p>
        </section>

        <!-- 屏幕亮度 -->
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">
              <IconBase name="sparkle" :size="20" />
              屏幕亮度
            </h2>
          </div>
          <div class="stepper">
            <button
              class="stepper__btn"
              type="button"
              aria-label="屏幕调暗"
              :disabled="s.brightness <= brightRange.min"
              @click="stepBrightness(-1)"
            >
              <IconBase name="minus" :size="26" />
            </button>
            <p class="stepper__value">
              <span class="num">{{ s.brightness }}</span>
              <span class="stepper__unit">%</span>
            </p>
            <button
              class="stepper__btn"
              type="button"
              aria-label="屏幕调亮"
              :disabled="s.brightness >= brightRange.max"
              @click="stepBrightness(1)"
            >
              <IconBase name="plus" :size="26" />
            </button>
          </div>
          <p class="card__note">调低屏幕亮度、加大新风，能缓解晕车。</p>
        </section>

        <!-- 音量 -->
        <section class="card card--wide">
          <div class="card__head">
            <h2 class="card__title">
              <IconBase name="volume" :size="20" />
              音量
            </h2>
            <span class="chip">{{ s.volume === 0 ? '已静音' : `${s.volume}%` }}</span>
          </div>
          <div class="volrow">
            <div class="levels">
              <button
                v-for="(v, i) in volumeSteps"
                :key="v"
                class="level"
                :class="{ 'level--on': s.volume === v }"
                type="button"
                @click="setVolume(v)"
              >
                <span class="level__label">{{ VOLUME_LABELS[i] }}</span>
              </button>
            </div>
            <AppButton
              size="lg"
              :icon="s.volume === 0 ? 'volume' : 'volumeOff'"
              @click="toggleMute"
            >
              {{ s.volume === 0 ? '恢复音量' : '静音' }}
            </AppButton>
          </div>
          <p class="card__note">车速和导航提示音会保留一点点，其余声音都按你选的音量播。</p>
        </section>
      </div>
    </template>
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
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

.alert {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-input);
  background: var(--c-danger-weak);
  border: 1px solid color-mix(in srgb, var(--c-danger) 40%, transparent);
  color: var(--c-danger);
  font-size: var(--fs-body-s);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--sp-4);
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
.card--wide {
  grid-column: 1 / -1;
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

/* ---- 场景卡 ---- */
.scenes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: var(--sp-3);
}
.scene {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-height: 148px;
  padding: var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out), opacity var(--d-fast) var(--ease-out);
}
.scene:active {
  transform: scale(0.985);
}
.scene--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
}
.scene--busy {
  opacity: 0.6;
}
.scene__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--r-input);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
}
.scene--on .scene__icon {
  background: var(--c-surface);
  border-color: var(--c-accent-border);
  color: var(--c-accent);
}
.scene__name {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}
.scene--on .scene__name {
  color: var(--c-accent);
}
.scene__desc {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: 1.45;
}
.scene--on .scene__desc {
  color: var(--c-text-2);
}
.scene__tag {
  margin-top: auto;
  padding: 4px var(--sp-3);
  border-radius: var(--r-chip);
  background: var(--c-surface);
  border: 1px solid var(--c-accent-border);
  color: var(--c-accent);
  font-size: var(--fs-caption);
}

/* ---- 温度分区 ---- */
.zones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--sp-4);
}
.zone {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
}
.zone__name {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
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

/* ---- 档位块 ---- */
.levels {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.level {
  flex: 1 1 84px;
  min-height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    color var(--d-fast) var(--ease-out), transform var(--d-fast) var(--ease-out);
}
.level:active {
  transform: scale(0.97);
}
.level--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
  color: var(--c-accent);
}
.level__label {
  font-size: var(--fs-body-s);
  font-weight: 600;
}
.level__sub {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.level--on .level__sub {
  color: var(--c-accent);
}
.levels--two .level {
  flex: 1 1 140px;
}
.level--tall {
  min-height: 76px;
}
.level--tall .level__sub {
  font-weight: 450;
}

/* ---- 座椅 ---- */
.seatrow {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}
.seatrow__name {
  flex: none;
  width: 56px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.seatrow .levels {
  flex: 1;
  min-width: 0;
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

/* ---- 音量行 ---- */
.volrow {
  display: flex;
  align-items: stretch;
  gap: var(--sp-4);
}
.volrow .levels {
  flex: 1;
  min-width: 0;
}
</style>
