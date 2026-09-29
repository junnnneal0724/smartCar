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
    cycleTheme,
    toggleFont,
    toggleContrast,
    toggleMotion,
  };
});
