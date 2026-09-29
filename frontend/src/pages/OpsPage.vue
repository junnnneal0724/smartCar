<script setup lang="ts">
/**
 * 演示控制台（/ops）。
 *
 * 定位：给演示者用的工具页，不属于乘客动线。
 * 它比其他页面信息密度高，但视觉仍然是同一套设计令牌，
 * 刻意不做左侧导航、面包屑、斑马纹表格与排序表头。
 *
 * 三块内容：仿真控制 / 运行概览 / 数据落库浏览。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import HoldButton from '@/components/HoldButton.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { opsApi } from '@/api';
import type { OpsOverview } from '@/api/types';
import { formatClock, formatDistance } from '@/map/geo';
import { useRealtimeStore } from '@/stores/realtime';

/** 车辆行为注入项。类型与中文名对齐后端 libs/common/behaviors.ts */
interface BehaviorPreset {
  type: string;
  label: string;
  icon: string;
}

const BEHAVIOR_PRESETS: BehaviorPreset[] = [
  { type: 'YIELD_PEDESTRIAN', label: '礼让行人', icon: 'user' },
  { type: 'TRAFFIC_LIGHT', label: '等待信号灯', icon: 'clock' },
  { type: 'CONGESTION', label: '前方车流缓行', icon: 'motion' },
  { type: 'SLOW_DOWN', label: '减速通过', icon: 'minus' },
  { type: 'LANE_CHANGE', label: '变道中', icon: 'route' },
  { type: 'CROSSWALK', label: '通过路口', icon: 'map' },
  { type: 'TURN', label: '转弯中', icon: 'chevronRight' },
  { type: 'AVOID_OBSTACLE', label: '绕行障碍物', icon: 'alert' },
  { type: 'CRUISE', label: '平稳巡航', icon: 'car' },
];

const SPEEDS = [1, 2, 4, 8, 16];
const TABLE_LIMIT = 30;
const POLL_MS = 2000;
const FEEDBACK_MS = 4200;

const router = useRouter();
const realtime = useRealtimeStore();

const overview = ref<OpsOverview | null>(null);
const loading = ref(true);
const stale = ref(false);
const pending = ref('');
const feedback = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);
const activeBehavior = ref('');
const tableName = ref('');
const tableRows = ref<Record<string, unknown>[]>([]);
const tableLoading = ref(false);

let pollTimer: number | null = null;
let feedbackTimer: number | null = null;

const conn = computed(() => realtime.connected);
const isErr = computed(() => feedback.value?.kind === 'err');
const tables = computed(() => overview.value?.tables ?? []);
const multiplier = computed(() => overview.value?.sim.multiplier ?? 1);
const isPaused = computed(() => overview.value?.sim.paused ?? false);
const rideInfo = computed(() => overview.value?.ride ?? null);
const progressPct = computed(() => Math.round((rideInfo.value?.progress ?? 0) * 100));
const columns = computed<string[]>(() => {
  const keys: string[] = [];
  for (const row of tableRows.value) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
});

function notify(kind: 'ok' | 'err', text: string): void {
  feedback.value = { kind, text };
  if (feedbackTimer !== null) clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    feedback.value = null;
  }, FEEDBACK_MS);
}

function fail(e: unknown, fallback: string): void {
  notify('err', e instanceof Error && e.message ? e.message : fallback);
}

function formatUptime(s: number): string {
  const total = Math.max(0, Math.round(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${total % 60} 秒`;
  return `${total} 秒`;
}

/** 单元格里的值可能是任意 JSON 类型，统一转成一行可读文本 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '空';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

async function loadOverview(): Promise<void> {
  try {
    overview.value = await opsApi.overview();
    stale.value = false;
  } catch (e) {
    // 轮询失败不打断操作，只标记"数据已过期"，避免每 2 秒弹一次错误
    if (loading.value) fail(e, '无法读取运行概览');
    stale.value = true;
  } finally {
    loading.value = false;
  }
}

async function setMultiplier(m: number): Promise<void> {
  if (pending.value) return;
  pending.value = 'sim';
  try {
    const sim = await opsApi.setSim({ multiplier: m });
    if (overview.value) overview.value.sim = sim;
    notify('ok', `仿真倍速已切到 ${m}x`);
  } catch (e) {
    fail(e, '设置倍速失败');
  } finally {
    pending.value = '';
  }
}

async function togglePause(): Promise<void> {
  if (pending.value) return;
  pending.value = 'sim';
  const next = !isPaused.value;
  try {
    const sim = await opsApi.setSim({ paused: next });
    if (overview.value) overview.value.sim = sim;
    notify('ok', next ? '仿真已暂停' : '仿真已继续');
  } catch (e) {
    fail(e, next ? '暂停失败' : '继续失败');
  } finally {
    pending.value = '';
  }
}

async function restartRide(): Promise<void> {
  if (pending.value) return;
  pending.value = 'restart';
  try {
    const r = await opsApi.restart();
    tableName.value = '';
    tableRows.value = [];
    activeBehavior.value = '';
    notify('ok', `已重开一趟行程，新行程编号 ${r.rideId}`);
    await loadOverview();
  } catch (e) {
    fail(e, '重开行程失败');
  } finally {
    pending.value = '';
  }
}

async function jumpArriving(): Promise<void> {
  if (pending.value) return;
  pending.value = 'jump';
  try {
    await opsApi.jumpArriving();
    notify('ok', '已跳到即将到达');
    await loadOverview();
  } catch (e) {
    fail(e, '跳转失败');
  } finally {
    pending.value = '';
  }
}

async function injectBehavior(preset: BehaviorPreset): Promise<void> {
  if (pending.value) return;
  pending.value = `beh:${preset.type}`;
  try {
    await opsApi.behavior(preset.type);
    activeBehavior.value = preset.type;
    notify('ok', `已注入行为：${preset.label}`);
    await loadOverview();
  } catch (e) {
    fail(e, `注入「${preset.label}」失败`);
  } finally {
    pending.value = '';
  }
}

async function loadTable(name: string): Promise<void> {
  tableName.value = name;
  tableLoading.value = true;
  tableRows.value = [];
  try {
    const r = await opsApi.table(name, TABLE_LIMIT);
    tableRows.value = r.rows;
  } catch (e) {
    fail(e, `读取表 ${name} 失败`);
  } finally {
    tableLoading.value = false;
  }
}

onMounted(async () => {
  await loadOverview();
  pollTimer = window.setInterval(() => {
    loadOverview().catch(() => undefined);
  }, POLL_MS);
});

onBeforeUnmount(() => {
  if (pollTimer !== null) clearInterval(pollTimer);
  if (feedbackTimer !== null) clearTimeout(feedbackTimer);
});
</script>

<template>
  <div class="ops">
    <header class="ops__top">
      <button class="ops__back" type="button" @click="router.push('/')">
        <IconBase name="chevronLeft" :size="20" />
        <span>返回车机界面</span>
      </button>

      <div class="ops__brand">
        <p class="ops__eyebrow">演示工具</p>
        <h1 class="ops__title">演示控制台</h1>
      </div>

      <div class="ops__conn" :class="conn ? 'ops__conn--on' : 'ops__conn--off'">
        <span class="ops__dot" aria-hidden="true" />
        <span class="ops__conn-text">
          <span class="ops__conn-label">实时连接</span>
          <span class="ops__conn-value">{{ conn ? '已连接' : '未连接' }}</span>
        </span>
      </div>
    </header>

    <p
      class="ops__feedback"
      :class="feedback ? `ops__feedback--${feedback.kind}` : 'ops__feedback--idle'"
      :role="isErr ? 'alert' : 'status'"
      aria-live="polite"
    >
      {{ feedback ? feedback.text : '这里的每个开关都直接作用于后端仿真，车机页面会立刻跟着变。' }}
    </p>

    <div class="ops__body">
      <div class="ops__left">
        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">仿真控制</h2>
            <p class="panel__lead">改的是后端仿真时钟，不是本地动画。</p>
          </div>

          <p class="field__label">倍速</p>
          <div class="speeds">
            <button
              v-for="m in SPEEDS"
              :key="m"
              type="button"
              class="speeds__btn pressable"
              :class="{ 'speeds__btn--on': multiplier === m }"
              :aria-pressed="multiplier === m"
              :disabled="pending !== ''"
              @click="setMultiplier(m)"
            >
              {{ m }}x
            </button>
          </div>

          <AppButton
            class="wide"
            :variant="isPaused ? 'primary' : 'soft'"
            icon="power"
            :hint="isPaused ? '仿真时钟当前停住' : '仿真时钟正在走'"
            :disabled="pending !== ''"
            @click="togglePause"
          >
            {{ isPaused ? '继续仿真' : '暂停仿真' }}
          </AppButton>

          <p class="field__label">注入车辆行为</p>
          <div class="beh">
            <button
              v-for="b in BEHAVIOR_PRESETS"
              :key="b.type"
              type="button"
              class="beh__btn pressable"
              :class="{ 'beh__btn--on': activeBehavior === b.type }"
              :disabled="pending !== ''"
              @click="injectBehavior(b)"
            >
              <IconBase :name="b.icon" :size="18" />
              <span>{{ b.label }}</span>
            </button>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">行程操作</h2>
            <p class="panel__lead">重开会清空数据库并重新播种，需要长按确认。</p>
          </div>

          <AppButton
            class="wide"
            variant="soft"
            icon="chevronRight"
            hint="把仿真时钟推到到达前一刻"
            :disabled="pending !== ''"
            @click="jumpArriving"
          >
            直接跳到即将到达
          </AppButton>

          <HoldButton
            label="重开一趟行程"
            hint="按住 1.2 秒，会清库并生成新行程"
            icon="sync"
            variant="danger"
            :disabled="pending !== ''"
            @confirm="restartRide"
          />
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">运行概览</h2>
            <p class="panel__lead">
              每 2 秒刷新一次。{{ stale ? '最近一次刷新失败，正在重试。' : '数据来自后端进程本身。' }}
            </p>
          </div>

          <SkeletonBlock v-if="loading" :rows="7" :height="16" />

          <template v-else-if="overview">
            <dl class="kv">
              <div class="kv__item">
                <dt>进程 PID</dt>
                <dd class="num">{{ overview.process.pid }}</dd>
              </div>
              <div class="kv__item">
                <dt>Node 版本</dt>
                <dd class="num">{{ overview.process.node }}</dd>
              </div>
              <div class="kv__item">
                <dt>运行时长</dt>
                <dd class="num">{{ formatUptime(overview.process.uptimeS) }}</dd>
              </div>
              <div class="kv__item">
                <dt>内存占用</dt>
                <dd class="num">{{ overview.process.rssMb }} MB</dd>
              </div>
              <div class="kv__item">
                <dt>仿真时钟</dt>
                <dd class="num">{{ formatClock(overview.sim.simClockMs / 1000) }}</dd>
              </div>
              <div class="kv__item">
                <dt>倍速 / 步长</dt>
                <dd class="num">{{ overview.sim.multiplier }}x / {{ overview.sim.tickMs }}ms</dd>
              </div>
              <div class="kv__item">
                <dt>仿真车辆数</dt>
                <dd class="num">{{ overview.sim.vehicles }}</dd>
              </div>
              <div class="kv__item">
                <dt>车机绑定车辆</dt>
                <dd class="num">{{ overview.terminalVehicle }}</dd>
              </div>
              <div class="kv__item kv__item--wide">
                <dt>实时订阅</dt>
                <dd class="num">当前 {{ overview.realtime.subscribers }} / 峰值 {{ overview.realtime.peak }}</dd>
              </div>
            </dl>

            <div class="ride">
              <template v-if="rideInfo">
                <p class="ride__no num">{{ rideInfo.rideNo }}</p>
                <p class="ride__route">{{ rideInfo.origin }} 到 {{ rideInfo.dest }}</p>
                <p class="ride__meta">
                  <span class="num">{{ rideInfo.status }}</span>
                  <span>已行驶 <span class="num">{{ formatDistance(rideInfo.traveledM) }}</span></span>
                  <span>全程 <span class="num">{{ formatDistance(rideInfo.planDistanceM) }}</span></span>
                </p>
                <div class="bar" role="img" :aria-label="`行程进度 ${progressPct}%`">
                  <span class="bar__fill" :style="{ width: `${progressPct}%` }" />
                </div>
                <p class="ride__pct num">{{ progressPct }}%</p>
              </template>
              <p v-else class="ride__empty">
                当前没有进行中的行程。用上面的「重开一趟行程」可以生成一条新行程。
              </p>
            </div>
          </template>
        </section>
      </div>

      <section class="panel panel--browse">
        <div class="panel__head">
          <h2 class="panel__title">数据落库浏览</h2>
          <p class="panel__lead">左侧是数据库里的表与行数，点一张表看它最近 {{ TABLE_LIMIT }} 行。</p>
        </div>

        <div class="browse">
          <div class="browse__tables">
            <SkeletonBlock v-if="loading" :rows="6" :height="18" />
            <template v-else>
              <p v-if="tables.length === 0" class="browse__none">数据库里还没有可浏览的表。</p>
              <button
                v-for="t in tables"
                :key="t.name"
                type="button"
                class="tbl"
                :class="{ 'tbl--on': tableName === t.name }"
                @click="loadTable(t.name)"
              >
                <span class="tbl__name">{{ t.name }}</span>
                <span class="tbl__rows num">{{ t.rows }}</span>
              </button>
            </template>
          </div>

          <div class="browse__data">
            <SkeletonBlock v-if="tableLoading" :rows="9" :height="14" />

            <EmptyState
              v-else-if="!tableName"
              icon="list"
              title="还没有选择数据表"
              detail="左侧列出的是当前数据库里的表与行数。点一张表，这里会显示它的原始记录。"
            />

            <EmptyState
              v-else-if="tableRows.length === 0"
              icon="info"
              title="这张表暂时没有记录"
              detail="在车机界面上完成一次操作后，写入的记录会出现在这里。"
            >
              <template #action>
                <AppButton variant="ghost" icon="sync" @click="loadTable(tableName)">重新读取</AppButton>
              </template>
            </EmptyState>

            <div v-else class="grid">
              <table class="grid__table">
                <thead>
                  <tr>
                    <th v-for="c in columns" :key="c" scope="col">{{ c }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in tableRows" :key="i">
                    <td v-for="c in columns" :key="c" :title="cellText(row[c])">{{ cellText(row[c]) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ops {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-6);
  background: var(--c-bg);
  color: var(--c-text-1);
  overflow: hidden;
}

/* ---------------------------------------------------------------- 顶栏 */
.ops__top {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}
.ops__back {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 56px;
  padding: 0 var(--sp-4) 0 var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  background: var(--c-surface);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  font-weight: 550;
  transition: color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.ops__back:active {
  color: var(--c-text-1);
  border-color: var(--c-border-strong);
}
.ops__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ops__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.ops__title {
  font-size: var(--fs-title-l);
  font-weight: 700;
}
.ops__conn {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 56px;
  margin-left: auto;
  padding: 0 var(--sp-5);
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  background: var(--c-surface);
}
.ops__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c-text-3);
}
.ops__conn--on .ops__dot {
  background: var(--c-success);
}
.ops__conn--off .ops__dot {
  background: var(--c-warn);
}
.ops__conn-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ops__conn-label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.ops__conn-value {
  font-size: var(--fs-body-s);
  font-weight: 600;
}
.ops__conn--off .ops__conn-value {
  color: var(--c-warn);
}

/* ---------------------------------------------------------------- 就地反馈 */
.ops__feedback {
  flex: none;
  min-height: 26px;
  margin-top: calc(var(--sp-3) * -1);
  font-size: var(--fs-body-s);
}
.ops__feedback--idle {
  color: var(--c-text-3);
}
.ops__feedback--ok {
  color: var(--c-success);
}
.ops__feedback--err {
  color: var(--c-danger);
}

/* ---------------------------------------------------------------- 主体两栏 */
.ops__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr);
  gap: var(--sp-4);
}
.ops__left {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-height: 0;
  overflow-y: auto;
  padding-right: var(--sp-1);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
}
.panel--browse {
  min-height: 0;
  overflow: hidden;
}
.panel__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.panel__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
}
.panel__lead {
  font-size: var(--fs-caption);
  color: var(--c-text-2);
  line-height: 1.5;
}
.field__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.08em;
}
.wide {
  width: 100%;
}

/* ---------------------------------------------------------------- 倍速 */
.speeds {
  display: flex;
  gap: var(--sp-2);
}
.speeds__btn {
  flex: 1;
  min-height: 56px;
  min-width: 56px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: var(--c-surface-raised);
  color: var(--c-text-2);
  font-family: var(--font-num);
  font-size: var(--fs-body-s);
  font-weight: 600;
  transition: background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out),
    border-color var(--d-fast) var(--ease-out);
}
.speeds__btn--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent);
  color: var(--c-accent);
}
.speeds__btn:disabled {
  opacity: 0.5;
}

/* ---------------------------------------------------------------- 行为注入 */
.beh {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2);
}
.beh__btn {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 56px;
  padding: 0 var(--sp-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-input);
  background: var(--c-surface-raised);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out),
    border-color var(--d-fast) var(--ease-out);
}
.beh__btn--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent);
  color: var(--c-accent);
}
.beh__btn:disabled {
  opacity: 0.5;
}

/* ---------------------------------------------------------------- 概览 */
.kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2) var(--sp-4);
  margin: 0;
}
.kv__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.kv__item--wide {
  grid-column: 1 / -1;
}
.kv dt {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.kv dd {
  margin: 0;
  font-size: var(--fs-body-s);
  color: var(--c-text-1);
}

.ride {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-input);
  background: var(--c-surface-sunken);
}
.ride__no {
  font-size: var(--fs-body-s);
  font-weight: 650;
}
.ride__route {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.ride__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-4);
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.ride__pct {
  font-size: var(--fs-caption);
  color: var(--c-text-2);
  text-align: right;
}
.ride__empty {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.6;
}
.bar {
  height: 8px;
  border-radius: var(--r-btn);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  overflow: hidden;
}
.bar__fill {
  display: block;
  height: 100%;
  border-radius: var(--r-btn);
  background: var(--c-accent);
  transition: width var(--d-slow) var(--ease-out);
}

/* ---------------------------------------------------------------- 数据浏览 */
.browse {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: var(--sp-3);
}
.browse__tables {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-height: 0;
  overflow-y: auto;
  padding-right: var(--sp-1);
}
.browse__none {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.browse__data {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--c-border);
  border-radius: var(--r-input);
  background: var(--c-surface-sunken);
  overflow: hidden;
}

.tbl {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  min-height: 56px;
  padding: 0 var(--sp-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-input);
  background: var(--c-surface-raised);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out),
    border-color var(--d-fast) var(--ease-out);
}
.tbl--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent);
  color: var(--c-accent);
}
.tbl__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tbl__rows {
  flex: none;
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.tbl--on .tbl__rows {
  color: var(--c-accent);
}

.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.grid__table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-family: var(--font-num);
  font-size: var(--fs-caption);
}
.grid__table th,
.grid__table td {
  max-width: 220px;
  padding: 6px var(--sp-3);
  border-bottom: 1px solid var(--c-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-weight: 450;
}
.grid__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--c-surface);
  color: var(--c-text-3);
  font-weight: 550;
}
.grid__table td {
  color: var(--c-text-2);
}
.grid__table tbody tr:last-child td {
  border-bottom: none;
}
</style>
