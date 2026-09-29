<script setup lang="ts">
/**
 * 帮助与安全（/help）
 *
 * 车里没有司机，这块屏幕就是唯一的求助通道，所以这一页从任何页面都只要一次点击。
 *
 * 三块内容对应乘客此时的三个疑问：
 *   1. 现在出事了怎么办  → 呼叫远程安全员（真人，能看到这辆车）
 *   2. 这趟车怎么回事    → 高频问题（回答都结合当前行程，不是通用 FAQ）
 *   3. 我是不是被拍着    → 隐私与设备状态（直白告诉你摄像头、麦克风、位置在做什么）
 *
 * 对话里刻意没有输入框：车机没有键盘，只给一排预置问题按钮。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/AppButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import IconBase from '@/components/IconBase.vue';
import SkeletonBlock from '@/components/SkeletonBlock.vue';
import { helpApi } from '@/api';
import type { AssistView, HelpTopic, PrivacyView } from '@/api/types';
import { useSessionStore } from '@/stores/session';
import { formatTime } from '@/map/geo';

const router = useRouter();
const session = useSessionStore();

const topics = ref<HelpTopic[]>([]);
const privacy = ref<PrivacyView | null>(null);
const assist = ref<AssistView | null>(null);
const openTopic = ref('');
const loading = ref(true);
const error = ref('');
const notice = ref('');
const calling = ref(false);
const ending = ref(false);
/** 已发出、还在等安全员回复（后端的自动回复是异步的） */
const waitingReply = ref(false);
const listEl = ref<HTMLElement | null>(null);
let replyTimer: number | null = null;

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [t, p, a] = await Promise.all([
      helpApi.topics(),
      helpApi.privacy(),
      helpApi.currentAssist().catch(() => null),
    ]);
    topics.value = t.topics;
    privacy.value = p;
    if (a) {
      assist.value = a;
      await scrollToEnd();
    }
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '帮助信息没读上来，请再试一次';
  } finally {
    loading.value = false;
  }
}

async function scrollToEnd(): Promise<void> {
  await nextTick();
  const el = listEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function callAssist(): Promise<void> {
  if (calling.value) return;
  calling.value = true;
  error.value = '';
  notice.value = '';
  try {
    assist.value = await helpApi.callAssist('');
    await scrollToEnd();
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '没能接通安全员，请再按一次';
  } finally {
    calling.value = false;
  }
}

async function refreshAssist(): Promise<void> {
  try {
    const a = await helpApi.currentAssist();
    if (a) {
      assist.value = a;
    } else {
      assist.value = null;
      notice.value = '本次协助已经结束。需要的话可以随时再呼叫。';
    }
  } catch {
    /* 刷新失败就保留屏幕上已有的对话，不要把它清空 */
  } finally {
    waitingReply.value = false;
    await scrollToEnd();
  }
}

async function send(text: string): Promise<void> {
  const current = assist.value;
  if (!current || waitingReply.value) return;
  error.value = '';

  // 先让乘客看到自己那句话，再等网络往返
  current.messages.push({ id: -Date.now(), role: 'USER', content: text, created_at: Date.now() });
  waitingReply.value = true;
  await scrollToEnd();

  try {
    await helpApi.sendMessage(current.session.id, text);
    // 安全员的自动回复约 1 秒后才落库，等一下再拉一次消息列表
    if (replyTimer !== null) clearTimeout(replyTimer);
    replyTimer = window.setTimeout(() => {
      void refreshAssist();
    }, 1500);
  } catch (e) {
    waitingReply.value = false;
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '这句话没发出去，请再按一次';
  }
}

async function endCall(): Promise<void> {
  const current = assist.value;
  if (!current || ending.value) return;
  ending.value = true;
  error.value = '';
  try {
    await helpApi.endAssist(current.session.id);
    assist.value = null;
    waitingReply.value = false;
    notice.value = '本次协助已经结束。需要的话可以随时再呼叫。';
  } catch (e) {
    if (session.handleAuthError(e)) {
      router.replace('/verify');
      return;
    }
    error.value = e instanceof Error ? e.message : '没能结束通话，请再试一次';
  } finally {
    ending.value = false;
  }
}

function toggleTopic(key: string): void {
  openTopic.value = openTopic.value === key ? '' : key;
}

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  if (replyTimer !== null) clearTimeout(replyTimer);
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <p class="page__eyebrow">帮助与安全</p>
      <h1 class="page__title">需要帮忙就说一声</h1>
      <p class="page__lead">这辆车没有司机，所以这块屏幕就是你唯一的求助通道。呼叫安全员永远只要按一下。</p>
    </header>

    <p v-if="error" class="alert" role="alert">
      <IconBase name="alert" :size="18" />
      {{ error }}
    </p>
    <p v-if="notice" class="notice" role="status">
      <IconBase name="check" :size="18" />
      {{ notice }}
    </p>

    <div v-if="loading" class="card">
      <SkeletonBlock :rows="5" :height="22" />
    </div>

    <EmptyState
      v-else-if="!assist && !topics.length && !privacy"
      icon="info"
      title="帮助信息没读上来"
      detail="可能是和车辆的连接不稳。点下面的按钮重新读一次，紧急情况请直接呼叫安全员。"
    >
      <template #action>
        <AppButton size="lg" icon="sync" @click="load">重新读取</AppButton>
      </template>
    </EmptyState>

    <!-- 对话视图：接通后整屏都在服务这一件事 -->
    <section v-else-if="assist" class="page__chat">
      <div class="agent">
        <span class="agent__avatar" aria-hidden="true">{{ assist.session.agentAvatar }}</span>
        <div class="agent__body">
          <p class="agent__name">{{ assist.session.agentName }} · 远程安全员</p>
          <p class="agent__state">
            <span class="dot dot--on" aria-hidden="true" />
            已接通，他能看到这辆车的位置和车内状态
          </p>
        </div>
        <AppButton variant="ghost" size="lg" icon="close" :loading="ending" @click="endCall">结束通话</AppButton>
      </div>

      <div ref="listEl" class="chat">
        <template v-for="m in assist.messages" :key="m.id">
          <p v-if="m.role === 'SYSTEM'" class="chat__system">{{ m.content }}</p>
          <div v-else class="bubble" :class="m.role === 'USER' ? 'bubble--user' : 'bubble--agent'">
            <span class="bubble__text">{{ m.content }}</span>
            <span class="bubble__time num">{{ formatTime(m.created_at) }}</span>
          </div>
        </template>
        <p v-if="waitingReply" class="chat__typing">{{ assist.session.agentName }}正在回复…</p>
      </div>

      <div class="quick">
        <p class="quick__label">车里没有键盘，点一句就能发出去</p>
        <div class="quick__grid">
          <button
            v-for="q in assist.quickReplies"
            :key="q"
            class="quick__btn"
            type="button"
            :disabled="waitingReply"
            @click="send(q)"
          >
            {{ q }}
          </button>
        </div>
      </div>
    </section>

    <template v-else>
      <!-- 一级入口：呼叫远程安全员 -->
      <section class="card card--call">
        <div class="call__text">
          <h2 class="card__title">
            <IconBase name="user" :size="20" />
            呼叫远程安全员
          </h2>
          <p class="card__note">
            24 小时在线的真人安全员。接通后他能看到这辆车的位置、当前动作和车内状态，你不用描述太多。
          </p>
        </div>
        <AppButton
          variant="primary"
          size="xl"
          icon="user"
          :loading="calling"
          hint="接通后可以用下面的问题按钮对话"
          @click="callAssist"
        >
          呼叫远程安全员
        </AppButton>
      </section>

      <!-- 高频问题：针对此刻这趟行程 -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">
            <IconBase name="question" :size="20" />
            这趟行程里最常问的
          </h2>
          <span class="chip">结合当前行程</span>
        </div>
        <p class="card__note">下面的回答都是针对你此刻这趟行程的，不是通用说明。点一下标题就能展开。</p>
        <ul v-if="topics.length" class="topics">
          <li v-for="t in topics" :key="t.key">
            <button
              class="topic"
              :class="{ 'topic--open': openTopic === t.key }"
              type="button"
              :aria-expanded="openTopic === t.key"
              @click="toggleTopic(t.key)"
            >
              <span class="topic__icon"><IconBase :name="t.icon" :size="20" /></span>
              <span class="topic__title">{{ t.title }}</span>
              <IconBase :name="openTopic === t.key ? 'chevronDown' : 'chevronRight'" :size="18" class="topic__arrow" />
            </button>
            <p v-if="openTopic === t.key" class="topic__detail">{{ t.detail }}</p>
          </li>
        </ul>
        <p v-else class="card__note">这会儿还没读到问题清单，可以直接呼叫上面的安全员。</p>
      </section>

      <!-- 隐私与设备状态 -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">
            <IconBase name="shield" :size="20" />
            隐私与设备状态
          </h2>
          <span class="chip">下车后清除</span>
        </div>

        <div v-if="privacy" class="priv">
          <div class="priv__row">
            <span class="dot" :class="privacy.camera.on ? 'dot--live' : 'dot--off'" aria-hidden="true" />
            <span class="priv__icon"><IconBase name="camera" :size="20" /></span>
            <div class="priv__body">
              <p class="priv__name">
                车内摄像头
                <span class="priv__state">{{ privacy.camera.on ? '工作中' : '已关闭' }}</span>
              </p>
              <p class="priv__use">用途：{{ privacy.camera.purpose }}</p>
              <p class="priv__keep">期限：{{ privacy.camera.retention }}</p>
            </div>
          </div>

          <div class="priv__row">
            <span class="dot" :class="privacy.microphone.on ? 'dot--live' : 'dot--off'" aria-hidden="true" />
            <span class="priv__icon"><IconBase name="mic" :size="20" /></span>
            <div class="priv__body">
              <p class="priv__name">
                麦克风
                <span class="priv__state">{{ privacy.microphone.on ? '开启中' : '已关闭' }}</span>
              </p>
              <p class="priv__use">用途：{{ privacy.microphone.purpose }}</p>
              <p class="priv__keep">期限：{{ privacy.microphone.retention }}</p>
            </div>
          </div>

          <div class="priv__row">
            <span class="dot dot--on" aria-hidden="true" />
            <span class="priv__icon"><IconBase name="pin" :size="20" /></span>
            <div class="priv__body">
              <p class="priv__name">
                位置
                <span class="priv__state">行程中开启</span>
              </p>
              <p class="priv__use">用途：{{ privacy.location.purpose }}</p>
              <p class="priv__keep">期限：{{ privacy.location.retention }}</p>
            </div>
          </div>
        </div>

        <p class="card__note">麦克风默认关闭，只在你主动呼叫客服时开启。摄像头是为了行车安全，什么时候开着，状态栏上一直写着。</p>
        <p v-if="privacy" class="card__note">{{ privacy.session.note }}</p>
      </section>

      <footer class="page__foot">
        <AppButton
          size="lg"
          icon="share"
          icon-right="chevronRight"
          block
          hint="把本次行程、账单和路线带回手机"
          @click="router.push('/share')"
        >
          把行程同步到手机
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

.alert,
.notice {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-input);
  font-size: var(--fs-body-s);
}
.alert {
  background: var(--c-danger-weak);
  border: 1px solid color-mix(in srgb, var(--c-danger) 40%, transparent);
  color: var(--c-danger);
}
.notice {
  background: var(--c-success-weak);
  border: 1px solid color-mix(in srgb, var(--c-success) 38%, transparent);
  color: var(--c-success);
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
.card--call {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-6);
  background: var(--c-surface-raised);
}
.call__text {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}
.card__title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}
.card__note {
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.5;
}
.chip {
  flex: none;
  padding: 5px var(--sp-3);
  border-radius: var(--r-chip);
  background: var(--c-surface);
  border: 1px solid var(--c-accent-border);
  color: var(--c-accent);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

/* ---- 对话 ---- */
.page__chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.agent {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
}
.agent__avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 50%;
  background: var(--c-accent-weak);
  border: 1px solid var(--c-accent-border);
  font-size: 26px;
  line-height: 1;
}
.agent__body {
  flex: 1;
  min-width: 0;
}
.agent__name {
  font-size: var(--fs-title-s);
  font-weight: 650;
  color: var(--c-text-1);
}
.agent__state {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 3px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
}

.chat {
  flex: 1;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5);
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border);
  border-radius: var(--r-panel);
  overflow-y: auto;
}
.chat__system {
  align-self: center;
  padding: 4px var(--sp-4);
  border-radius: var(--r-chip);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-3);
  font-size: var(--fs-caption);
}
.bubble {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 68%;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  font-size: var(--fs-body);
  line-height: 1.5;
}
.bubble--agent {
  align-self: flex-start;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-1);
  border-bottom-left-radius: var(--r-input);
}
.bubble--user {
  align-self: flex-end;
  background: var(--c-accent-weak);
  border: 1px solid var(--c-accent-border);
  color: var(--c-text-1);
  border-bottom-right-radius: var(--r-input);
}
.bubble__time {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.chat__typing {
  align-self: flex-start;
  padding: 0 var(--sp-2);
  font-size: var(--fs-body-s);
  color: var(--c-text-3);
}

.quick {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.quick__label {
  font-size: var(--fs-caption);
  color: var(--c-text-3);
}
.quick__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
.quick__btn {
  min-height: 60px;
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-btn);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-1);
  font-size: var(--fs-body);
  font-weight: 550;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out), opacity var(--d-fast) var(--ease-out);
}
.quick__btn:active {
  transform: scale(0.97);
  background: var(--c-accent-weak);
  border-color: var(--c-accent-border);
}
.quick__btn:disabled {
  opacity: 0.45;
  pointer-events: none;
}

/* ---- 高频问题 ---- */
.topics {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.topic {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 64px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  text-align: left;
  transition: background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}
.topic:active {
  transform: scale(0.99);
}
.topic--open {
  border-color: var(--c-accent-border);
  background: var(--c-accent-weak);
}
.topic__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
}
.topic--open .topic__icon {
  color: var(--c-accent);
}
.topic__title {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-text-1);
}
.topic__arrow {
  color: var(--c-text-3);
}
.topic__detail {
  padding: var(--sp-3) var(--sp-5) var(--sp-4);
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.6;
}

/* ---- 隐私 ---- */
.priv {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.priv__row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--r-card);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
}
.priv__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: var(--r-input);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
}
.priv__body {
  min-width: 0;
}
.priv__name {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body);
  font-weight: 650;
  color: var(--c-text-1);
}
.priv__state {
  padding: 2px var(--sp-2);
  border-radius: var(--r-chip);
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
  font-size: var(--fs-caption);
  font-weight: 500;
}
.priv__use,
.priv__keep {
  margin-top: 3px;
  font-size: var(--fs-body-s);
  color: var(--c-text-2);
  line-height: 1.5;
}
.priv__keep {
  color: var(--c-text-3);
}

/* ---- 状态圆点：颜色之外一律配文字，不让色觉差异成为障碍 ---- */
.dot {
  width: 10px;
  height: 10px;
  margin-top: 15px;
  flex: none;
  border-radius: 50%;
  background: var(--c-text-3);
}
.dot--live {
  background: var(--c-danger);
}
.dot--on {
  background: var(--c-accent);
}
.dot--off {
  background: var(--c-text-3);
}

.page__foot {
  flex: none;
  display: flex;
  gap: var(--sp-3);
}
</style>
