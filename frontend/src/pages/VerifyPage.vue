<script setup lang="ts">
/**
 * 上车身份校验（meta.aside: 'none', meta.bar: 'none'）。
 *
 * 两条不能破的规矩：
 *   1. **车机没有键盘**，只能数字输入，而且必须是屏幕上的数字键盘，
 *      绝不能用 <input> 去唤起系统软键盘（横屏车机上那玩意儿又小又难按）。
 *   2. 这一屏是公共设备上的一次身份验证，所以界面上只显示"输了几位"，
 *      不回显数字本身，旁边再说明一句不会保存手机号。
 *
 * 输满 4 位自动提交，失败时清空、就地报错、输入区轻微横向抖动（200ms 左右，
 * 车内动作必须收敛，抖大了像故障）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import IconBase from '@/components/IconBase.vue';
import { ApiError } from '@/api';
import { useSessionStore } from '@/stores/session';

const CODE_LENGTH = 4;

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const router = useRouter();
const session = useSessionStore();

const code = ref('');
const error = ref('');
const submitting = ref(false);
const shaking = ref(false);
const showForgot = ref(false);

let shakeTimer: number | null = null;

const filled = computed(() => code.value.length);
const canConfirm = computed(() => !submitting.value);

onBeforeUnmount(() => {
  if (shakeTimer !== null) window.clearTimeout(shakeTimer);
});

function triggerShake(): void {
  shaking.value = false;
  if (shakeTimer !== null) window.clearTimeout(shakeTimer);
  window.requestAnimationFrame(() => {
    shaking.value = true;
    shakeTimer = window.setTimeout(() => {
      shaking.value = false;
      shakeTimer = null;
    }, 220);
  });
}

async function submit(): Promise<void> {
  if (submitting.value) return;
  if (code.value.length !== CODE_LENGTH) {
    error.value = '请先输满 4 位数字';
    triggerShake();
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    await session.verify(code.value);
    router.push('/ready');
  } catch (e) {
    code.value = '';
    triggerShake();
    if (e instanceof ApiError && e.code === 40100) {
      session.handleAuthError(e);
      error.value = '校验已过期，请重新叫车';
    } else if (e instanceof ApiError) {
      error.value = e.message || '尾号不正确，请重新输入';
    } else {
      error.value = e instanceof Error ? e.message : '校验没有通过，请重新输入';
    }
  } finally {
    submitting.value = false;
  }
}

function press(key: string): void {
  if (submitting.value) return;
  if (code.value.length >= CODE_LENGTH) return;
  error.value = '';
  code.value += key;
  if (code.value.length === CODE_LENGTH) void submit();
}

function backspace(): void {
  if (submitting.value) return;
  error.value = '';
  code.value = code.value.slice(0, -1);
}
</script>

<template>
  <div class="verify">
    <button class="back" type="button" @click="router.push('/welcome')">
      <IconBase name="chevronLeft" :size="20" />
      返回车辆确认
    </button>

    <header class="verify__head">
      <p class="verify__eyebrow">上车校验</p>
      <h1 class="verify__title">请输入叫车手机号的后 4 位</h1>
      <p class="verify__lead">用于确认你是本单乘客。本屏幕不会保存或显示你的完整手机号。</p>
    </header>

    <div class="verify__panel">
      <!-- 只显示位数，不回显数字 -->
      <div class="slots" :class="{ 'slots--shake': shaking }" role="status" :aria-label="`已输入 ${filled} 位，共 4 位`">
        <span v-for="i in CODE_LENGTH" :key="i" class="slot" :class="{ 'slot--on': i <= filled }" />
      </div>

      <p v-if="error" class="verify__err" role="alert">{{ error }}</p>
      <p v-else-if="submitting" class="verify__loading" role="status">正在校验，请稍候…</p>
      <p v-else class="verify__hint">输满 4 位会自动校验，也可以点右下角的确认</p>

      <div class="pad" :class="{ 'pad--busy': submitting }">
        <button
          v-for="k in keys"
          :key="k"
          class="key pressable"
          type="button"
          :disabled="submitting"
          @click="press(k)"
        >
          {{ k }}
        </button>

        <button class="key key--fn pressable" type="button" :disabled="submitting" @click="backspace">
          <IconBase name="chevronLeft" :size="22" />
          删除
        </button>

        <button class="key pressable" type="button" :disabled="submitting" @click="press('0')">0</button>

        <button
          class="key key--ok pressable"
          type="button"
          :disabled="!canConfirm"
          @click="submit"
        >
          <IconBase name="check" :size="22" />
          确认
        </button>
      </div>

      <div class="forgot">
        <button class="forgot__btn" type="button" :aria-expanded="showForgot" @click="showForgot = !showForgot">
          <IconBase name="question" :size="18" />
          忘记尾号了？
        </button>

        <div v-if="showForgot" class="forgot__panel">
          <p class="forgot__text">
            可以在这里呼叫远程安全员。安全员会通过订单信息帮你核验身份，核验通过后就能开始行程。
          </p>
          <AppButton variant="soft" icon="user" @click="router.push('/help')">联系远程安全员</AppButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.verify {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  gap: var(--sp-5);
  padding: var(--sp-5) var(--sp-6) var(--sp-6);
  overflow-y: auto;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  min-height: 56px;
  padding: 0 var(--sp-4);
  border-radius: var(--r-btn);
  color: var(--c-text-2);
  font-size: var(--fs-body);
  transition: color var(--d-fast) var(--ease-out);
}
.back:active {
  color: var(--c-text-1);
}

.verify__head {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  text-align: center;
}
.verify__eyebrow {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  letter-spacing: 0.14em;
}
.verify__title {
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--c-text-1);
}
.verify__lead {
  max-width: 52ch;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.7;
}

.verify__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

/* ---- 位数指示 ---- */
.slots {
  display: flex;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-6);
  border-radius: var(--r-panel);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.slot {
  width: 46px;
  height: 46px;
  border-radius: var(--r-input);
  border: 2px solid var(--c-border-strong);
  background: var(--c-surface-sunken);
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}
.slot--on {
  background: var(--c-accent);
  border-color: var(--c-accent);
  transform: scale(1.04);
}

/* 轻微横向抖动：幅度小、时长 200ms 左右 */
.slots--shake {
  animation: slots-shake 200ms var(--ease-in-out) 1;
}
@keyframes slots-shake {
  0% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  50% {
    transform: translateX(4px);
  }
  75% {
    transform: translateX(-2px);
  }
  100% {
    transform: translateX(0);
  }
}

/* ---- 提示与错误 ---- */
.verify__err {
  min-height: 24px;
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-danger);
  text-align: center;
}
.verify__loading {
  min-height: 24px;
  font-size: var(--fs-body);
  color: var(--c-accent);
}
.verify__hint {
  min-height: 24px;
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}

/* ---- 数字键盘 ---- */
.pad {
  display: grid;
  grid-template-columns: repeat(3, minmax(72px, 1fr));
  gap: var(--sp-3);
  width: 100%;
  transition: opacity var(--d-fast) var(--ease-out);
}
.pad--busy {
  opacity: 0.45;
}
.key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 72px;
  min-height: 76px;
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-1);
  font-size: var(--fs-title-l);
  font-weight: 650;
  font-family: var(--font-num);
}
.key:active {
  background: var(--c-surface-hover);
  border-color: var(--c-border-strong);
}
.key:disabled {
  opacity: 0.45;
}
.key--fn {
  font-family: var(--font-sans);
  font-size: var(--fs-body-s);
  font-weight: 500;
  color: var(--c-text-2);
}
.key--ok {
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  background: var(--c-accent);
  border-color: transparent;
  color: var(--c-on-accent);
}
.key--ok:active {
  background: var(--c-accent-press);
}

/* ---- 忘记尾号 ---- */
.forgot {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  align-items: center;
  width: 100%;
}
.forgot__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 56px;
  padding: 0 var(--sp-5);
  border-radius: var(--r-btn);
  color: var(--c-text-2);
  font-size: var(--fs-body-s);
  transition: color var(--d-fast) var(--ease-out);
}
.forgot__btn:active {
  color: var(--c-accent);
}
.forgot__panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  width: 100%;
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-card);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.forgot__text {
  min-width: 0;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.6;
}
</style>
