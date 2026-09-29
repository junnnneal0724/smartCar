/**
 * ECharts 的 ToC 主题（车内终端版）。
 *
 * 三条硬规则（见 docs/02 §4.2 与 §11.6）：
 *   1. 颜色只从 CSS 令牌读，主题 / 高对比一换，图跟着换，绝不用 ECharts 默认色板
 *   2. 不要网格线、不要坐标轴线、不要 legend：图例是报表语言，车内一律直接标注
 *   3. 文字用 --c-text-3，字号 12~13：图表是背景，一句话结论才是主角
 *
 * 这里没有任何写死的十六进制 / rgb 字面量：颜色值全部来自 CSS 变量，
 * 需要更柔和的层次时就用令牌颜色与 --c-surface 做混色算出来。
 */
import { computed, onScopeDispose, ref, type ComputedRef } from 'vue';
import { registerTheme } from 'echarts/core';

export const CHART_THEME_NAME = 'cabin-toc';

/** ECharts 在 canvas 里读不到 CSS 变量，字体栈只能写死（值必须与 tokens.css 的 --font-sans 对齐） */
export const CHART_FONT_FAMILY = '"Plus Jakarta Sans Variable", "PingFang SC", system-ui, sans-serif';

export const CHART_FONT_SIZE = 12;
export const CHART_FONT_SIZE_STRONG = 13;

/** 图表里用到的令牌集合 */
export interface ChartTokens {
  accent: string;
  accentWeak: string;
  success: string;
  warn: string;
  danger: string;
  text1: string;
  text2: string;
  text3: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
}

/** 令牌名 → 取值。写死一份是为了让"图表只允许用这些颜色"这件事在代码里可检查 */
const TOKEN_KEYS: Record<keyof ChartTokens, string> = {
  accent: '--c-accent',
  accentWeak: '--c-accent-weak',
  success: '--c-success',
  warn: '--c-warn',
  danger: '--c-danger',
  text1: '--c-text-1',
  text2: '--c-text-2',
  text3: '--c-text-3',
  surface: '--c-surface',
  surfaceRaised: '--c-surface-raised',
  border: '--c-border',
  borderStrong: '--c-border-strong',
};

/**
 * 读一个 CSS 变量。
 * 令牌缺失时（理论上只会发生在样式表还没加载完的瞬间）逐级退到别的令牌，
 * 最后退到 transparent，绝不引入字面色值。
 */
function cssVar(name: string, fallbackName = ''): string {
  if (typeof document === 'undefined') return '';
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value) return value;
  if (fallbackName) return cssVar(fallbackName);
  return 'transparent';
}

/** 读取当前主题下的全部图表令牌 */
export function readChartTokens(): ChartTokens {
  const surface = cssVar(TOKEN_KEYS.surface);
  return {
    accent: cssVar(TOKEN_KEYS.accent, TOKEN_KEYS.text1),
    accentWeak: cssVar(TOKEN_KEYS.accentWeak, TOKEN_KEYS.surfaceRaised),
    success: cssVar(TOKEN_KEYS.success, TOKEN_KEYS.accent),
    warn: cssVar(TOKEN_KEYS.warn, TOKEN_KEYS.accent),
    danger: cssVar(TOKEN_KEYS.danger, TOKEN_KEYS.warn),
    text1: cssVar(TOKEN_KEYS.text1),
    text2: cssVar(TOKEN_KEYS.text2, TOKEN_KEYS.text1),
    text3: cssVar(TOKEN_KEYS.text3, TOKEN_KEYS.text2),
    surface,
    surfaceRaised: cssVar(TOKEN_KEYS.surfaceRaised, TOKEN_KEYS.surface),
    border: cssVar(TOKEN_KEYS.border, TOKEN_KEYS.surfaceRaised),
    borderStrong: cssVar(TOKEN_KEYS.borderStrong, TOKEN_KEYS.border),
  };
}

/* ------------------------------------------------------------------ 颜色计算 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseColor(color: string): Rgb | null {
  const value = color.trim().toLowerCase();
  if (!value || value === 'transparent') return null;

  const hex = value.startsWith('#') ? value.slice(1) : '';
  if (hex.length === 3 || hex.length === 6) {
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    const n = Number.parseInt(full, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  return null;
}

/** 给令牌色加透明度，用来做"从 accent 到透明"的渐变 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Number(a.toFixed(3))})`;
}

/** 两个令牌色之间混色（ratio 是第二个颜色的占比） */
export function mixColor(from: string, to: string, ratio: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return from;
  const t = Math.min(1, Math.max(0, ratio));
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${ch(a.r, b.r)}, ${ch(a.g, b.g)}, ${ch(a.b, b.b)})`;
}

/** 朝表面色靠一点，压低饱和度：车内不要"数据看板"那种高饱和色块 */
function soften(color: string, tokens: ChartTokens): string {
  return mixColor(color, tokens.surface, 0.16);
}

/**
 * 堆叠条 / 多段图形的柔和色板。
 * 全部由令牌混出来，低饱和；顺序固定，保证同一段颜色在两次渲染里一致。
 */
export function chartPalette(tokens: ChartTokens = readChartTokens()): string[] {
  return [
    soften(tokens.accent, tokens),
    soften(tokens.success, tokens),
    soften(tokens.warn, tokens),
    soften(mixColor(tokens.accent, tokens.success, 0.5), tokens),
    soften(mixColor(tokens.accent, tokens.warn, 0.5), tokens),
    soften(tokens.text3, tokens),
  ];
}

/* ------------------------------------------------------------------ 主题对象 */

/** 注册给 ECharts 的主题：网格线 / 轴线 / legend 一律关掉 */
export function buildChartTheme(): Record<string, unknown> {
  const t = readChartTokens();

  return {
    color: chartPalette(t),
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: CHART_FONT_FAMILY,
      fontSize: CHART_FONT_SIZE,
      color: t.text3,
    },
    // legend 组件根本没被 use() 注册，这里再关一次，避免以后有人手滑加回来
    legend: { show: false },
    tooltip: {
      show: false,
      backgroundColor: t.surfaceRaised,
      borderColor: t.border,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: t.text1, fontSize: CHART_FONT_SIZE, fontFamily: CHART_FONT_FAMILY },
      extraCssText: 'border-radius:14px;',
      axisPointer: { type: 'none' },
    },
    // ECharts 6 起 containLabel 已废弃，改为谁用谁显式留白（外面那圈要放直接标注）
    grid: { left: 2, right: 2, top: 14, bottom: 2 },
    categoryAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      splitArea: { show: false },
      axisLabel: { color: t.text3, fontSize: CHART_FONT_SIZE, fontFamily: CHART_FONT_FAMILY },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      splitArea: { show: false },
      // 数值轴默认不显示刻度：数值靠直接标注，不靠读轴
      axisLabel: { show: false },
    },
    line: {
      smooth: 0.35,
      symbol: 'none',
      lineStyle: { width: 2.5, cap: 'round' },
    },
    bar: {
      itemStyle: { borderRadius: [6, 6, 6, 6] },
    },
    pie: {
      itemStyle: { borderWidth: 0 },
      label: { show: false },
      labelLine: { show: false },
    },
    animationDuration: 600,
    animationEasing: 'cubicOut',
  };
}

/**
 * 注册（或重新注册）主题，返回主题名。
 * 主题色变了必须重新注册，所以这里不做 once 缓存。
 */
export function ensureChartTheme(): string {
  registerTheme(CHART_THEME_NAME, buildChartTheme());
  return CHART_THEME_NAME;
}

/* ------------------------------------------------------------------ 主题变化订阅 */

type ThemeListener = (tokens: ChartTokens) => void;

const listeners = new Set<ThemeListener>();
let observer: MutationObserver | null = null;

function notify(): void {
  const tokens = readChartTokens();
  listeners.forEach((cb) => cb(tokens));
}

function startObserving(): void {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    // 深浅色、高对比、大字、减少动效都会影响图表的画法
    attributeFilter: ['data-theme', 'data-contrast', 'data-fontscale', 'data-motion'],
  });
}

function stopObserving(): void {
  if (!observer || listeners.size > 0) return;
  observer.disconnect();
  observer = null;
}

/**
 * 订阅主题变化（data-theme / data-contrast / data-fontscale / data-motion）。
 * 用 MutationObserver 而不是 store：图表只关心"令牌是不是变了"，不关心谁改的。
 */
export function onThemeChange(cb: ThemeListener): () => void {
  listeners.add(cb);
  startObserving();
  return () => {
    listeners.delete(cb);
    stopObserving();
  };
}

/** 用户是否要求减少动效（系统偏好 + 车机的"减少动效"开关） */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'calm') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 响应式的柔和色板：给"图外也要用同一套颜色"的地方（比如堆叠条下面的列表色点）用。
 * CSS 变量变化不会触发 Vue 响应式，所以这里借 onThemeChange 手动推一次。
 */
export function useChartPalette(): ComputedRef<string[]> {
  const tick = ref(0);
  const stop = onThemeChange(() => {
    tick.value += 1;
  });
  onScopeDispose(stop);
  return computed(() => {
    void tick.value;
    return chartPalette();
  });
}
