<script setup lang="ts">
/**
 * 分级停靠。
 *
 * 车内独有的能力，也是"乘客被困在一台没有司机的车里"时最需要的掌控感。
 * 两级必须一眼能分开：
 *   普通停靠 = 柔和的次要操作，选一个地点就通知车辆靠边停，行程继续、费用按实际里程结算
 *   紧急停车 = 全屏唯一的危险色区域，长按 1.2 秒才生效，车辆会立即去找最近的安全位置
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import mapDataRaw from '@map';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import HoldButton from '@/components/HoldButton.vue';
import IconBase from '@/components/IconBase.vue';
import { rideApi } from '@/api';
import type { MapData, PoiView, StopRequestView } from '@/api/types';
import { distanceM as metersBetween, formatDistance } from '@/map/geo';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';

interface StopCandidate {
  poi: PoiView;
  distance: number;
}

const router = useRouter();
const ride = useRideStore();
const session = useSessionStore();

const mapData = mapDataRaw as unknown as MapData;

const submittingId = ref<string | null>(null);
const cancellingId = ref<number | null>(null);
const emergencySending = ref(false);
const error = ref('');
const notice = ref('');

const CATEGORY_LABEL: Record<string, string> = {
  residence: '住宅区',
  office: '办公区',
  station: '交通枢纽',
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
const CATEGORY_ICON: Record<string, string> = {
  residence: 'pin',
  office: 'briefcase',
  station: 'route',
  airport: 'route',
  hospital: 'alert',
  mall: 'bag',
  shop: 'bag',
  park: 'leaf',
  school: 'list',
  culture: 'sparkle',
  sports: 'motion',
  food: 'sparkle',
  venue: 'pin',
};
const STOP_STATUS: Record<StopRequestView['status'], string> = {
  PENDING: '已提交，等待车辆确认',
  ACCEPTED: '车辆已接受，正在找位置靠边',
  DONE: '已完成',
  CANCELLED: '已取消',
};

/** 常用下车点：按离目的地由近到远取 6 个，排除目的地本身 */
const candidates = computed<StopCandidate[]>(() => {
  const dest = ride.view?.dest;
  if (!dest) return [];
  const here = { lng: dest.lng, lat: dest.lat };
  return mapData.pois
    .filter((poi) => poi.name !== dest.name)
    .map((poi) => ({ poi, distance: metersBetween(here, { lng: poi.lng, lat: poi.lat }) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
});

const sortedStops = computed(() => [...ride.stops].sort((a, b) => b.created_at - a.created_at));

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? '地点';
}
function categoryIcon(category: string): string {
  return CATEGORY_ICON[category] ?? 'pin';
}
function canCancel(stop: StopRequestView): boolean {
  return stop.status === 'PENDING' || stop.status === 'ACCEPTED';
}

async function chooseStop(poi: PoiView): Promise<void> {
  if (submittingId.value) return;
  submittingId.value = poi.id;
  error.value = '';
  notice.value = '';
  try {
    await ride.requestStop({ kind: 'NORMAL', poiId: poi.id });
    notice.value = `已经告诉车辆，它会在 ${poi.name} 附近靠边停下。`;
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '停靠请求没有发出去，请再试一次';
  } finally {
    submittingId.value = null;
  }
}

async function onEmergency(): Promise<void> {
  if (emergencySending.value) return;
  emergencySending.value = true;
  error.value = '';
  notice.value = '';
  try {
    await ride.requestStop({ kind: 'EMERGENCY', note: '乘客触发' });
    notice.value = '紧急停车请求已发出，车辆会立即寻找最近的安全位置靠边停下。';
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '紧急停车请求没有发出去，请再按一次';
  } finally {
    emergencySending.value = false;
  }
}

async function onCancel(id: number): Promise<void> {
  if (cancellingId.value !== null) return;
  cancellingId.value = id;
  error.value = '';
  notice.value = '';
  try {
    await ride.cancelStop(id);
    notice.value = '这条停靠请求已经取消。';
  } catch (e) {
    if (session.handleAuthError(e)) {
      await router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '取消失败，请再试一次';
  } finally {
    cancellingId.value = null;
  }
}

onMounted(() => {
  ride.refresh().catch(() => undefined);
  rideApi
    .stops()
    .then((list) => {
      ride.stops = list;
    })
    .catch(() => undefined);
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">停靠</p>
      <h1 class="page__title">想在哪里停一下</h1>
      <p class="page__lead">临时停车不结束行程，费用按实际里程结算。</p>
    </header>

    <div v-if="!ride.isOngoing" class="page__body page__body--empty">
      <EmptyState
        icon="pin"
        title="行程开始后才能请求停靠"
        detail="车辆行驶中，你可以在这一屏选择下车点，或者发起紧急停车。"
      >
        <template #action>
          <AppButton
            v-if="ride.status === 'ARRIVED'"
            variant="primary"
            size="lg"
            icon="door"
            @click="router.push('/alight')"
          >
            去准备下车
          </AppButton>
          <AppButton v-else variant="soft" size="lg" icon="map" @click="router.push('/trip')">回到行程地图</AppButton>
        </template>
      </EmptyState>
    </div>

    <div v-else class="page__body stop">
      <!-- 普通停靠：柔和的次要操作 -->
      <section class="panel">
        <header class="panel__head">
          <h2 class="panel__title">常用下车点</h2>
          <p class="panel__sub">按离目的地由近到远排列，点一下就会通知车辆在前方靠边停。</p>
        </header>

        <ul v-if="candidates.length" class="places">
          <li v-for="c in candidates" :key="c.poi.id">
            <button
              class="place pressable"
              type="button"
              :disabled="submittingId !== null"
              @click="chooseStop(c.poi)"
            >
              <span class="place__icon"><IconBase :name="categoryIcon(c.poi.category)" :size="22" /></span>
              <span class="place__body">
                <span class="place__name">{{ c.poi.name }}</span>
                <span class="place__meta">{{ categoryLabel(c.poi.category) }} · 直线 {{ formatDistance(c.distance) }}</span>
              </span>
              <span v-if="submittingId === c.poi.id" class="place__sending">发送中</span>
              <IconBase v-else name="chevronRight" :size="18" class="place__arrow" />
            </button>
          </li>
        </ul>
        <p v-else class="panel__sub">这一带暂时没有可选的下车点，可以直接使用紧急停车。</p>
      </section>

      <div class="stop__side">
        <!-- 紧急停车：全屏唯一的危险色区域 -->
        <section class="danger">
          <h2 class="danger__title">
            <IconBase name="sos" :size="22" />
            <span>紧急停车</span>
          </h2>
          <p class="danger__note">车辆会立即寻找最近的安全位置靠边停下，请坐稳并系好安全带。</p>
          <HoldButton
            label="紧急停车"
            hint="按住 1.2 秒"
            icon="sos"
            variant="danger"
            :disabled="!ride.isOngoing || emergencySending"
            disabled-reason="行程进行中才能使用"
            @confirm="onEmergency"
          />
          <p class="danger__safe">停稳之后，车机会立刻联系远程安全员，并保持车门暂时不开。</p>
        </section>

        <section class="panel">
          <header class="panel__head">
            <h2 class="panel__title">已提交的停靠请求</h2>
            <p class="panel__sub">车辆确认之前都可以取消。</p>
          </header>

          <ul v-if="sortedStops.length" class="requests">
            <li v-for="s in sortedStops" :key="s.id" class="request">
              <div class="request__body">
                <p class="request__name">
                  <span v-if="s.kind === 'EMERGENCY'" class="request__tag">紧急</span>
                  <span>{{ s.target_name || (s.kind === 'EMERGENCY' ? '最近的安全位置' : '路边安全位置') }}</span>
                </p>
                <p class="request__status">{{ STOP_STATUS[s.status] }}</p>
              </div>
              <button
                v-if="canCancel(s)"
                class="cancel pressable"
                type="button"
                :disabled="cancellingId !== null"
                @click="onCancel(s.id)"
              >
                {{ cancellingId === s.id ? '取消中' : '取消' }}
              </button>
            </li>
          </ul>
          <p v-else class="panel__sub">还没有提交过停靠请求。上面选一个地点，或者用紧急停车。</p>
        </section>
      </div>
    </div>

    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="ok" role="status">{{ notice }}</p>
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

.stop {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr);
  gap: var(--sp-5);
  align-items: start;
}
.stop__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.panel__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.panel__title {
  font-size: var(--fs-title);
  font-weight: 650;
}
.panel__sub {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: var(--lh-body);
}

/* ---- 常用下车点 ---- */
.places {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}
.place {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 80px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out);
}
.place:active {
  background: var(--c-surface-hover);
  border-color: var(--c-border-strong);
}
.place:disabled {
  opacity: 0.5;
}
.place__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-accent-weak);
  color: var(--c-accent);
}
.place__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.place__name {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.place__meta {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.place__arrow {
  color: var(--c-text-3);
}
.place__sending {
  font-size: var(--fs-caption);
  color: var(--c-accent);
}

/* ---- 紧急停车 ---- */
.danger {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-danger-weak);
  border: 1px solid color-mix(in srgb, var(--c-danger) 42%, transparent);
}
.danger__title {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--fs-title);
  font-weight: 650;
  color: var(--c-danger);
}
.danger__note {
  font-size: var(--fs-body-s);
  color: var(--c-text-1);
  line-height: var(--lh-body);
}
.danger__safe {
  font-size: var(--fs-caption);
  color: var(--c-text-2);
  line-height: 1.6;
}

/* ---- 已提交的请求 ---- */
.requests {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.request {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
}
.request__body {
  min-width: 0;
  flex: 1;
}
.request__name {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-text-1);
}
.request__tag {
  padding: 2px 10px;
  border-radius: var(--r-chip);
  background: var(--c-danger-weak);
  border: 1px solid color-mix(in srgb, var(--c-danger) 42%, transparent);
  color: var(--c-danger);
  font-size: var(--fs-caption);
  font-weight: 600;
}
.request__status {
  margin-top: 2px;
  font-size: var(--fs-caption);
  color: var(--c-text-2);
}
.cancel {
  flex: none;
  min-width: 96px;
  min-height: 56px;
  padding: 0 var(--sp-4);
  border-radius: var(--r-btn);
  background: var(--c-surface);
  border: 1px solid var(--c-border-strong);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  font-weight: 600;
}
.cancel:active {
  color: var(--c-text-1);
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
