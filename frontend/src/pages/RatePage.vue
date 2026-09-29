<script setup lang="ts">
/**
 * 行程评价（/rate）。
 *
 * 车机没有键盘，所以这一屏**只有星级与标签**，任何文本输入都不存在。
 * 评价在乘客下车前收集，转化率最高，但绝不能变成负担：
 * 点星星就够，标签是加分项。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import { useRideStore } from '@/stores/ride';
import { useSessionStore } from '@/stores/session';

const TAGS = ['车内整洁', '驾驶平稳', '空调舒适', '行驶安静', '准时到达', '交互顺手'];

const SCORE_COMMENTS: Record<number, string> = {
  1: '很抱歉，我们会认真复盘',
  2: '抱歉让你失望了',
  3: '一般，我们会继续改进',
  4: '不错，我们还能更好',
  5: '太好了，谢谢你的肯定',
};

const router = useRouter();
const ride = useRideStore();
const session = useSessionStore();

const score = ref(0);
const selectedTags = ref<string[]>([]);
const submitting = ref(false);
const error = ref('');

const contextLine = computed(() => {
  const dest = ride.view?.dest.name;
  return dest ? `刚刚从${ride.view?.origin.name ?? '上车点'}到${dest}，想听听你的感受。` : '这段路已经结束，想听听你的感受。';
});

const scoreComment = computed(() => (score.value > 0 ? SCORE_COMMENTS[score.value] : '点一下星星就能打分'));
const submitHint = computed(() => (score.value > 0 ? `${score.value} 星` : '先选星级'));

function pick(n: number): void {
  if (submitting.value) return;
  score.value = n;
  error.value = '';
}

function toggleTag(tag: string): void {
  if (submitting.value) return;
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter((t) => t !== tag)
    : [...selectedTags.value, tag];
}

async function submit(): Promise<void> {
  if (score.value === 0 || submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await ride.rate(score.value, [...selectedTags.value]);
    router.push('/farewell');
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error && e.message ? e.message : '评价没提交成功，请再试一次';
  } finally {
    submitting.value = false;
  }
}

function skip(): void {
  router.push('/farewell');
}
</script>

<template>
  <div class="rate">
    <header class="rate__head">
      <p class="rate__eyebrow">行程评价</p>
      <h1 class="rate__title">这次坐得怎么样？</h1>
      <p class="rate__lead">{{ contextLine }}</p>
    </header>

    <div class="rate__body">
      <div class="stars" role="group" aria-label="星级评分">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          class="stars__btn"
          :class="{ 'stars__btn--on': n <= score }"
          :aria-pressed="n <= score"
          :aria-label="`${n} 星`"
          :disabled="submitting"
          @click="pick(n)"
        >
          <IconBase name="star" :size="56" :stroke="1.6" />
        </button>
      </div>

      <p class="stars__comment" :class="{ 'stars__comment--on': score > 0 }">{{ scoreComment }}</p>

      <section class="tags">
        <p class="rate__label">哪些地方让你满意（可以多选）</p>
        <div class="tags__row">
          <button
            v-for="t in TAGS"
            :key="t"
            type="button"
            class="chip pressable"
            :class="{ 'chip--on': selectedTags.includes(t) }"
            :aria-pressed="selectedTags.includes(t)"
            :disabled="submitting"
            @click="toggleTag(t)"
          >
            <IconBase v-if="selectedTags.includes(t)" name="check" :size="18" />
            <span>{{ t }}</span>
          </button>
        </div>
      </section>

      <p v-if="error" class="rate__error" role="alert">{{ error }}</p>
    </div>

    <footer class="rate__foot">
      <p class="rate__note">评价只影响这台车的运营数据，不会影响你本次的费用。</p>

      <div class="rate__actions">
        <AppButton
          class="rate__submit"
          variant="primary"
          size="lg"
          icon="check"
          :loading="submitting"
          :disabled="score === 0"
          :hint="submitHint"
          @click="submit"
        >
          提交评价
        </AppButton>
        <AppButton variant="ghost" size="lg" :disabled="submitting" @click="skip">跳过</AppButton>
      </div>

      <p v-if="score === 0" class="rate__reason">还没有选星级，选好之后就能提交评价。</p>
    </footer>
  </div>
</template>

<style scoped>
.rate {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: var(--sp-5);
  padding: var(--sp-6);
  overflow-y: auto;
}
.rate__head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rate__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.rate__title {
  font-size: var(--fs-display);
  font-weight: 700;
}
.rate__lead {
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

.rate__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-5);
}

/* ---------------------------------------------------------------- 星级 */
.stars {
  display: flex;
  gap: var(--sp-4);
}
.stars__btn {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  color: var(--c-text-3);
  transition: color var(--d-base) var(--ease-out), border-color var(--d-base) var(--ease-out),
    background var(--d-base) var(--ease-out), transform var(--d-fast) var(--ease-out);
}
.stars__btn--on {
  color: var(--c-accent);
  border-color: var(--c-accent-border);
  background: var(--c-accent-weak);
}
.stars__btn--on :deep(svg) {
  fill: var(--c-accent);
}
.stars__btn:active {
  transform: scale(0.97);
}
.stars__btn:disabled {
  opacity: 0.6;
}

.stars__comment {
  min-height: 28px;
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--c-text-3);
  transition: color var(--d-base) var(--ease-out);
}
.stars__comment--on {
  color: var(--c-text-1);
}

/* ---------------------------------------------------------------- 标签 */
.tags {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
}
.rate__label {
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}
.tags__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sp-3);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 56px;
  padding: 0 var(--sp-5);
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: var(--c-surface);
  color: var(--c-text-2);
  font-size: var(--fs-body);
  transition: background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out),
    border-color var(--d-fast) var(--ease-out);
}
.chip--on {
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
  color: var(--c-accent);
}
.chip:disabled {
  opacity: 0.6;
}

.rate__error {
  font-size: var(--fs-body-s);
  color: var(--c-danger);
}

/* ---------------------------------------------------------------- 底部操作 */
.rate__foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.rate__note {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.rate__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.rate__submit {
  flex: 1;
}
.rate__reason {
  font-size: var(--fs-caption);
  color: var(--c-warn);
}
</style>
