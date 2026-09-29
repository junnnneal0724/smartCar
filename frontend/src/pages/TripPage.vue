<script setup lang="ts">
/**
 * 行程主界面。
 *
 * 这是乘客 90% 时间都在看的一屏，所以它刻意只做三件事：
 *   1. 地图占满主内容区，让人随时知道车在哪、往哪走
 *   2. 决策气泡安静地叠在地图左下角，解释"它刚才为什么那样开"
 *   3. 一条贴在底部的行驶信息条，扫一眼就知道车速、道路、里程、还要多久
 *
 * 不做仪表盘、不做卡片墙：行驶中盯着屏幕会晕车，信息越少越稳。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MapCanvas from '@/map/MapCanvas.vue';
import DecisionBubble from '@/components/DecisionBubble.vue';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import { useRideStore } from '@/stores/ride';
import { useRealtimeStore } from '@/stores/realtime';
import { useSessionStore } from '@/stores/session';
import { formatDistance, formatDuration } from '@/map/geo';

const router = useRouter();
const ride = useRideStore();
const realtime = useRealtimeStore();
const session = useSessionStore();

const error = ref('');
const starting = ref(false);

/** 车速与道路优先取实时推送，推送还没到时回落到最近一次拉取的车辆快照 */
const vehicleId = computed(() => ride.vehicle?.id ?? session.vehicle?.id ?? 'V-01');
const track = computed(() => realtime.trackOf(vehicleId.value) ?? null);
const speedKph = computed(() => Math.round(track.value?.speedKph ?? ride.vehicle?.speedKph ?? 0));
const roadName = computed(() => track.value?.roadName || ride.vehicle?.roadName || '正在定位所在道路');
const behaviorShort = computed(() => ride.behavior?.short ?? ride.view?.statusLabel ?? '待命中');

/* ------------------------------------------------------------ 出发前的过渡态 */

const showGuide = computed(() => !ride.isOngoing);
const guideTitle = computed(() => {
  if (!ride.view) return '行程即将开始';
  if (ride.status === 'ARRIVED') return '车辆已经停稳';
  if (ride.status === 'COMPLETED') return '这段行程已经结束';
  return '行程即将开始';
});
const guideDetail = computed(() => {
  if (!ride.view) return '正在读取这一段行程的信息，稍等一下就能开始。';
  if (ride.status === 'ARRIVED') return '可以准备下车了，开门之前先看一眼后方有没有来车。';
  if (ride.status === 'COMPLETED') return '行程小结里能看到这段路的速度曲线与费用构成。';
  return '系好安全带之后按下开始行程，车辆才会起步。';
});
const canStart = computed(() => !!ride.view && (ride.status === 'READY' || ride.status === 'ABOARD'));
const startHint = computed(() => (canStart.value ? '确认之后车辆才会起步' : '车辆准备中，稍后就能开始'));
/** 注意：store 在没有行程时会把 status 兜底成 COMPLETED，所以先判 view 是否存在 */
const guideAction = computed<'start' | 'alight' | 'summary'>(() => {
  if (!ride.view) return 'start';
  if (ride.status === 'ARRIVED') return 'alight';
  if (ride.status === 'COMPLETED') return 'summary';
  return 'start';
});

async function onStart(): Promise<void> {
  if (!canStart.value || starting.value) return;
  starting.value = true;
  error.value = '';
  try {
    await ride.start();
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '暂时没能开始行程，请再试一次';
  } finally {
    starting.value = false;
  }
}

onMounted(() => {
  ride.refresh().catch(() => undefined);
  ride.fetchEvents(20).catch(() => undefined);
});
</script>

<template>
  <div class="trip">
    <div class="trip__stage">
      <MapCanvas :follow="true" :scale="0.62" :interactive="true" />

      <!-- 决策气泡：把它的定位锚点抬到行驶信息条上方，避免两条信息叠在一起 -->
      <div class="trip__bubble">
        <DecisionBubble />
      </div>

      <button class="explain pressable" type="button" @click="router.push('/trip/explain')">
        <IconBase name="question" :size="18" />
        <span>这趟车都经历了什么</span>
        <IconBase name="chevronRight" :size="16" />
      </button>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>

      <!-- 行驶信息条：半透明浮在地图底部，一条横向的读数，不做卡片 -->
      <div v-if="ride.isOngoing" class="runbar">
        <div class="runbar__item">
          <span class="runbar__label">当前车速</span>
          <span class="runbar__value">
            <span class="num">{{ speedKph }}</span>
            <span class="runbar__unit">km/h</span>
          </span>
        </div>
        <div class="runbar__item runbar__item--road">
          <span class="runbar__label">当前道路</span>
          <span class="runbar__value">{{ roadName }}</span>
        </div>
        <div class="runbar__item">
          <span class="runbar__label">已行驶</span>
          <span class="runbar__value num">{{ formatDistance(ride.traveledM) }}</span>
        </div>
        <div class="runbar__item">
          <span class="runbar__label">剩余里程</span>
          <span class="runbar__value num">{{ formatDistance(ride.remainDistanceM) }}</span>
        </div>
        <div class="runbar__item">
          <span class="runbar__label">剩余时间</span>
          <span class="runbar__value num">{{ formatDuration(ride.remainTimeS) }}</span>
        </div>
        <div class="runbar__item runbar__item--behavior">
          <span class="runbar__label">本车行为</span>
          <span class="runbar__value">{{ behaviorShort }}</span>
        </div>
      </div>

      <!-- 出发前 / 已到达的过渡态：地图还在，但主角是"现在该做什么" -->
      <div v-if="showGuide" class="guide">
        <div class="guide__card">
          <span class="guide__badge">
            <IconBase :name="guideAction === 'alight' ? 'door' : 'car'" :size="28" />
          </span>
          <p class="guide__title">{{ guideTitle }}</p>
          <p class="guide__detail">{{ guideDetail }}</p>
          <div class="guide__action">
            <AppButton
              v-if="guideAction === 'alight'"
              variant="primary"
              size="xl"
              icon="door"
              block
              @click="router.push('/alight')"
            >
              去准备下车
            </AppButton>
            <AppButton
              v-else-if="guideAction === 'summary'"
              variant="primary"
              size="xl"
              icon="list"
              block
              @click="router.push('/summary')"
            >
              查看行程小结
            </AppButton>
            <AppButton
              v-else
              variant="primary"
              size="xl"
              icon="check"
              block
              :loading="starting"
              :disabled="!canStart"
              :hint="startHint"
              @click="onStart"
            >
              开始行程
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trip {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: var(--sp-4);
}

.trip__stage {
  position: relative;
  flex: 1;
  min-height: 0;
  --bar-h: 78px;
}

/* 零高度的定位锚：气泡自己带 absolute 定位（bottom: sp-5），
   这里只把它的基准线抬到行驶信息条上方，两条信息就不会叠在一起 */
.trip__bubble {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--bar-h);
  height: 0;
  z-index: 4;
}

.explain {
  position: absolute;
  top: var(--sp-4);
  right: calc(var(--sp-4) + 48px + var(--sp-3));
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 56px;
  padding: 0 var(--sp-5);
  border-radius: var(--r-btn);
  background: color-mix(in srgb, var(--c-surface) 78%, transparent);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  backdrop-filter: blur(10px);
  transition: color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.explain:active {
  color: var(--c-text-1);
  border-color: var(--c-border-strong);
}

.alert {
  position: absolute;
  top: var(--sp-4);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  max-width: 56ch;
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-chip);
  background: var(--c-danger-weak);
  border: 1px solid color-mix(in srgb, var(--c-danger) 40%, transparent);
  color: var(--c-danger);
  font-size: var(--fs-body-s);
}

/* ---- 行驶信息条 ---- */
.runbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  min-height: var(--bar-h);
  padding: var(--sp-3) var(--sp-5);
  border: 1px solid var(--c-border);
  border-radius: 0 0 var(--r-card) var(--r-card);
  background: color-mix(in srgb, var(--c-surface) 80%, transparent);
  backdrop-filter: blur(14px);
}
.runbar__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 0 1 auto;
}
.runbar__item + .runbar__item {
  margin-left: var(--sp-5);
  padding-left: var(--sp-5);
  border-left: 1px solid var(--c-border);
}
.runbar__item--road {
  flex: 0 1 auto;
  max-width: 22ch;
}
.runbar__item--behavior {
  flex: 1 1 auto;
  min-width: 12ch;
}
.runbar__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.08em;
}
.runbar__value {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.runbar__unit {
  margin-left: 4px;
  font-size: var(--fs-caption);
  font-weight: 450;
  color: var(--c-text-3);
}

/* ---- 出发前 / 已到达 ---- */
.guide {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  padding: var(--sp-6);
  border-radius: var(--r-card);
  background: color-mix(in srgb, var(--c-bg) 64%, transparent);
  backdrop-filter: blur(3px);
}
.guide__card {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  box-shadow: var(--sh-2);
  text-align: center;
}
.guide__badge {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-accent);
}
.guide__title {
  font-size: var(--fs-title-l);
  font-weight: 700;
  color: var(--c-text-1);
}
.guide__detail {
  max-width: 38ch;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: var(--lh-body);
}
.guide__action {
  width: 100%;
  margin-top: var(--sp-2);
}
</style>
