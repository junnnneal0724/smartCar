<script setup lang="ts">
/**
 * 车辆前往上车点（ride.status === 'PENDING'，默认外壳）。
 *
 * 乘客站在路边，最想知道三件事：车在哪、还有多远、我该站在哪。
 * 所以这一屏只有：一张地图 + 一条叠在地图上的信息条 + 一行上车点。
 *
 * 等待动效刻意做成"缓慢流动的光带"而不是转圈：
 * 车内的进度感应该是平稳的，转圈会让人焦虑，也更容易晕车。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import IconBase from '@/components/IconBase.vue';
import MapCanvas from '@/map/MapCanvas.vue';
import { distanceM, formatDistance, formatDuration, formatTime } from '@/map/geo';
import { useRealtimeStore } from '@/stores/realtime';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';

const router = useRouter();
const ride = useRideStore();
const realtime = useRealtimeStore();
const session = useSessionStore();

/**
 * 车辆位置是 2Hz 推送且直接改在 track 对象上（不换引用），
 * 所以用一个每秒递增的 tick 驱动距离重算，保证"还有多远"一直在动。
 */
const tick = ref(0);
let tickTimer: number | null = null;

onMounted(() => {
  tickTimer = window.setInterval(() => {
    tick.value += 1;
  }, 1000);
});

onBeforeUnmount(() => {
  if (tickTimer !== null) window.clearInterval(tickTimer);
});

const view = computed(() => ride.view ?? session.ride);
const vehicleId = computed(() => ride.vehicle?.id ?? session.vehicle?.id ?? 'V-01');
const arrived = computed(() => view.value?.status === 'ABOARD');
const originName = computed(() => view.value?.origin.name ?? '上车点');

const position = computed(() => {
  void tick.value;
  const t = realtime.trackOf(vehicleId.value);
  if (!t) return null;
  return { lng: t.curLng, lat: t.curLat, speedKph: t.speedKph, roadName: t.roadName };
});

const roadName = computed(() => position.value?.roadName || ride.vehicle?.roadName || '正在规划路线');

const distanceToPickupM = computed(() => {
  const p = position.value;
  const o = view.value?.origin;
  if (!p || !o) return null;
  return distanceM({ lng: p.lng, lat: p.lat }, { lng: o.lng, lat: o.lat });
});

const etaS = computed(() => {
  const fromServer = view.value?.remainTimeS ?? 0;
  if (fromServer > 0) return fromServer;
  const d = distanceToPickupM.value;
  if (d === null) return null;
  const speedKph = position.value?.speedKph ?? 0;
  // 车辆几乎停住时速度不能拿来估算，用城市工况的 25km/h 兜底
  const mps = speedKph > 4 ? (speedKph * 1000) / 3600 : 6.9;
  return d / mps;
});

const distanceText = computed(() => (distanceToPickupM.value === null ? '测算中' : formatDistance(distanceToPickupM.value)));
const etaText = computed(() => (etaS.value === null ? '正在测算' : `约 ${formatDuration(etaS.value)}`));
const arrivalClock = computed(() => (etaS.value === null ? '' : formatTime(Date.now() + etaS.value * 1000)));
</script>

<template>
  <div class="waiting">
    <div v-if="!view" class="waiting__empty">
      <EmptyState
        icon="car"
        title="当前没有进行中的行程"
        detail="车辆还在等待派单。派单成功后，这里会显示车辆前往上车点的实时位置和距离。"
      >
        <template #action>
          <AppButton variant="soft" icon="chevronLeft" @click="router.push('/idle')">回到待机屏</AppButton>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="waiting__map">
        <MapCanvas :scale="0.72" :interactive="true" />

        <!-- 叠在地图上的信息条：车在哪、还有多远、几点到 -->
        <section class="strip" aria-label="车辆位置">
          <span class="strip__sheen" aria-hidden="true" />
          <div class="strip__head">
            <span class="strip__badge"><IconBase name="car" :size="22" /></span>
            <div class="strip__text">
              <p class="strip__title">车辆正在前往上车点</p>
              <p class="strip__sub">当前行驶在 {{ roadName }}</p>
            </div>
          </div>

          <div class="strip__right">
            <p class="strip__distance">
              距离上车点还有 <span class="strip__num num">{{ distanceText }}</span>
            </p>
            <p class="strip__eta">
              <IconBase name="clock" :size="15" />
              <span>{{ etaText }}到达</span>
              <span v-if="arrivalClock">，预计 <span class="num">{{ arrivalClock }}</span></span>
            </p>
          </div>
        </section>
      </div>

      <section class="pickup" :class="{ 'pickup--arrived': arrived }">
        <div class="pickup__left">
          <span class="pickup__icon"><IconBase name="pin" :size="20" /></span>
          <div class="pickup__text">
            <p class="pickup__label">上车点</p>
            <p class="pickup__name">{{ originName }}</p>
          </div>
        </div>

        <div class="pickup__right">
          <template v-if="arrived">
            <p class="pickup__go">车辆已到达，请上车</p>
            <AppButton variant="primary" size="lg" icon="check" @click="router.push('/welcome')">开始上车确认</AppButton>
          </template>
          <p v-else class="pickup__hint">请在上车点等候，车辆到达后屏幕上会出现上车校验</p>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.waiting {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  gap: var(--sp-4);
  padding: var(--sp-4);
}

.waiting__empty {
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 0;
}

.waiting__map {
  position: relative;
  flex: 1;
  min-height: 0;
}

/* ---- 地图上的信息条 ---- */
.strip {
  position: absolute;
  top: var(--sp-4);
  left: var(--sp-4);
  right: var(--sp-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-panel);
  border: 1px solid var(--c-border);
  background: color-mix(in srgb, var(--c-surface) 88%, transparent);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

/* 等待动效：一条缓慢流动的光带，沿着信息条下边缘走 */
.strip__sheen {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--c-accent), transparent);
  opacity: 0.75;
  animation: strip-flow 4.2s var(--ease-in-out) infinite;
}

@keyframes strip-flow {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.strip__head {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  min-width: 0;
}
.strip__badge {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-accent-weak);
  color: var(--c-accent);
  animation: badge-breathe 3.6s var(--ease-in-out) infinite;
}
@keyframes badge-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.62;
  }
}
.strip__text {
  min-width: 0;
}
.strip__title {
  font-size: var(--fs-title);
  font-weight: 650;
  color: var(--c-text-1);
}
.strip__sub {
  margin-top: 2px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.strip__right {
  flex: none;
  text-align: right;
}
.strip__distance {
  font-size: var(--fs-body);
  color: var(--c-text-2);
}
.strip__num {
  font-size: var(--fs-title-l);
  font-weight: 700;
  color: var(--c-text-1);
}
.strip__eta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}

/* ---- 上车点 ---- */
.pickup {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.pickup--arrived {
  border-color: var(--c-accent-border);
  background: var(--c-accent-weak);
}
.pickup__left {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  min-width: 0;
}
.pickup__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-surface-raised);
  color: var(--c-accent);
}
.pickup__text {
  min-width: 0;
}
.pickup__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.pickup__name {
  font-size: var(--fs-title-s);
  font-weight: 600;
  color: var(--c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pickup__right {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  flex: none;
}
.pickup__hint {
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}
.pickup__go {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-accent);
}
</style>
