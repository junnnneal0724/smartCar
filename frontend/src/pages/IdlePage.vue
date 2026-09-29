<script setup lang="ts">
/**
 * 待机屏（meta.aside: 'none'）。
 *
 * 场景：上一位乘客已经下车，行程与个人数据都已清理，车辆在等下一单。
 * 这一屏最大的意义是**公共设备的自我说明**：
 *   屏幕上没有"张女士的行程"，只有车辆身份 + 三步操作指引 + 一句隐私说明。
 * 所以文案里刻意不出现任何个人化内容，只保留"这辆车是谁、你该做什么"。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { useSessionStore } from '@/stores/session';

interface GuideStep {
  icon: string;
  title: string;
  detail: string;
}

const router = useRouter();
const session = useSessionStore();

const vehicle = computed(() => session.vehicle);

const steps: GuideStep[] = [
  {
    icon: 'car',
    title: '上车前核对车牌',
    detail: '看一眼前后号牌，与屏幕上显示的号码一致再上车',
  },
  {
    icon: 'shield',
    title: '输入手机号后 4 位',
    detail: '点屏幕上的数字键盘输入，不需要手动打字',
  },
  {
    icon: 'check',
    title: '确认出发',
    detail: '系好安全带并确认目的地后，按下开始行程，车辆才会起步',
  },
];
</script>

<template>
  <div class="idle">
    <header class="idle__head">
      <p class="idle__eyebrow">待机中</p>
      <h1 class="idle__title">欢迎乘坐智行无人驾驶出租车</h1>
      <p class="idle__lead">本车暂时没有进行中的行程，正在等待下一位乘客</p>
    </header>

    <div class="idle__main">
      <section class="veh surface" aria-label="车辆信息">
        <template v-if="vehicle">
          <div class="veh__cell">
            <p class="veh__label">车牌号</p>
            <p class="veh__plate num">{{ vehicle.plateNo }}</p>
          </div>
          <span class="veh__divider" aria-hidden="true" />
          <div class="veh__cell">
            <p class="veh__label">车内编号</p>
            <p class="veh__cabin num">{{ vehicle.cabinNo }}</p>
          </div>
        </template>
        <SkeletonBlock v-else :rows="1" :height="34" width="58%" />
      </section>

      <section class="guide" aria-label="上车指引">
        <p class="guide__label">上车三步</p>
        <ol class="guide__list">
          <li v-for="(s, i) in steps" :key="s.title" class="guide__item">
            <span class="guide__no num">{{ i + 1 }}</span>
            <span class="guide__icon"><IconBase :name="s.icon" :size="22" /></span>
            <span class="guide__body">
              <span class="guide__title">{{ s.title }}</span>
              <span class="guide__detail">{{ s.detail }}</span>
            </span>
          </li>
        </ol>
      </section>
    </div>

    <footer class="idle__foot">
      <p class="privacy">
        <IconBase name="shield" :size="16" />
        上一位乘客的行程数据已从本屏幕清除
      </p>
      <!-- 演示者入口：刻意做小做暗，乘客不会注意到它 -->
      <button class="ops" type="button" @click="router.push('/ops')">演示控制台</button>
    </footer>
  </div>
</template>

<style scoped>
.idle {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  gap: var(--sp-5);
  padding: var(--sp-6) var(--sp-7);
  overflow-y: auto;
}

.idle__head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.idle__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}
.idle__title {
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--c-text-1);
}
.idle__lead {
  font-size: var(--fs-body);
  color: var(--c-text-2);
}

.idle__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-5);
  justify-content: center;
  min-height: 0;
}

/* ---- 车辆身份 ---- */
.veh {
  display: flex;
  align-items: center;
  gap: var(--sp-7);
  padding: var(--sp-5) var(--sp-6);
  max-width: 860px;
}
.veh__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.veh__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.1em;
}
.veh__plate {
  font-size: var(--fs-hero);
  font-weight: 700;
  line-height: 1.1;
  color: var(--c-text-1);
}
.veh__cabin {
  font-size: var(--fs-title-l);
  font-weight: 650;
  line-height: 1.6;
  color: var(--c-text-2);
}
.veh__divider {
  width: 1px;
  align-self: stretch;
  background: var(--c-border);
}

/* ---- 三步指引 ---- */
.guide {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-width: 860px;
}
.guide__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}
.guide__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.guide__item {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  min-height: 76px;
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.guide__no {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  border: 1px solid var(--c-accent-border);
  color: var(--c-accent);
  font-size: var(--fs-body-s);
  font-weight: 650;
}
.guide__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-accent-weak);
  color: var(--c-accent);
}
.guide__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.guide__title {
  font-size: var(--fs-title-s);
  font-weight: 600;
  color: var(--c-text-1);
}
.guide__detail {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.5;
}

/* ---- 底部 ---- */
.idle__foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
}
.privacy {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}
.ops {
  display: inline-flex;
  align-items: center;
  min-height: 56px;
  padding: 0 var(--sp-5);
  border-radius: var(--r-btn);
  border: 1px solid transparent;
  color: var(--c-text-3);
  font-size: var(--fs-body-s);
  /* 不做整体降透明度：那样会把对比度压到 2.8:1，演示者自己都找不到入口。
     这里改用"更小的字号 + 更弱的颜色档位"来表达次要，可读性有下限。 */
  transition: color var(--d-fast) var(--ease-out), background var(--d-fast) var(--ease-out);
}
.ops:active {
  color: var(--c-text-2);
  background: var(--c-surface);
}
</style>
