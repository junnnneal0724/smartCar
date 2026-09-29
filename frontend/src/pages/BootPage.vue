<script setup lang="ts">
/**
 * 启动分流页（裸外壳 meta.bare）。
 *
 * 这一屏是"车机开机"的观感：屏幕刚通电，后排乘客正在上车。
 * 它只做两件事：
 *   1. 显示品牌与"正在唤醒座舱"的极细进度条（不用转圈，车内转圈显得焦躁）
 *   2. 启动失败或超过 6 秒没有就绪时，就地给错误说明与重试入口
 *
 * 注意：**这里绝不自己 router.push 到业务页**。
 * 状态到路由的映射由 App.vue 统一负责，本页只负责"好看地等"。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/AppButton.vue';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();

/** 超过这个时间还没 ready，就认为启动卡住了 */
const BOOT_TIMEOUT_MS = 6000;

const timedOut = ref(false);
const fading = ref(false);
const retrying = ref(false);
const recovered = ref(false);

let pollTimer: number | null = null;
let timeoutTimer: number | null = null;
let fadeTimer: number | null = null;

const failed = computed(() => session.lastError.length > 0);
const showError = computed(() => failed.value || (timedOut.value && !session.ready && !recovered.value));
const errorText = computed(() => (failed.value ? session.lastError : '连接车机服务超时，请检查网络后重试'));

function stopTimers(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (timeoutTimer !== null) {
    window.clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

function clearFadeTimer(): void {
  if (fadeTimer !== null) {
    window.clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

/** 就绪后略微停一下再淡出，让"正在唤醒座舱"这句话被看清 */
function scheduleFade(): void {
  if (fading.value || recovered.value || fadeTimer !== null) return;
  fadeTimer = window.setTimeout(() => {
    fading.value = true;
    fadeTimer = null;
  }, 240);
}

watch(
  [() => session.ready, () => session.lastError],
  () => {
    if (session.ready && !failed.value) {
      stopTimers();
      scheduleFade();
    } else {
      clearFadeTimer();
      fading.value = false;
    }
  },
);

onMounted(() => {
  if (session.ready && !failed.value) {
    scheduleFade();
    return;
  }
  pollTimer = window.setInterval(() => {
    if (session.ready && !failed.value) {
      stopTimers();
      scheduleFade();
    }
  }, 240);
  timeoutTimer = window.setTimeout(() => {
    timedOut.value = true;
  }, BOOT_TIMEOUT_MS);
});

onBeforeUnmount(() => {
  stopTimers();
  clearFadeTimer();
});

async function retry(): Promise<void> {
  if (retrying.value) return;
  retrying.value = true;
  timedOut.value = false;
  clearFadeTimer();
  fading.value = false;
  await session.bootstrap();
  retrying.value = false;
  if (!failed.value) {
    // 已经连上了：不再做淡出，交给 App.vue 的兜底轮询把这一屏换掉，
    // 否则会先淡出一片空白，再等下一次轮询才有内容
    recovered.value = true;
    stopTimers();
  }
}
</script>

<template>
  <div class="boot" :class="{ 'boot--fading': fading }">
    <span class="boot__aura" aria-hidden="true" />

    <main class="boot__core">
      <p class="boot__brand">智行</p>

      <template v-if="showError">
        <h1 class="boot__title">座舱启动没有完成</h1>
        <p class="boot__msg boot__msg--error" role="alert">{{ errorText }}</p>
        <AppButton variant="primary" size="lg" icon="sync" :loading="retrying" @click="retry">重试</AppButton>
        <p class="boot__note">如果多次重试仍然失败，请按车内的对讲按钮联系现场工作人员</p>
      </template>

      <template v-else>
        <h1 class="boot__title">正在唤醒座舱</h1>
        <p class="boot__msg" role="status">
          {{ recovered ? '连接已恢复，座舱正在接管这一屏' : '正在读取车辆与行程信息，请稍候' }}
        </p>
        <div class="boot__track" aria-hidden="true"><span class="boot__beam" /></div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.boot {
  position: relative;
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 100%;
  /* 极淡的一层柔蓝光晕，避免"纯黑大屏"的廉价感 */
  background:
    radial-gradient(120% 80% at 50% 36%, var(--c-accent-weak) 0%, transparent 62%),
    radial-gradient(80% 60% at 88% 6%, var(--c-accent-weak) 0%, transparent 55%),
    var(--c-bg);
  transition: opacity var(--d-slow) var(--ease-out);
}

.boot--fading {
  opacity: 0;
  pointer-events: none;
}

.boot__aura {
  position: absolute;
  inset: auto 0 0;
  height: 44%;
  background: radial-gradient(58% 100% at 50% 100%, var(--c-accent-weak) 0%, transparent 70%);
  opacity: 0.6;
  pointer-events: none;
}

.boot__core {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
  max-width: 620px;
  padding: var(--sp-7) var(--sp-6);
  text-align: center;
}

.boot__brand {
  font-size: var(--fs-mega);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.18em;
  color: var(--c-text-1);
  text-indent: 0.18em;
}

.boot__title {
  font-size: var(--fs-display);
  font-weight: 650;
  color: var(--c-text-1);
}

.boot__msg {
  font-size: var(--fs-body);
  color: var(--c-text-2);
  line-height: var(--lh-body);
}

.boot__msg--error {
  max-width: 42ch;
  color: var(--c-warn);
}

.boot__note {
  max-width: 40ch;
  font-size: var(--fs-caption);
  color: var(--c-text-3);
  line-height: 1.6;
}

.boot__track {
  width: 288px;
  height: 2px;
  margin-top: var(--sp-2);
  border-radius: var(--r-btn);
  background: var(--c-surface-raised);
  overflow: hidden;
}

.boot__beam {
  display: block;
  width: 44%;
  height: 100%;
  border-radius: var(--r-btn);
  background: linear-gradient(90deg, transparent, var(--c-accent), transparent);
  animation: boot-flow 1.7s var(--ease-in-out) infinite;
}

@keyframes boot-flow {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(320%);
  }
}
</style>
