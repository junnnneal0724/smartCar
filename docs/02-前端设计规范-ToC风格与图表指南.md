# 前端设计规范 · ToC 风格与图表指南

> ## ⚠️ 场景已修正，本规范部分条款被覆盖
>
> 产品从「手机端叫车 App」修正为「**车内交互终端（横屏单屏）**」，见 `04-场景修正-车内交互终端.md`。
>
> **仍然完全有效**（占本规范大部分）：
> - §3 反后台化守则（红线，一条都不放松）
> - §4 ECharts 图表规范（图表落点改为「行程小结」与「旅程解释」）
> - §5 动效规范（时长与缓动不变）
> - §7 无障碍与性能护栏
> - §9 Pre-Flight 检查清单
>
> **被覆盖的条款**：见本文 **§11 车内终端适配**（旋钮取值、深色优先、字号、触控热区、横屏双栏布局）。
>
> 冲突时：`04` > 本文件 §11 > 本文件其余章节。

> 配套文档：`01-产品设计-智能出行Robotaxi用户端.md`（已作废）、`04-场景修正-车内交互终端.md`（当前规格）、`03-设计资产-taste-skill说明.md`（设计技能库用法）
> 适用范围：本项目全部前端界面，**含 `/ops` 内部工具页**
> 本规范与 `taste-skill` 对齐；两者冲突时以本文件为准。

---

## 0. 一句话总纲

> **这是一个给普通人用的出行产品，不是给运营用的管理后台。**
> 用户打开它的目的是"叫一辆车"，不是"查询数据"。每一个界面都必须先回答"用户此刻想干什么"，而不是"我们有哪些字段可以展示"。

---

## 1. Design Read 与三个旋钮

按 `taste-skill` 的要求，动手前先声明设计读法（每个页面开工前在 PR 描述里写一行）：

> **Reading this as: 面向大众乘客的 ToC 出行产品（多步产品 UI + 地图为中心），语气 premium consumer 叠加 trust-first，倾向自绘矢量地图 + 克制的高级消费电子语言 + Naive UI 深度主题改造。**

### 1.1 旋钮取值（全局固定，不允许单页自行调整）

| 旋钮 | 取值 | 含义 |
| --- | --- | --- |
| `DESIGN_VARIANCE` | **7** | 有设计感但不乱。功能型页面不做 Awwwards 式实验布局 |
| `MOTION_INTENSITY` | **6** | 车辆移动、状态切换必须有动效；禁止无意义循环微动效 |
| `VISUAL_DENSITY` | **4** | 给地图留呼吸空间 |

**例外降档组（trust-first）**：`/safety`、SOS、紧急联系人、结算页 → `3 / 2 / 5`。这些页面清晰与克制压倒设计感。

**例外升档组（信息较多）**：`/orders/:id` 订单详情、`/me/stats` 出行足迹 → `VISUAL_DENSITY: 5`，其余不变。

### 1.2 页面类型分类（决定用哪套范式）

| 类型 | 页面 | 范式 |
| --- | --- | --- |
| **地图型**（核心） | `/`、`/ride/*` | 地图铺满 + 底部抽屉（Bottom Sheet）叠加 |
| **流程型** | `/ride/confirm`、`/ride/settle` | 单列纵向流程 + 底部固定主操作按钮 |
| **内容型** | `/orders`、`/messages`、`/me/*` | 卡片流 / 时间轴，**不是列表表格** |
| **展示型** | `/about`、`/login`、`/onboarding` | 落地页范式，可用 `taste-skill` 主技能完整套路 |
| **工具型** | `/ops`、`/ops/db` | 极简控件面板，仍然不是后台 |

---

## 2. 视觉令牌（Design Tokens）

全部落成 CSS 变量，放在 `src/styles/tokens.css`，深浅色用 `[data-theme]` 切换。

```css
:root {
  /* ---- Accent：全站唯一强调色 ---- */
  --c-accent:          #2F6BFF;
  --c-accent-weak:     #E8EFFF;  /* 浅底，用于选中态背景 */
  --c-accent-press:    #1F55E0;

  /* ---- 语义色（仅小面积：图标 / 文字 / 细描边） ---- */
  --c-success:         #00A88F;
  --c-warn:            #D9642F;
  --c-danger:          #D93A3C;

  /* ---- 中性 ---- */
  --c-bg:              #F6F8FB;
  --c-surface:         #FFFFFF;
  --c-surface-sunken:  #EEF1F6;
  --c-border:          #E4E8EF;
  --c-text-1:          #141A24;
  --c-text-2:          #5A6472;
  --c-text-3:          #98A2B3;

  /* ---- 地图 ---- */
  --c-map-road:        #E8EDF5;
  --c-map-road-main:   #D5DDEA;
  --c-map-water:       #DCE7F5;
  --c-map-park:        #E3EFE6;
  --c-map-block:       #F1F4F9;

  /* ---- 圆角（Shape Consistency Lock） ---- */
  --r-btn:   999px;   /* 按钮：全胶囊 */
  --r-card:  20px;    /* 卡片 */
  --r-input: 12px;    /* 输入框 */
  --r-sheet: 28px;    /* 抽屉顶部 */

  /* ---- 字体 ---- */
  --f-sans:  "Geist", "PingFang SC", "HarmonyOS Sans", "Microsoft YaHei", system-ui, sans-serif;
  --f-mono:  "Geist Mono", "JetBrains Mono", ui-monospace, monospace;  /* 数字专用 */

  /* ---- 间距阶梯（4 的倍数） ---- */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px;

  /* ---- 阴影：必须染背景色调，禁止纯黑投影 ---- */
  --sh-1: 0 1px 2px rgba(20, 26, 36, .04), 0 4px 12px rgba(20, 26, 36, .05);
  --sh-2: 0 2px 6px rgba(20, 26, 36, .05), 0 16px 40px rgba(20, 26, 36, .08);
  --sh-sheet: 0 -8px 40px rgba(20, 26, 36, .10);

  /* ---- 动效 ---- */
  --ease-out:  cubic-bezier(.22, 1, .36, 1);
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);
  --d-fast: 160ms; --d-base: 240ms; --d-slow: 400ms;
}

[data-theme="dark"] {
  --c-accent:          #5B8CFF;
  --c-accent-weak:     #1B2740;
  --c-accent-press:    #7AA2FF;
  --c-success:         #2ED3BC;
  --c-warn:            #FF9466;
  --c-danger:          #FF6B6D;

  --c-bg:              #0E1116;   /* 禁用纯黑 #000 */
  --c-surface:         #171B22;
  --c-surface-sunken:  #11151B;
  --c-border:          #262C36;
  --c-text-1:          #F2F5FA;
  --c-text-2:          #A6B0BF;
  --c-text-3:          #6B7686;

  --c-map-road:        #232A35;
  --c-map-road-main:   #2E3745;
  --c-map-water:       #1A2536;
  --c-map-park:        #1B2A22;
  --c-map-block:       #171C24;

  --sh-1: 0 1px 2px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.35);
  --sh-2: 0 2px 6px rgba(0,0,0,.35), 0 16px 40px rgba(0,0,0,.45);
  --sh-sheet: 0 -8px 40px rgba(0,0,0,.5);
}
```

### 2.1 硬性约束（违反即为缺陷）

| 规则 | 说明 |
| --- | --- |
| **一个 accent** | 全站只有一个强调色。语义色只出现在图标、细描边、小字上 |
| **饱和度 < 80%** | accent 之外的色必须低饱和 |
| **禁止纯黑** | 深色模式底色 `#0E1116`，不是 `#000000` |
| **禁止 AI 紫 / 霓虹外发光** | 任何紫色渐变、glow 阴影都不允许 |
| **Color Consistency Lock** | accent 确定后，地图、图表、图标、按钮全部统一 |
| **Shape Consistency Lock** | 圆角只用上表四档，不允许出现第五种圆角 |
| **一个项目一套灰** | 全站统一冷灰，不允许冷灰暖灰混用 |
| **阴影染色调** | 阴影用 `rgba(20,26,36,...)`，禁止 `rgba(0,0,0,...)` |

---

## 3. 反后台化守则（本章是红线）

### 3.1 禁止清单（出现任意一条即视为风格跑偏，需返工）

| # | 禁止项 | 为什么它是"后台味" |
| --- | --- | --- |
| 1 | 左侧竖向导航栏 + 顶部面包屑 + 右侧内容区的三栏骨架 | 管理系统的经典骨架，与 ToC 无关 |
| 2 | 满屏 DataTable（斑马纹、分页器、每列筛选、操作列"编辑/删除"） | 表格是给运营批量处理数据用的 |
| 3 | 顶部一整行筛选表单（开始时间 / 结束时间 / 状态 / 查询 / 重置） | 用户不会"查询"自己的行程，他只会"看" |
| 4 | 全屏浅灰底 + 一堆白方块卡片，卡片里再塞表格 | 典型的 BI 看板 |
| 5 | Element Plus / Ant Design 默认蓝 + 默认组件外观 | 一眼就是脚手架 |
| 6 | 右上角"管理员头像 + 退出登录"下拉 | 后台身份标识 |
| 7 | KPI 数字墙（4 个巨型数字 + 同比环比箭头） | 运营看板 |
| 8 | 满屏彩色状态 Tag（已完成 / 进行中 / 已取消 用高饱和底色铺开） | 状态机可视化是后台需求 |
| 9 | 空状态写"暂无数据" | 后台式冷漠文案 |
| 10 | 表格 + 图表组合的"数据汇总页" | 本项目**任何页面都不允许**以这个形态出现 |
| 11 | 用 `alert()` / 默认 `confirm()` 做交互 | 原生弹窗，廉价感 |
| 12 | 整页 loading 转圈 | 用骨架屏 |
| 13 | 侧边抽屉（Drawer）从右侧滑出做详情 | 后台详情模式；我们用底部抽屉或独立页面 |

### 3.2 应当这样做（对照表）

| 场景 | ❌ 后台做法 | ✅ ToC 做法 |
| --- | --- | --- |
| 导航 | 左侧竖排菜单，含"订单管理/车辆管理/数据统计" | 移动端底部 Tab（首页 / 订单 / 消息 / 我的），桌面端顶部极简胶囊导航，**导航项 ≤ 4** |
| 订单列表 | 表格 + 分页器 + 状态列 | **卡片流**：每张卡讲一次行程（时间、起终点、费用、车辆缩略图），支持"进行中"置顶 |
| 订单详情 | 两列"字段名: 字段值"表格 | 纵向时间轴 + 地图轨迹回放 + 费用明细卡片 |
| 数据统计 | 筛选器 + 4 张图 + 数据表格 | **出行足迹**：一张大图讲故事 + 2 个数字卡 + 常去地点卡片流，每张图配一句人话结论 |
| 状态展示 | 彩色 Tag | 图标 + 文字色（如到达用 check 图标 + `--c-success` 文字） |
| 表单 | 一行多列的查询表单 | 单列纵向，label 在输入框**上方**，错误提示在**下方** |
| 主操作 | 顶部工具栏按钮 | 底部固定主按钮，拇指可达 |
| 空状态 | "暂无数据" | 有插画 / 图形 + 引导语 + 一个动作按钮 |
| 弹窗 | 居中 modal 带标题栏和"确定/取消" | 底部 ActionSheet / 内联展开 |
| 详情入口 | 右侧 Drawer | 底部抽屉上滑 / 路由跳转（带共享元素过渡） |

### 3.3 通用替代原则

当你想做一个"管理界面"的时候，先问三个问题：

1. **用户此刻的目标是什么？** 把界面重写成达成这个目标的最短路径。
2. **这个数字用户需要"比较"还是"感受"？** 需要感受 → 用大字 + 上下文文案；需要比较 → 用图，不用表。
3. **这一屏有没有一个明确焦点？** 如果没有，砍掉内容直到有。

---

## 4. ECharts 图表规范（重点章节）

### 4.1 定位澄清

图表在本产品里是**给用户看自己的出行故事**，不是给运营看的数据看板。

**允许出现图表的位置**（白名单，只此四处）：

| 位置 | 图表 | 目的 |
| --- | --- | --- |
| `/me/stats` 出行足迹 | 月度出行次数（柱+折线双轴）、目的地类型（环形）、出行时段分布（柱） | 让用户看到自己的出行习惯，"原来我一个月坐了 18 次" |
| `/ride/settle` 结算页 | 单次行程费用累积曲线（面积图） | 让价格透明，"费用是在哪一段涨起来的" |
| `/orders/:id` 订单详情 | 本次行程速度 / 里程小图（可选） | 行程回放的辅助 |
| `/` 首页 | 极简"错峰出行可省 ¥X"微型条形 | 引导决策，不占视觉重心 |

**禁止出现图表的位置**：任何需要"筛选 + 汇总 + 表格"三件套的页面。如果某个需求长成那样，说明需求本身是后台需求，要重新拆。

### 4.2 硬性做法清单

| 规则 | 具体做法 |
| --- | --- |
| **去掉网格线** | `splitLine.show = false`，`splitArea.show = false` |
| **去掉坐标轴线与刻度** | `axisLine.show = false`，`axisTick.show = false` |
| **弱化轴标签** | `axisLabel.color = var(--c-text-3)`，字号 11，只保留必要刻度（时间轴只标首/中/尾） |
| **不用 legend** | 直接在图形上标注（`label.show = true` 或 `markPoint`），图例是报表语言 |
| **不用实心色块** | 柱状用圆角，面积用渐变（`LinearGradient` 从 accent 到透明） |
| **数值直接标注** | 关键点 `label` 直接写数字，用户不用去猜 |
| **每图一句话结论** | 图表下方必须有结论文案，例如"你在 8 月的出行次数是平时的 2 倍" |
| **每页 ≤ 2 张图** | 超过就是数据看板 |
| **配色只用 token** | 从 `--c-accent` 与语义色取，禁止 ECharts 默认色板 |
| **必须适配深浅色** | 主题切换时重绘 |
| **必须响应 reduced-motion** | `prefers-reduced-motion: reduce` 时 `animation: false` |
| **必须有空状态** | 新用户没有历史订单时，显示引导文案而不是空坐标系 |
| **必须有骨架屏** | 图表区域用等高占位块，禁止布局跳动（CLS） |

### 4.3 主题代码（`src/charts/theme.ts`）

```ts
import type { EChartsOption } from 'echarts';
import * as echarts from 'echarts/core';

/** 读取 CSS 变量，保证图表与页面共用同一套 token */
const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function buildTocTheme(): Record<string, unknown> {
  const accent = cssVar('--c-accent');
  const text1 = cssVar('--c-text-1');
  const text2 = cssVar('--c-text-2');
  const text3 = cssVar('--c-text-3');
  const border = cssVar('--c-border');
  const surface = cssVar('--c-surface');

  return {
    color: [accent, cssVar('--c-success'), cssVar('--c-warn'), cssVar('--c-text-3')],
    textStyle: { fontFamily: cssVar('--f-sans'), color: text2 },
    // 禁掉 ECharts 默认的深色 tooltip 盒子
    tooltip: {
      backgroundColor: surface,
      borderColor: border,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: text1, fontSize: 12 },
      extraCssText: 'border-radius:14px; box-shadow:0 8px 28px rgba(20,26,36,.12);',
      axisPointer: { type: 'none' },
    },
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    categoryAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: text3, fontSize: 11 },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },   // 数值轴默认不显示刻度，靠直接标注
    },
    line: {
      smooth: 0.35,
      symbol: 'none',
      lineStyle: { width: 2.5, cap: 'round' },
    },
    bar: {
      itemStyle: {
        borderRadius: [6, 6, 6, 6],   // 圆角柱，报表感的关键差别
      },
      barMaxWidth: 18,
    },
    pie: {
      itemStyle: { borderWidth: 0 },
      label: { show: false },
    },
    animationDuration: 800,
    animationEasing: 'cubicOut',
  };
}

let registered = false;
export function ensureTheme() {
  if (registered) return;
  echarts.registerTheme('toc', buildTocTheme());
  registered = true;
}
```

### 4.4 组件封装（`src/charts/useChart.ts`）

要求：按需引入、自动 resize、主题切换重建、卸载销毁、reduced-motion 关闭动画。

```ts
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, GraphicComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ensureTheme } from './theme';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, GraphicComponent, CanvasRenderer]);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useChart(el: Ref<HTMLElement | undefined>, theme: Ref<string>) {
  let inst: echarts.ECharts | null = null;
  let ro: ResizeObserver | null = null;
  const option = ref<Record<string, unknown>>({});

  const render = () => {
    if (!el.value) return;
    inst?.dispose();
    ensureTheme();
    inst = echarts.init(el.value, 'toc', { renderer: 'canvas' });
    inst.setOption({ animation: !reduced, ...option.value });
  };

  onMounted(() => {
    render();
    ro = new ResizeObserver(() => inst?.resize());
    if (el.value) ro.observe(el.value);
  });

  watch(option, () => inst?.setOption(option.value, true), { deep: true });
  watch(theme, render);   // ECharts 换主题必须重建实例

  onBeforeUnmount(() => {
    ro?.disconnect();
    inst?.dispose();
    inst = null;
  });

  return { option };
}
```

> **注意**：ECharts 必须**按需引入**（`echarts/core` + 具体 chart/component），不要 `import * as echarts from 'echarts'`，否则包体积会多出 800KB 以上。

### 4.5 各图表的定制要求

**① 月度出行（`/me/stats`）**

- 类型：柱状（次数，圆角）+ 折线（花费，双轴，右轴隐藏刻度）。
- 只标注最大值与当前月，其余不标。
- 结论文案模板：`你在 8 月出行 {n} 次，比上月多 {m} 次`。
- 空状态：`还没有出行记录，叫一辆车开始吧` + 按钮。

**② 目的地类型分布（`/me/stats`）**

- 类型：**环形图**（不是实心饼图），中心放总次数大字。
- 不要 legend，用右侧的自定义列表（色点 + 名称 + 百分比），列表项可点击高亮对应扇区。
- 内圈半径 `['58%', '76%']`，扇区之间留 2px 间隙（用 `itemStyle.borderColor = surface`）。

**③ 出行时段分布（`/me/stats`）**

- 类型：柱状，24 小时横轴。
- 高亮用户最常出行的时段（accent 实色），其余柱用 `--c-text-3` 的淡色。
- 结论文案：`你最常在 18:00 出行，避开这个时段可省约 ¥4`。

**④ 行程费用累积曲线（`/ride/settle`）**

- 类型：**面积图**（`areaStyle` 用 accent 到透明的线性渐变）。
- 不显示坐标轴，只在终点标注总价，在曲线下方用 graphic 标"起步价 / 里程费 / 时长费"分界。
- 目的：让价格透明，而不是展示数据。

### 4.6 禁止的图表用法

- ❌ 用 ECharts 做表格（`dataset` + 大量 `label`）
- ❌ 雷达图 / 仪表盘 / 桑基图（除非有极强理由）
- ❌ 多个小图拼成 `grid` 图表面板（这就是 dashboard）
- ❌ 默认色板（ECharts 默认的蓝绿黄橙红）
- ❌ 带背景轨道的进度条式图表（`barBackgroundColor`）
- ❌ 每根柱子都标数字
- ❌ 图例放在右上角

---

## 5. 动效规范

### 5.1 缓动与时长

| 用途 | 时长 | 缓动 |
| --- | --- | --- |
| 微交互（按钮按下、开关） | 160ms | `--ease-out` |
| 常规过渡（卡片展开、颜色变化） | 240ms | `--ease-out` |
| 页面 / 抽屉进出 | 400ms | `--ease-out` |
| 强调动作（派单成功、到达） | 400~560ms | `--ease-spring` |

**禁止**：`linear`、`ease-in-out`、`ease-in`（除非是无限旋转的加载态）。所有动效必须插值，禁止瞬间跳变。

### 5.2 车辆实时移动（本项目最关键的一处动效）

后端每 500ms 推一次位置，**前端必须插值补间**，否则车会一跳一跳。

```ts
// 目标位置由 SSE 更新，渲染位置用 rAF 追赶
function tick(dt: number) {
  const k = 1 - Math.pow(0.001, dt / 1000);   // 指数平滑，约 200ms 收敛
  render.lng += (target.lng - render.lng) * k;
  render.lat += (target.lat - render.lat) * k;
  // 朝向：处理 359° → 1° 的跨界，走最短角
  render.heading += shortestAngle(target.heading - render.heading) * k;
}
```

要点：

- 用 `requestAnimationFrame` 驱动，**不要用 CSS transition 追坐标**（旋转与位置会不同步）。
- 朝向插值必须处理角度跨界（359° 到 1° 应该走 2° 而不是 358°）。
- 转弯处对路径做圆角处理，避免车辆"直角拐弯"。
- 页面不可见时（`document.hidden`）暂停渲染，恢复时直接对齐目标位置。

### 5.3 禁止的动效

- 无限循环的装饰性动画（呼吸点、流光边框、旋转光圈）
- 视差滚动、滚动提示（"Scroll to explore"）
- 自定义鼠标指针
- 一次入场超过 6 个元素的阶梯动画（视觉噪音）
- 加载态的通用转圈（用骨架屏）

---

## 6. 暗色模式

- 必须支持浅色 / 深色，默认**跟随系统**（`prefers-color-scheme`），用户可手动锁定。
- 用 `[data-theme]` 属性 + CSS 变量实现，组件内**不允许出现硬编码颜色**。
- 深色模式禁用纯黑（`#000`），底色用 `#0E1116`。
- 深色下阴影要减弱、改用描边区分层级（`--c-border`）。
- 地图与图表必须一起切换（本文档 §2 已给出地图专用色；图表通过重建实例换主题）。
- **交付前必须在两个模式下各过一遍**，任何一个模式下出现"看不清"就算缺陷。
- 图片/插画资源要确保两种模式下都不突兀（用带透明通道的 SVG，或准备两套）。

---

## 7. 无障碍与性能护栏

### 7.1 无障碍

| 项 | 要求 |
| --- | --- |
| 对比度 | 正文 ≥ 4.5:1，18px+ 大字 ≥ 3:1。按钮文字与底色必须有足够对比，**禁止白底白字、透明按钮无描边** |
| 触控目标 | ≥ 44×44px |
| 键盘可达 | 全部交互元素可 Tab 聚焦，有清晰焦点环（不要 `outline: none` 了事） |
| 语义 | 用真实语义标签；图标按钮必须有 `aria-label` |
| 大字模式 | 支持字号放大到 1.3x 不破版 |
| 动效 | 必须响应 `prefers-reduced-motion` |
| 地图 | 地图不能是唯一的信息载体（关键信息要有文字版） |

### 7.2 性能

| 指标 | 目标 | 手段 |
| --- | --- | --- |
| LCP | < 2.0s（本地） | 路由懒加载、首屏关键 CSS 内联、字体 `font-display: swap` |
| CLS | < 0.1 | 所有异步区域（包含图表）预留等高占位 |
| 地图帧率 | ≥ 50fps | Canvas 渲染车辆层、只重绘变化层、避免每帧重建 DOM |
| 图表包体积 | 按需引入 | 见 §4.4 |
| 长列表 | 虚拟滚动 | 订单列表 > 50 条时启用 |

---

## 8. 组件规范（自定义组件清单）

| 组件 | 要求 |
| --- | --- |
| `BottomSheet` | 顶部 28px 圆角 + 拖拽把手；支持 peek / half / full 三档；下拉关闭；背景 scrim 用 `rgba(20,26,36,.32)` 且可点击关闭 |
| `CarCard` | 卡片式车辆信息：车牌尾号大字（等宽）+ 车型 + 电量 + 到达倒计时；选中时 accent 描边 + 轻微上浮 |
| `PriceTag` | 等宽数字 + `¥` 缩小到 60%；变化时数字翻滚动画 |
| `CountDown` | 等宽数字防跳动；最后 30 秒变 accent 色；归零触发到达态 |
| `StatCard` | 大数字 + 单位 + 上下文文案（"18 次 · 比上月多 3 次"），**不要同比环比箭头** |
| `StatePill` | 状态胶囊：图标 + 文字，**底色用 `--c-accent-weak` 级别的极淡色**，不用高饱和 |
| `EmptyState` | 图形 + 一句话 + 一个按钮，文案要有人味 |
| `Skeleton` | 形状必须与最终内容一致 |
| `MapCanvas` | 分层 Canvas（底图/路网/路径/车辆/标注），只重绘脏层 |

**Naive UI 改造要求**：`themeOverrides` 必须覆盖 `common.borderRadius`、`common.primaryColor`（取 token）、`Button` 的高度与圆角（胶囊）、`Card` 的圆角与阴影、`Input` 的圆角与边框色、`Tag` 的视觉。**直接使用 Naive UI 默认外观视为未完成**。

---

## 9. Pre-Flight 检查清单（交付前逐条核对）

### 9.1 风格红线

- [ ] 页面上没有左侧导航栏 / 面包屑 / 三栏后台骨架
- [ ] 没有 DataTable（分页器、筛选列、操作列）
- [ ] 没有"筛选表单 + 汇总 + 表格"的组合
- [ ] 没有任何 Element Plus / Ant Design 默认外观的组件
- [ ] 没有 KPI 数字墙（4 个巨数字 + 同比环比）
- [ ] 状态没有用高饱和彩色 Tag 铺满
- [ ] 空状态不是"暂无数据"
- [ ] 只有 1 个 accent 色；圆角只有 4 种

### 9.2 AI 味检查（来自 `taste-skill`）

- [ ] 没有任何 em dash（`—`）或 en dash（`–`）出现在 UI 文案里
- [ ] 没有 AI 紫渐变、霓虹外发光、纯黑背景
- [ ] 没有三等分特性卡片阵列
- [ ] 没有 div 拼的"假截图 / 假后台"
- [ ] 没有 Inter 默认字体（中文用 PingFang / HarmonyOS Sans，拉丁用 Geist）
- [ ] 没有 `01 / 04` 式编号 eyebrow、没有装饰点、没有 "Scroll to explore"
- [ ] 姓名、地名、数字是真实可信的，没有 `John Doe`、`99.99%`、`1234567`
- [ ] 没有"赋能 / 无缝 / 颠覆 / 极致"这类空词

### 9.3 图表专项

- [ ] 图表只出现在白名单的四处
- [ ] 没有网格线、没有坐标轴线、没有 legend
- [ ] 配色取自 token，不是 ECharts 默认色板
- [ ] 每张图都配了一句人话结论
- [ ] 每页图 ≤ 2 张
- [ ] 有空状态、有骨架屏、无 CLS
- [ ] 深浅色下都验证过
- [ ] 按需引入（未整包 import echarts）

### 9.4 交互与状态

- [ ] Loading 用骨架屏，不是转圈
- [ ] 空状态 / 错误态 / 成功态都实现了
- [ ] 按钮有 `:active` 触感反馈（`scale(.98)` 或 `translateY(1px)`）
- [ ] 主操作按钮文字不换行
- [ ] 同一意图只有一个按钮文案
- [ ] 所有表单 label 在输入框上方，错误提示在下方，无 placeholder-as-label

### 9.5 无障碍与性能

- [ ] 对比度达标（含按钮、表单、占位符）
- [ ] 触控目标 ≥ 44px
- [ ] 键盘可聚焦，焦点环可见
- [ ] 响应 `prefers-reduced-motion`
- [ ] 移动端 375px 宽下不横向溢出
- [ ] 桌面端导航单行显示

---

## 10. 响应式约定

| 断点 | 布局 |
| --- | --- |
| `< 768px`（主场景） | 全屏地图 + 底部抽屉；底部 Tab 导航；单列卡片流 |
| `768px - 1024px` | 抽屉改为左侧固定面板（宽 380px）+ 右侧地图 |
| `> 1024px` | 左侧信息面板（宽 420px）+ 右侧大地图；内容最大宽度限制，不做拉伸铺满 |

**硬性要求**：每个多列布局都必须在**同一个组件里**显式写出 `< 768px` 的降级方案，不允许"交给 CSS 自动处理"。不允许用 `h-screen` 做全高区域，用 `min-h-[100dvh]`（避免移动端 Safari 视口跳动）。

---

## 11. 车内终端适配（覆盖前文相关条款）

产品已修正为「**车内交互终端 · 横屏单屏**」（一单一车，需乘客确认出发，暂不做影音娱乐）。本章是这一场景下对前文的覆盖。

### 11.1 三个旋钮（修正值，以此为准）

| 旋钮 | 手机端原值 | **车内终端修正值** | 理由 |
| --- | --- | --- | --- |
| `DESIGN_VARIANCE` | 7 | **5** | 车机是功能型界面，布局求稳，可读性优先于设计感 |
| `MOTION_INTENSITY` | 6 | **4** | 行驶中动效过多会加重晕车、分散注意力 |
| `VISUAL_DENSITY` | 4 | **3** | 观看距离 50~80cm，环境复杂，信息要更少更大 |

**例外**：`/summary` 行程小结页可到 `6 / 5 / 4`（此时车已停稳，可以稍微"好看"一点）。

### 11.2 色调：深色优先

车机**默认深色**（夜间行车不刺眼），浅色仅作备选；跟随环境光自动切换。

```css
:root {
  /* 深色为默认：不是纯黑，是柔和的深蓝灰，减少眩光与"科技大屏"的廉价感 */
  --c-bg:             #0F1319;
  --c-surface:        #161B22;
  --c-surface-raised: #1D232C;
  --c-surface-sunken: #0B0E13;
  --c-border:         #262D38;
  --c-text-1:         #EDF1F7;
  --c-text-2:         #A3ADBD;
  /* 对比度不是凭感觉定的：按车内 50~80cm 观看距离实测，
     text-1 14.5:1 / text-2 7.0:1 / text-3 4.7:1（最差背景 --c-surface-raised）。
     初版的 #6C7686 只有 3.4:1，13px 的次要标签在车里读不清，已废弃。 */
  --c-text-3:         #828D9E;

  /* 唯一 accent：比手机端更亮一档，保证深底上的对比度与强光可读性 */
  --c-accent:         #6E9BFF;
  --c-accent-weak:    #1A2437;
  --c-accent-press:   #8FB3FF;

  /* 语义色：车内以"可读"为先，饱和度略降 */
  --c-success:        #3DD6B5;
  --c-warn:           #FFA76B;
  --c-danger:         #FF7A7C;

  /* 地图（深色路面） */
  --c-map-road:       #232B36;
  --c-map-road-main:  #2F3946;
  --c-map-water:      #16243A;
  --c-map-park:       #17281F;
  --c-map-block:      #141920;

  /* 圆角：比手机端更大更柔（触控亲和） */
  --r-btn:   999px;
  --r-card:  24px;
  --r-panel: 28px;
  --r-input: 14px;

  /* 阴影：深色下几乎不用投影，靠描边与亮度差分层级 */
  --sh-1: 0 1px 0 rgba(255,255,255,.03) inset;
  --sh-2: 0 0 0 1px var(--c-border), 0 12px 32px rgba(0,0,0,.35);

  /* 动效：整体放慢一点，更柔和；弹簧幅度收敛 */
  --d-fast: 200ms; --d-base: 280ms; --d-slow: 460ms;
  --ease-out: cubic-bezier(.22,1,.36,1);
  --ease-spring: cubic-bezier(.32,1.28,.6,1);   /* 原来 1.56 太跳，车内收敛到 1.28 */
}

[data-theme="light"] {
  /* 备选浅色：用于白天强光环境，对比度拉高 */
  --c-bg:             #EEF1F6;
  --c-surface:        #FFFFFF;
  --c-surface-raised: #FFFFFF;
  --c-surface-sunken: #E4E8EF;
  --c-border:         #D8DEE8;
  --c-text-1:         #141A24;
  --c-text-2:         #4E5766;
  /* 浅色下同样按 4.5:1 校准（最差背景是 --c-surface-sunken） */
  --c-text-3:         #5C6472;
  /* accent 压深一档：白字压在 #2F6BFF 上只有 4.5:1（正好卡线），
     强调色文字压在 --c-accent-weak 上只有 3.8:1；压深后分别是 6.1:1 与 5.1:1 */
  --c-accent:         #1F56E0;
  --c-accent-weak:    #E4ECFF;
  --c-map-road:       #DFE5EF;
  --c-map-road-main:  #C9D2E0;
  --c-map-water:      #D6E4F5;
  --c-map-park:       #DCEADE;
  --c-map-block:      #E9EDF3;
}
```

**柔和化手段**（回应"风格更柔和一点"）：

- 深色底用**深蓝灰**而非纯黑，避免刺眼的高对比硬边
- accent 用低饱和度的柔蓝（`#6E9BFF`），不用高饱和电光蓝
- 层级靠**亮度差 + 1px 描边**，不靠重投影
- 渐变只用极淡的一层（透明度 ≤ 8%），且只用在地图底色与主按钮
- 圆角加大到 24~28px，按钮全胶囊
- 动效放慢、弹簧收敛，避免"弹跳感"

### 11.3 排版：整体大一档

| 用途 | 手机端 | **车内终端** |
| --- | --- | --- |
| 正文 | 14px | **16px** |
| 次要文字 | 12px | **14px** |
| 卡片标题 | 16px | **20px** |
| 页面主标题 | 20px | **28px** |
| 关键数字（剩余时间 / 里程） | 32px | **44~56px**，等宽数字 |
| 行程小结页大数字 | 32px | **64px** |

- 中文仍用 `PingFang SC / HarmonyOS Sans / Microsoft YaHei`；拉丁与数字用 `Plus Jakarta Sans`（柔和几何无衬线，符合"更柔和"的要求）。
- 关键数字强制 `font-variant-numeric: tabular-nums`，避免倒计时跳动。

### 11.4 触控与交互

| 项 | 手机端 | **车内终端** |
| --- | --- | --- |
| 最小触控目标 | 44×44px | **56×56px** |
| 主操作按钮高度 | 48px | **64px** |
| 破坏性操作 | 二次确认弹窗 | **长按 1.2s + 进度环**（误触保护更强，且不需要读弹窗） |
| 文字输入 | 允许 | **禁止**（仅数字键盘，用于手机尾号后 4 位） |
| 手势 | 下拉刷新、侧滑返回 | **尽量不用**（乘客坐着，手势区域受限且易误触） |
| 声音 | 可选 | **默认静音**，除安全提示外不播声音 |

### 11.5 布局：横屏双栏，左侧行程卡常驻

```
┌────────────────────────────────────────────────────────────┐
│ 状态条 56px：车辆编号 · 电量 · 摄像头工作中 · 时间 · 字号/语言 │
├───────────────┬────────────────────────────────────────────┤
│               │                                            │
│  行程信息卡    │              主内容区                       │
│  360px 常驻    │   默认 = 地图（路线 + 车辆 + 决策气泡）       │
│               │   切页 = 环境控制 / 帮助 / 停靠 / 小结        │
│  · 目的地      │                                            │
│  · 剩余时间    │                                            │
│  · 剩余里程    │                                            │
│  · 当前动作    │                                            │
│               │                                            │
├───────────────┴────────────────────────────────────────────┤
│ 底部功能条 88px：行程 │ 环境 │ 停靠 │ 帮助                   │
└────────────────────────────────────────────────────────────┘
```

**硬性要求**：

- **左侧行程信息卡常驻**，不随页面切换消失。车内场景下"我什么时候到"是永远需要瞥一眼的信息，任何页面都不该把它藏起来。
- 底部功能条**最多 4 项**（暂不做娱乐，所以是 4 项）。
- 基准分辨率按 **1920×1080 横屏**设计，向下兼容到 1280×720；**不做移动端适配**（车机屏不会小于 1280 宽）。
- 禁止横向滚动、禁止内容溢出到需要滚动才能看到主操作。

### 11.6 图表落点（覆盖 §4.1 白名单）

车内场景下，ECharts 只允许出现在这两处：

| 位置 | 图表 | 目的 |
| --- | --- | --- |
| `/summary` 行程小结 | 本次行程**速度曲线**（面积图）或**费用构成**（环形） | 让乘客看懂"这段路是怎么走的、钱花在哪" |
| `/trip/explain` 旅程解释 | 本次行程的**时间分配**（行驶 / 等待信号 / 礼让 / 拥堵，堆叠条） | 解释"为什么花了这么久"，直接服务于"掌控感" |

**其余规则（去网格线、去 legend、直接标注、配色取 token、每图一句结论、空状态、骨架屏）全部不变。**

### 11.7 无障碍（车内加强）

车上乘客年龄跨度大，且可能有行动不便者：

- **大字模式**：全局字号 ×1.3，必须不破版（这是 P1 功能，不是可选项）
- **高对比模式**：供强光环境使用
- **色盲友好**：状态不能只用颜色区分，必须配图标或文字
- **语音播报开关**：播报"即将到达""车辆已停稳"等关键节点
- **不使用纯色块传达危险**：紧急停靠按钮除红色外必须有文字与图标

