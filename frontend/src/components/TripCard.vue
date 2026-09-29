<script setup lang="ts">
/**
 * 左侧常驻行程卡（360px）。
 *
 * 车内最重要的一个设计决定：这张卡**不随页面切换消失**。
 * 乘客坐在没有司机的车里，"我还有多久到"是任何时刻都想瞥一眼的信息，
 * 把它藏进某个二级页面是最常见也最糟的做法。
 */
import { computed } from 'vue';
import IconBase from './IconBase.vue';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';
import { formatDistance, formatDuration, formatMoney } from '@/map/geo';

const emit = defineEmits<{ (e: 'explain'): void; (e: 'destination'): void }>();

const ride = useRideStore();
const session = useSessionStore();

const phases = computed(() => session.phases.length ? session.phases : ['前往上车点', '准备出发', '行程中', '即将到达', '到达', '结束']);
const phase = computed(() => ride.view?.phase ?? 0);
const destCategoryIcon = computed(() => {
  const map: Record<string, string> = {
    office: 'briefcase',
    mall: 'bag',
    hospital: 'alert',
    school: 'list',
    residence: 'pin',
    station: 'route',
    airport: 'route',
    park: 'leaf',
    culture: 'sparkle',
    sports: 'motion',
    food: 'sparkle',
    venue: 'pin',
    shop: 'bag',
  };
  return map[ride.view?.dest.category ?? ''] ?? 'pin';
});

const remainText = computed(() => formatDuration(ride.remainTimeS));
const distanceText = computed(() => formatDistance(ride.remainDistanceM));
const behaviorTitle = computed(() => ride.behavior?.short ?? ride.view?.statusLabel ?? '待命中');
const isIdle = computed(() => !ride.view);
</script>

<template>
  <aside class="trip">
    <div v-if="isIdle" class="trip__idle">
      <span class="trip__badge"><IconBase name="car" :size="24" /></span>
      <p class="trip__idle-title">等待下一位乘客</p>
      <p class="trip__idle-sub">本车暂无进行中的行程</p>
    </div>

    <template v-else>
      <!-- 目的地 -->
      <button class="dest pressable" type="button" @click="emit('destination')">
        <span class="dest__icon"><IconBase :name="destCategoryIcon" :size="20" /></span>
        <span class="dest__body">
          <span class="dest__label">目的地</span>
          <span class="dest__name">{{ ride.view?.dest.name }}</span>
        </span>
        <IconBase name="chevronRight" :size="18" class="dest__arrow" />
      </button>

      <!-- 剩余时间：全车最大的数字 -->
      <div class="eta">
        <p class="eta__label">预计还需</p>
        <p class="eta__value num">{{ remainText }}</p>
        <p class="eta__sub">
          剩余 <span class="num">{{ distanceText }}</span>
          <template v-if="ride.isOngoing"> · 已走 <span class="num">{{ (ride.traveledM / 1000).toFixed(1) }}</span> km</template>
        </p>
      </div>

      <!-- 当前动作：把"车在干什么"放在最显眼的位置 -->
      <div class="action" :class="{ 'action--slow': ride.behavior?.slowsDown }">
        <span class="action__dot" aria-hidden="true" />
        <div class="action__body">
          <p class="action__title">{{ behaviorTitle }}</p>
          <p class="action__detail">{{ ride.behavior?.detail ?? ride.view?.statusLabel }}</p>
        </div>
      </div>
      <button class="action__more" type="button" @click="emit('explain')">
        <IconBase name="question" :size="16" />
        这趟车都经历了什么
        <IconBase name="chevronRight" :size="15" />
      </button>

      <!-- 阶段进度 -->
      <ol class="phases">
        <li
          v-for="(p, i) in phases"
          :key="p"
          class="phases__item"
          :class="{ 'phases__item--done': i < phase, 'phases__item--now': i === phase }"
        >
          <span class="phases__dot" />
          <span class="phases__label">{{ p }}</span>
        </li>
      </ol>

      <!-- 费用：一口价，行进中只显示不强调 -->
      <div class="fare">
        <div class="fare__row">
          <span>预估费用</span>
          <span class="fare__total num">¥{{ formatMoney(ride.view?.fare.total ?? 0) }}</span>
        </div>
        <p class="fare__note">行程结束后按实际里程结算，账单同步到手机</p>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.trip {
  width: var(--w-tripcard);
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5);
  background: var(--c-surface);
  border-right: 1px solid var(--c-border);
  overflow-y: auto;
}

.trip__idle {
  margin: auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
}
.trip__badge {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-3);
}
.trip__idle-title {
  font-size: var(--fs-title-s);
  font-weight: 600;
}
.trip__idle-sub {
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}

/* ---- 目的地 ---- */
.dest {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  text-align: left;
}
.dest__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--r-input);
  background: var(--c-accent-weak);
  color: var(--c-accent);
  flex: none;
}
.dest__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.dest__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.08em;
}
.dest__name {
  font-size: var(--fs-title-s);
  font-weight: 600;
  color: var(--c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dest__arrow {
  color: var(--c-text-3);
}

/* ---- 剩余时间 ---- */
.eta {
  padding: var(--sp-2) var(--sp-1) 0;
}
.eta__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.eta__value {
  font-size: var(--fs-hero);
  font-weight: 700;
  line-height: 1.05;
  color: var(--c-text-1);
  margin-top: 2px;
}
.eta__sub {
  margin-top: 6px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}

/* ---- 当前动作 ---- */
.action {
  display: flex;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  position: relative;
  overflow: hidden;
}
.action::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--c-accent);
}
.action--slow::before {
  background: var(--c-warn);
}
.action__dot {
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--c-accent);
  flex: none;
  animation: action-pulse 1.8s var(--ease-in-out) infinite;
}
.action--slow .action__dot {
  background: var(--c-warn);
}
@keyframes action-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.82);
  }
}
.action__body {
  min-width: 0;
}
.action__title {
  font-size: var(--fs-body);
  font-weight: 650;
  color: var(--c-text-1);
}
.action__detail {
  margin-top: 4px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.5;
}

.action__more {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 触控目标：这是一条容易被误判为"说明文字"的可点行，必须给足高度 */
  min-height: 56px;
  padding: 0 var(--sp-3);
  margin: 0 calc(-1 * var(--sp-3));
  border-radius: var(--r-input);
  color: var(--c-text-3);
  font-size: var(--fs-caption);
  transition: color var(--d-fast) var(--ease-out), background var(--d-fast) var(--ease-out);
}
.action__more:active {
  color: var(--c-accent);
  background: var(--c-surface-raised);
}

/* ---- 阶段 ---- */
.phases {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2) 0;
}
.phases__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 5px 0;
  position: relative;
}
.phases__item::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 18px;
  bottom: -3px;
  width: 1px;
  background: var(--c-border);
}
.phases__item:last-child::before {
  display: none;
}
.phases__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border-strong);
  flex: none;
  z-index: 1;
}
.phases__label {
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}
.phases__item--done .phases__dot {
  background: var(--c-text-3);
  border-color: var(--c-text-3);
}
.phases__item--done .phases__label {
  color: var(--c-text-3);
}
.phases__item--now .phases__dot {
  background: var(--c-accent);
  border-color: var(--c-accent);
  box-shadow: 0 0 0 4px var(--c-accent-weak);
}
.phases__item--now .phases__label {
  color: var(--c-text-1);
  font-weight: 600;
}

/* ---- 费用 ---- */
.fare {
  margin-top: auto;
  padding-top: var(--sp-2);
}
.fare__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}
.fare__total {
  font-size: var(--fs-title);
  font-weight: 650;
  color: var(--c-text-1);
}
.fare__note {
  margin-top: 6px;
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: 1.5;
}
</style>
