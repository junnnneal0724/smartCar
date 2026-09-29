<script setup lang="ts">
/**
 * 改目的地 / 加经停。
 *
 * 车机没有键盘，所以这里**没有搜索框**：只给"常去的地方"卡片，
 * 按类型分好组，每张卡上写清离车多远。点卡片不会立刻改路线，
 * 而是就地展开一条确认，把新的预计里程与费用摆出来，再说一遍
 * "改了以后费用会重新计算，并且会在决策气泡里说明原因"。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import mapDataRaw from '@map';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import IconBase from '@/components/IconBase.vue';
import type { MapData, PoiView } from '@/api/types';
import { distanceM as metersBetween, formatDistance, formatDuration, formatMoney } from '@/map/geo';
import { RoadGraph } from '@/map/path';
import { useRideStore } from '@/stores/ride';
import { useRealtimeStore } from '@/stores/realtime';
import { useSessionStore } from '@/stores/session';

interface PoiCard {
  poi: PoiView;
  distance: number;
}
interface PoiGroup {
  key: string;
  label: string;
  icon: string;
  cards: PoiCard[];
}
interface Estimate {
  distanceM: number;
  durationS: number;
  fareCents: number;
}

const router = useRouter();
const ride = useRideStore();
const realtime = useRealtimeStore();
const session = useSessionStore();

const mapData = mapDataRaw as unknown as MapData;
const graph = new RoadGraph(mapData);

const GROUP_ORDER: { key: string; label: string; icon: string; categories: string[] }[] = [
  { key: 'home', label: '家附近', icon: 'pin', categories: ['residence'] },
  { key: 'work', label: '公司', icon: 'briefcase', categories: ['office'] },
  { key: 'hub', label: '交通枢纽', icon: 'route', categories: ['station', 'airport'] },
  { key: 'hospital', label: '医院', icon: 'alert', categories: ['hospital'] },
  { key: 'mall', label: '商场', icon: 'bag', categories: ['mall', 'shop'] },
  { key: 'park', label: '公园', icon: 'leaf', categories: ['park'] },
  { key: 'more', label: '其他常去', icon: 'sparkle', categories: ['school', 'culture', 'sports', 'food', 'venue'] },
];
const CATEGORY_LABEL: Record<string, string> = {
  residence: '住宅区',
  office: '办公区',
  station: '车站',
  airport: '机场',
  hospital: '医院',
  mall: '商场',
  shop: '商店',
  park: '公园',
  school: '学校',
  culture: '文化场馆',
  sports: '运动场馆',
  food: '餐饮',
  venue: '会展',
};

const selectedId = ref<string | null>(null);
const submitting = ref(false);
const error = ref('');
const done = ref('');

const currentDest = computed(() => ride.view?.dest ?? null);

/** 估算的出发点：车辆当前位置优先，取不到就用行程起点 */
const currentPos = computed(() => {
  const v = ride.view;
  const id = ride.vehicle?.id ?? session.vehicle?.id ?? '';
  const s = id ? realtime.sample(id) : null;
  if (s) return { lng: s.lng, lat: s.lat };
  if (ride.vehicle) return { lng: ride.vehicle.lng, lat: ride.vehicle.lat };
  if (v) return { lng: v.origin.lng, lat: v.origin.lat };
  return null;
});

const groups = computed<PoiGroup[]>(() => {
  const from = currentPos.value;
  const destName = currentDest.value?.name ?? '';
  if (!from) return [];
  const usable = mapData.pois.filter((poi) => poi.name !== destName);
  return GROUP_ORDER.map((g) => ({
    key: g.key,
    label: g.label,
    icon: g.icon,
    cards: usable
      .filter((poi) => g.categories.includes(poi.category))
      .map((poi) => ({ poi, distance: metersBetween(from, { lng: poi.lng, lat: poi.lat }) }))
      .sort((a, b) => a.distance - b.distance),
  })).filter((g) => g.cards.length > 0);
});

const selected = computed<PoiView | null>(
  () => mapData.pois.find((poi) => poi.id === selectedId.value) ?? null,
);

/**
 * 新路线的里程 / 时长 / 费用估算。
 * 费用用当前行程的分段单价反推：基础费不变，里程费与时长费按新路线等比放大，
 * 这样给出的数字和账单口径一致，不是一个凭空的数字。
 */
function estimateFor(poi: PoiView): Estimate | null {
  const v = ride.view;
  const from = currentPos.value;
  if (!v || !from) return null;
  const legs = graph.findPath(graph.nearestNode(from).id, graph.nearestNode({ lng: poi.lng, lat: poi.lat }).id);
  const distanceM = RoadGraph.lengthOf(legs);
  if (distanceM <= 0) return null;
  const planDist = Math.max(1, v.planDistanceM);
  const planDur = Math.max(1, v.planDurationS);
  const durationS = Math.round((distanceM / planDist) * planDur);
  const fareCents = Math.max(
    0,
    Math.round(
      v.fare.base + distanceM * (v.fare.distance / planDist) + durationS * (v.fare.time / planDur) - v.fare.discount,
    ),
  );
  return { distanceM, durationS, fareCents };
}

const selectedEstimate = computed<Estimate | null>(() => (selected.value ? estimateFor(selected.value) : null));

function pick(poi: PoiView): void {
  selectedId.value = selectedId.value === poi.id ? null : poi.id;
  error.value = '';
  done.value = '';
}

async function confirmChange(): Promise<void> {
  const poi = selected.value;
  if (!poi || submitting.value) return;
  submitting.value = true;
  error.value = '';
  done.value = '';
  try {
    await ride.changeDestination({ poiId: poi.id });
    done.value = `目的地已经改成 ${poi.name}。费用按新路线重新计算，决策气泡里会说明这次改动的原因。`;
    selectedId.value = null;
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '这次改动没有提交成功，请再试一次';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  ride.refresh().catch(() => undefined);
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">目的地</p>
      <h1 class="page__title">改目的地或加经停</h1>
      <p class="page__lead">改动之后费用会重新计算，车辆也会在决策气泡里说明为什么这样改。</p>
    </header>

    <div v-if="!ride.isOngoing" class="page__body page__body--empty">
      <EmptyState
        icon="route"
        title="行程进行中才能改目的地"
        detail="车辆行驶时，你可以从常去的地点里挑一个新的目的地，或者加一个经停点。"
      >
        <template #action>
          <AppButton variant="soft" size="lg" icon="map" @click="router.push('/trip')">回到行程地图</AppButton>
        </template>
      </EmptyState>
    </div>

    <div v-else class="page__body dest">
      <!-- 当前目的地 -->
      <section class="now">
        <span class="now__icon"><IconBase name="pin" :size="22" /></span>
        <div class="now__body">
          <p class="now__label">当前目的地</p>
          <p class="now__name">{{ currentDest?.name }}</p>
          <p class="now__meta">
            {{ CATEGORY_LABEL[currentDest?.category ?? ''] ?? '地点' }} · 还剩
            <span class="num">{{ formatDistance(ride.remainDistanceM) }}</span> ·
            <span class="num">{{ formatDuration(ride.remainTimeS) }}</span>
          </p>
        </div>
      </section>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-else-if="done" class="ok" role="status">{{ done }}</p>

      <!-- 常用地点：只有卡片，没有搜索框 -->
      <section v-for="g in groups" :key="g.key" class="group">
        <header class="group__head">
          <IconBase :name="g.icon" :size="20" />
          <h2 class="group__title">{{ g.label }}</h2>
        </header>

        <ul class="cards">
          <li v-for="c in g.cards" :key="c.poi.id" class="cards__item">
            <button
              class="card pressable"
              type="button"
              :class="{ 'card--on': selectedId === c.poi.id }"
              :aria-pressed="selectedId === c.poi.id"
              @click="pick(c.poi)"
            >
              <span class="card__name">{{ c.poi.name }}</span>
              <span class="card__meta">
                {{ CATEGORY_LABEL[c.poi.category] ?? '地点' }} · 直线 {{ formatDistance(c.distance) }}
              </span>
            </button>

            <!-- 就地展开的二次确认 -->
            <div v-if="selectedId === c.poi.id" class="confirm">
              <p class="confirm__title">改为 {{ c.poi.name }}</p>
              <p v-if="selectedEstimate" class="confirm__est">
                新的预计里程 <span class="num">{{ formatDistance(selectedEstimate.distanceM) }}</span>，预计耗时
                <span class="num">{{ formatDuration(selectedEstimate.durationS) }}</span>，预计费用
                <span class="num">¥{{ formatMoney(selectedEstimate.fareCents) }}</span>
              </p>
              <p v-else class="confirm__est">新的里程与费用会在提交后重新规划。</p>
              <p class="confirm__note">确认之后费用按新路线重新计算，车辆会在决策气泡里说明改动原因。</p>
              <div class="confirm__actions">
                <AppButton
                  variant="primary"
                  size="lg"
                  icon="check"
                  block
                  :loading="submitting"
                  @click="confirmChange"
                >
                  确认更改
                </AppButton>
                <AppButton variant="ghost" size="lg" block @click="selectedId = null">再想想</AppButton>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
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

.dest {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

/* ---- 当前目的地 ---- */
.now {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-accent-border);
}
.now__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-accent-weak);
  color: var(--c-accent);
}
.now__body {
  min-width: 0;
}
.now__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.08em;
}
.now__name {
  font-size: var(--fs-title-l);
  font-weight: 700;
  color: var(--c-text-1);
}
.now__meta {
  margin-top: 2px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}

/* ---- 分组 ---- */
.group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.group__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-text-2);
}
.group__title {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}

.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-3);
  align-items: start;
}
.cards__item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-height: 88px;
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.card:active {
  background: var(--c-surface-hover);
  border-color: var(--c-border-strong);
}
.card--on {
  border-color: var(--c-accent-border);
  background: var(--c-accent-weak);
}
.card__name {
  font-size: var(--fs-body);
  font-weight: 650;
  color: var(--c-text-1);
}
.card__meta {
  font-size: var(--fs-caption);
  color: var(--c-text-2);
}

/* ---- 二次确认 ---- */
.confirm {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-accent-border);
}
.confirm__title {
  font-size: var(--fs-body);
  font-weight: 650;
  color: var(--c-text-1);
}
.confirm__est {
  font-size: var(--fs-body-s);
  color: var(--c-text-1);
  line-height: var(--lh-body);
}
.confirm__note {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: 1.6;
}
.confirm__actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-top: var(--sp-1);
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
