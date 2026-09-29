/**
 * 图表组合式函数。
 *
 * 只做四件事，别的都交给调用方：
 *   1. 按需引入（echarts/core + 具体 chart / component / renderer），不让整包进 bundle
 *   2. 自己 ResizeObserver，自己跟随主题重建 option
 *   3. 数据为空时返回 null，让页面去显示空状态（空坐标系是最糟的空状态）
 *   4. 组件卸载时 dispose，不留内存泄漏
 */
import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, MarkPointComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { ensureChartTheme, onThemeChange, prefersReducedMotion } from './theme';

// 注意：故意不注册 LegendComponent。图例是报表语言，车内用直接标注替代。
echarts.use([BarChart, LineChart, PieChart, GridComponent, MarkPointComponent, TooltipComponent, CanvasRenderer]);

/** 构建图表配置；返回 null 表示"这次没有数据可画" */
export type ChartOptionBuilder = () => EChartsOption | null;

export interface UseChartResult {
  /** 是否拿到了可画的数据（false 时页面应显示 EmptyState） */
  hasData: ComputedRef<boolean>;
  /** 立刻渲染一次；返回是否真的画出了东西 */
  render: () => boolean;
  /** 手动触发一次尺寸重算（ResizeObserver 之外的情况用） */
  resize: () => void;
  /** 销毁实例 */
  dispose: () => void;
}

export function useChart(elRef: Ref<HTMLElement | null>, buildOption: ChartOptionBuilder): UseChartResult {
  let inst: echarts.ECharts | null = null;
  let ro: ResizeObserver | null = null;
  let roTarget: HTMLElement | null = null;
  let stopThemeWatch: (() => void) | null = null;
  /** 主题变化时递增，用来让下面的 computed 失效并重算颜色 */
  const themeTick = ref(0);

  const option = computed<EChartsOption | null>(() => {
    // 读一下 tick：CSS 变量变了不会触发 Vue 的响应式，只能靠主题订阅来推
    void themeTick.value;
    return buildOption();
  });

  const hasData = computed(() => option.value !== null);

  function dispose(): void {
    inst?.dispose();
    inst = null;
  }

  function apply(): void {
    if (!inst) return;
    const opt = option.value;
    if (!opt) {
      // 数据被清空：把画布清掉，别留一张过期的图
      inst.clear();
      return;
    }
    inst.setOption({ animation: !prefersReducedMotion(), ...opt }, true);
  }

  function observe(el: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    if (roTarget === el && ro) return;
    ro?.disconnect();
    roTarget = el;
    ro = new ResizeObserver(() => inst?.resize());
    ro.observe(el);
  }

  function render(): boolean {
    const el = elRef.value;
    if (!el) return false;
    if (!inst || inst.getDom() !== el) {
      dispose();
      inst = echarts.init(el, ensureChartTheme(), { renderer: 'canvas' });
      observe(el);
    }
    apply();
    return option.value !== null;
  }

  function resize(): void {
    inst?.resize();
  }

  onMounted(() => {
    render();
    stopThemeWatch = onThemeChange(() => {
      // 颜色在 buildOption 里现读令牌，所以只要重新注册主题并重算一次就够了
      ensureChartTheme();
      themeTick.value += 1;
    });
  });

  // 容器经常是 v-if 出来的（空数据时不存在），元素一出现就补一次初始化
  watch(
    elRef,
    (el) => {
      if (el) render();
      else dispose();
    },
    { flush: 'post' },
  );

  watch(option, () => apply(), { flush: 'post' });

  onBeforeUnmount(() => {
    stopThemeWatch?.();
    stopThemeWatch = null;
    ro?.disconnect();
    ro = null;
    roTarget = null;
    dispose();
  });

  return { hasData, render, resize, dispose };
}
