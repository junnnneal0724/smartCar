<script setup lang="ts">
/**
 * 同步到手机（/share）
 *
 * 车内不做分享，也不把行程给第三方：只是给你一串取件码，
 * 让你在手机端「智行」App 里把自己的行程、账单和路线带走。
 *
 * 为什么画的是"取件码 + 装饰网格"而不是二维码：
 * 车机端自己实现一个真二维码需要引入依赖或写编码算法，一旦画出来的码扫不出内容，
 * 乘客会以为是车坏了。所以这里明确做成取件码，网格只当装饰并标注清楚是演示图形。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { helpApi } from '@/api';
import { useSessionStore } from '@/stores/session';
import { formatTime } from '@/map/geo';

type ShareLink = Awaited<ReturnType<typeof helpApi.sync>>;

const router = useRouter();
const session = useSessionStore();

const link = ref<ShareLink | null>(null);
const loading = ref(true);
const error = ref('');

/** 装饰网格边长（格数），13 是让图案看起来像二维码又不至于太密 */
const GRID = 13;

async function fetchLink(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    link.value = await helpApi.sync();
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '取件码没拿到，请再试一次';
  } finally {
    loading.value = false;
  }
}

/** 取件码分两行，每行两组四位，念给同行的人听也不容易错 */
const tokenLines = computed<string[]>(() => {
  const raw = (link.value?.token ?? '').replace(/\s+/g, '').toLowerCase();
  const groups = raw.match(/.{1,4}/g) ?? [];
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += 2) {
    lines.push(groups.slice(i, i + 2).join(' '));
  }
  return lines;
});

const expireText = computed(() => {
  if (!link.value) return '';
  const d = new Date(link.value.expireAt);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${formatTime(link.value.expireAt)}`;
});

/**
 * 装饰网格：完全由取件码的字符决定，所以同一个码每次画出来是同一个图案。
 * 三个角画上"定位角"，让它一眼就像二维码，但仍然不是可扫描的码。
 */
const cells = computed<boolean[]>(() => {
  const out: boolean[] = new Array<boolean>(GRID * GRID).fill(false);
  const token = (link.value?.token ?? '').trim();

  let seed = 2166136261;
  for (const ch of token) {
    seed = (seed ^ ch.charCodeAt(0)) >>> 0;
    seed = Math.imul(seed, 16777619) >>> 0;
  }

  let state = seed || 1;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let i = 0; i < out.length; i += 1) out[i] = random() > 0.44;

  const finder = (row0: number, col0: number): void => {
    for (let r = -1; r <= 5; r += 1) {
      for (let c = -1; c <= 5; c += 1) {
        const row = row0 + r;
        const col = col0 + c;
        if (row < 0 || col < 0 || row >= GRID || col >= GRID) continue;
        const inside = r >= 0 && r <= 4 && c >= 0 && c <= 4;
        const ring = r === 0 || r === 4 || c === 0 || c === 4;
        const core = r === 2 && c === 2;
        out[row * GRID + col] = inside && (ring || core);
      }
    }
  };

  finder(0, 0);
  finder(0, GRID - 5);
  finder(GRID - 5, 0);
  return out;
});

onMounted(() => {
  void fetchLink();
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">同步到手机</p>
      <h1 class="page__title">把这次行程带回家</h1>
      <p class="page__lead">行程、账单和路线都会跟着这串取件码走。车内不会把它们分享给任何第三方。</p>
    </header>

    <p v-if="error" class="alert" role="alert">
      <IconBase name="alert" :size="18" />
      {{ error }}
    </p>

    <div v-if="loading" class="card">
      <SkeletonBlock :rows="4" :height="24" />
    </div>

    <EmptyState
      v-else-if="!link"
      icon="sync"
      title="取件码还没生成"
      detail="可能是和车辆的连接不稳。点下面的按钮再取一次。"
    >
      <template #action>
        <AppButton size="lg" icon="sync" @click="fetchLink">重新获取取件码</AppButton>
      </template>
    </EmptyState>

    <template v-else>
      <section class="pickup">
        <div class="pickup__figure">
          <div class="grid" aria-hidden="true">
            <span
              v-for="(on, i) in cells"
              :key="i"
              class="grid__cell"
              :class="{ 'grid__cell--on': on }"
            />
          </div>
          <div class="token">
            <p class="token__label">取件码</p>
            <p v-for="(line, i) in tokenLines" :key="i" class="token__line">{{ line }}</p>
          </div>
        </div>

        <div class="pickup__body">
          <h2 class="pickup__title">在手机端「智行」App 里输入这串取件码</h2>
          <p class="pickup__desc">
            打开「智行」App，进入「我的行程」，选择「用车机取件码带行程」，输入上面这串码，
            本次行程、账单和路线就回到手机上了。
          </p>
          <p class="pickup__hint">
            <IconBase name="info" :size="16" />
            背后的方形网格是演示用的装饰图形，不是二维码，扫不出内容，请直接用上面的取件码。
          </p>

          <dl class="meta">
            <div class="meta__item">
              <dt>本次行程</dt>
              <dd class="num">{{ link.rideNo }}</dd>
            </div>
            <div class="meta__item">
              <dt>有效期到</dt>
              <dd class="num">{{ expireText }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">
          <IconBase name="shield" :size="20" />
          关于分享，说清楚三件事
        </h2>
        <ul class="notes">
          <li class="notes__row">
            <IconBase name="check" :size="18" />
            <span>车内不会把行程分享给第三方，只是让你带走自己的记录。</span>
          </li>
          <li class="notes__row">
            <IconBase name="check" :size="18" />
            <span>取件码只对应你这一趟行程，别人拿到也看不到你的手机号。</span>
          </li>
          <li class="notes__row">
            <IconBase name="check" :size="18" />
            <span>过了有效期这条码会失效，需要时可以在同一趟车上再取一次。</span>
          </li>
        </ul>
      </section>

      <footer class="page__foot">
        <AppButton variant="primary" size="lg" icon="check" block @click="router.push('/farewell')">
          完成
        </AppButton>
      </footer>
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
  max-width: 78ch;
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

.card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
}
.card__title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}

/* ---- 取件码 ---- */
.pickup {
  display: flex;
  align-items: center;
  gap: var(--sp-7);
  flex-wrap: wrap;
  padding: var(--sp-6);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-panel);
}
.pickup__figure {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 300px;
  height: 300px;
  padding: var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border);
}
.grid {
  position: absolute;
  inset: var(--sp-5);
  display: grid;
  grid-template-columns: repeat(13, 1fr);
  grid-template-rows: repeat(13, 1fr);
  gap: 3px;
}
.grid__cell {
  /* 取件码网格用直角：圆角会让它看起来像"图形"而不是"码" */
  border-radius: 0;
  background: transparent;
}
.grid__cell--on {
  background: var(--c-text-3);
}
.token {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-input);
  background: var(--c-surface);
  border: 1px solid var(--c-accent-border);
}
.token__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.12em;
}
.token__line {
  font-family: var(--font-num);
  font-size: var(--fs-title-l);
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--c-text-1);
}

.pickup__body {
  flex: 1;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.pickup__title {
  font-size: var(--fs-title);
  font-weight: 700;
  color: var(--c-text-1);
}
.pickup__desc {
  max-width: 62ch;
  font-size: var(--fs-body);
  color: var(--c-text-2);
  line-height: 1.6;
}
.pickup__hint {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin: var(--sp-2) 0 0;
}
.meta__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-input);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
}
.meta__item dt {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.meta__item dd {
  margin: 0;
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-text-1);
}

/* ---- 说明 ---- */
.notes {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.notes__row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.55;
}
.notes__row :deep(.icon) {
  margin-top: 4px;
  color: var(--c-success);
}

.page__foot {
  flex: none;
  display: flex;
  gap: var(--sp-3);
}
</style>
