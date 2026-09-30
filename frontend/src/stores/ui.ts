import { defineStore } from 'pinia';
import { ref, watch, computed } from 'vue';

const LS = {
  theme: 'robotaxi.theme',
  font: 'robotaxi.font',
  contrast: 'robotaxi.contrast',
  motion: 'robotaxi.motion',
};

export type ThemeMode = 'dark' | 'light' | 'auto';

/**
 * 车机外观与无障碍设置。
 * 默认深色（夜间行车不刺眼）；大字/高对比/减少动效都是车上真实需要的可访问性开关。
 */
export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeMode>((localStorage.getItem(LS.theme) as ThemeMode) ?? 'dark');
  const fontScale = ref<'standard' | 'large'>((localStorage.getItem(LS.font) as 'standard' | 'large') ?? 'standard');
  const contrast = ref<'normal' | 'high'>((localStorage.getItem(LS.contrast) as 'normal' | 'high') ?? 'normal');
  const motion = ref<'full' | 'calm'>((localStorage.getItem(LS.motion) as 'full' | 'calm') ?? 'full');
  const voiceEnabled = ref(localStorage.getItem('robotaxi.voice') !== '0');

  /**
   * 状态机换屏的两个刹车。它们解决的是同一类体感问题：
   * **屏幕不能在乘客手指底下被换掉。**
   *
   * - `touching`：手指还按在屏幕上。行程末段车辆一进入"即将到达"，后端就会推状态、
   *   前端立刻换屏；如果这一刻乘客正在拖地图，页面就会当场消失，体感是"我一碰它就跳走"。
   * - `mapManual`：乘客手动拖过地图，说明他明确想自己看位置。此后 /trip 归他控制，
   *   即使车辆进入"即将到达"也不自动收走，直到他点"回到车辆"。
   */
  const touching = ref(false);
  const mapManual = ref(false);
  let graceUntil = 0;

  function setTouching(v: boolean): void {
    touching.value = v;
    // 抬手之后留一点余量：拖动的最后一帧和紧随其后的 click 属于同一次操作
    if (!v) graceUntil = Date.now() + 700;
  }

  /** 此刻是否处在"乘客正在操作"的窗口里 */
  function isInteracting(): boolean {
    return touching.value || Date.now() < graceUntil;
  }

  function setMapManual(v: boolean): void {
    mapManual.value = v;
  }

  /** auto 模式下按时间判断：白天浅色、夜间深色 */
  const resolvedTheme = computed<'dark' | 'light'>(() => {
    if (theme.value !== 'auto') return theme.value;
    const h = new Date().getHours();
    return h >= 7 && h < 18 ? 'light' : 'dark';
  });

  function apply() {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme.value;
    root.dataset.fontscale = fontScale.value;
    root.dataset.contrast = contrast.value;
    root.dataset.motion = motion.value;
    localStorage.setItem(LS.theme, theme.value);
    localStorage.setItem(LS.font, fontScale.value);
    localStorage.setItem(LS.contrast, contrast.value);
    localStorage.setItem(LS.motion, motion.value);
    localStorage.setItem('robotaxi.voice', voiceEnabled.value ? '1' : '0');
  }

  watch([theme, fontScale, contrast, motion, resolvedTheme], apply, { immediate: true });

  function cycleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : theme.value === 'light' ? 'auto' : 'dark';
  }
  function toggleFont() {
    fontScale.value = fontScale.value === 'standard' ? 'large' : 'standard';
  }
  function toggleContrast() {
    contrast.value = contrast.value === 'normal' ? 'high' : 'normal';
  }
  function toggleMotion() {
    motion.value = motion.value === 'full' ? 'calm' : 'full';
  }

  return {
    theme,
    resolvedTheme,
    fontScale,
    contrast,
    motion,
    voiceEnabled,
    touching,
    mapManual,
    setTouching,
    isInteracting,
    setMapManual,
    cycleTheme,
    toggleFont,
    toggleContrast,
    toggleMotion,
  };
});
