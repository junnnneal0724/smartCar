# 设计资产 · taste-skill 说明与使用规范

> 配套文档：`01-产品设计-智能出行Robotaxi用户端.md`、`02-前端设计规范-ToC风格与图表指南.md`

---

## 1. 这是什么

**taste-skill** 是一套开源的 **Agent Skills**（给 AI 编码助手用的设计指令集），目标是解决一个具体问题：

> AI 写前端会稳定地输出同一套廉价模板：AI 紫渐变、三等分特性卡、满屏 em dash、div 拼的假截图、Inter 字体、KPI 数字墙、每个 section 都挂一个 uppercase eyebrow。
> taste-skill 把"高级感"拆成**可执行的硬规则与禁令**，并要求在交付前跑一遍机械化的 Pre-Flight 检查。

它做的事不是"给几个好看的配色"，而是**约束 AI 的设计行为**：先读需求（Design Read）→ 设定三个旋钮 → 按规则出稿 → 过检查清单。

### 1.1 来源与版本（已存档）

| 项 | 值 |
| --- | --- |
| 仓库 | `https://github.com/Leonxlnx/taste-skill` |
| 作者 | Leonxlnx |
| 协议 | **MIT**（可自由用于商业项目，保留版权声明即可） |
| 默认分支 | `main` |
| 归档 commit | `ce26fc25c0e5e8cab638f883de62d9a86ee5e45b` |
| 仓库最后更新 | 2026-09-26 |
| 下载日期 | 本次会话下载并解压 |
| Stars | 约 91k |
| 本地位置 | `robotaxi-demo/skills/`（共 4.7 MB） |
| 原始归档 | `robotaxi-demo/skills/_download/taste-skill.zip`（4.4 MB，留档，可删） |

### 1.2 下载方式（重要，本机有网络限制）

本机 **`github.com` 无法访问**（TLS 连接被重置），但以下域名可用（已实测）：

- ✅ `codeload.github.com`（仓库压缩包）
- ✅ `api.github.com`（仓库元数据）
- ✅ `registry.npmjs.org`（npm 依赖）
- ❌ `github.com`、`raw.githubusercontent.com`、`gitee.com`（PowerShell 侧）、`Invoke-WebRequest` 全部失败

因此本项目**所有网络操作都走 Node / pnpm**。下载脚本已保留：

```powershell
# 重新下载（如需更新版本）
node robotaxi-demo/scripts/fetch-taste-skill.mjs
node robotaxi-demo/scripts/net-probe.mjs   # 网络可达性探测
node robotaxi-demo/scripts/check-deps.mjs  # 依赖版本核实
```

> ⚠️ 不要用 `Invoke-WebRequest` / `curl.exe`（PowerShell 的 .NET HTTP 栈在本机被拦截，报"基础连接已经关闭"）。

---

## 2. 目录内容

```
robotaxi-demo/skills/
├── README.md                     # 官方说明（含各 skill 的 install name）
├── CHANGELOG.md
├── LICENSE                       # MIT
├── taste-skill/SKILL.md          # ★ 主技能（v2 experimental，85 KB，1206 行）
├── taste-skill-v1/SKILL.md       # v1 存档版（20 KB）
├── gpt-tasteskill/SKILL.md       # 给 GPT/Codex 的更严格变体
├── soft-skill/SKILL.md           # ★ 高级消费级视觉（10 KB）
├── minimalist-skill/SKILL.md     # 极简产品 UI（7.7 KB）
├── brutalist-skill/SKILL.md      # 工业粗野风（本项目不用）
├── brandkit/SKILL.md             # 品牌套件方向（15.6 KB）
├── redesign-skill/SKILL.md       # 既有项目 UI 审计与改造（14.7 KB）
├── image-to-code-skill/SKILL.md  # 图 → 分析 → 代码流水线（35.6 KB）
├── imagegen-frontend-web/SKILL.md    # 网站参考图生成（36 KB）
├── imagegen-frontend-mobile/SKILL.md # 移动端参考图生成（39.4 KB）
├── output-skill/SKILL.md         # 防止 AI 交付半成品（2.5 KB）
├── stitch-skill/SKILL.md         # Google Stitch 兼容规则 + DESIGN.md 导出格式
└── _download/taste-skill.zip     # 原始归档
```

---

## 3. 每个子技能在本项目怎么用

| 子技能（目录） | install name | 用在本项目哪里 | 优先级 |
| --- | --- | --- | --- |
| `taste-skill` | `design-taste-frontend` | **总纲**：Design Read、三旋钮、反 AI 味禁令、Pre-Flight 清单。`/about` 介绍页与 `/login` 直接用其落地页范式 | ★★★ 必用 |
| `soft-skill` | `high-end-visual-design` | **主力**：消费级高级感（柔和对比、大留白、premium 字体、弹簧动效），直接服务"ToC 页面要好看" | ★★★ 必用 |
| `minimalist-skill` | `minimalist-ui` | **行程页 / 订单页**：信息较多但不能有后台味的界面 | ★★★ 必用 |
| `brandkit` | `brandkit` | 品牌色板 / 字体 / logo 方向（M0 阶段定 token 用） | ★★ 建议 |
| `imagegen-frontend-mobile` | `imagegen-frontend-mobile` | 生成移动端页面参考图（本产品移动优先） | ★★ 建议 |
| `image-to-code-skill` | `image-to-code` | 「生成参考图 → 分析 → 写代码」流水线 | ★★ 建议 |
| `redesign-skill` | `redesign-existing-projects` | **M2 视觉打磨阶段**：对已有页面做审计式改造 | ★★ 后期 |
| `output-skill` | `full-output-enforcement` | 防止 AI 交付半成品（留 TODO 占位） | ★ 备用 |
| `gpt-tasteskill` | `gpt-taste` | 只在用 GPT/Codex 时替代主技能 | ★ 条件 |
| `stitch-skill` | `stitch-design-taste` | 若要走 Google Stitch 出稿流程 | ★ 条件 |
| `brutalist-skill` | `industrial-brutalist-ui` | **本项目不使用**（风格不符） | ✗ |
| `taste-skill-v1` | `design-taste-frontend-v1` | 仅当 v2 出现问题时回退 | ✗ |

### 3.1 官方推荐组合（本项目采用）

1. **起步默认**：`design-taste-frontend`（主技能，取其设计工程法则与禁令）
2. **视觉方向已定**（消费级高级感）：叠加 `high-end-visual-design`
3. **信息型界面**：叠加 `minimalist-ui`
4. **防半成品**：可选叠加 `full-output-enforcement`

---

## 4. ⚠️ 重要适用性说明（必须先读，否则会误用）

### 4.1 主技能自己划定的边界

`taste-skill/SKILL.md` 第 8 行原文：

> "Landing pages, portfolios, and redesigns. **Not dashboards, not data tables, not multi-step product UI.**"

**本项目属于"multi-step product UI + 地图为中心"**，因此：

| 主技能的内容 | 本项目是否采用 |
| --- | --- |
| §0 Design Read、§1 三个旋钮 | ✅ 采用（取值见 `02` 文档 §1） |
| §4 设计工程指令（排版 / 配色 / 布局 / 材质 / 交互态） | ✅ 采用 |
| §6 性能与无障碍护栏、§8 暗色模式协议 | ✅ 采用 |
| §9 AI Tells 禁令（含 em dash 绝对禁令） | ✅ 采用 |
| §11 Redesign 协议 | ✅ M2 阶段采用 |
| §14 Pre-Flight 检查 | ✅ 采用（已落进 `02` 文档 §9） |
| §5 落地页区块骨架（sticky-stack / horizontal-pan / scroll-reveal） | ❌ **不套用**（那是落地页范式，产品 UI 用不上） |
| §12 Block Library | ❌ 不套用 |

也就是说：**取其"设计法则"，不取其"页面骨架"**。`/about` 这类展示型页面例外，可以完整套用。

### 4.2 三个旋钮的取值（本项目固定）

| 旋钮 | 值 |
| --- | --- |
| `DESIGN_VARIANCE` | **7** |
| `MOTION_INTENSITY` | **6** |
| `VISUAL_DENSITY` | **4** |

例外：安全类页面 `3 / 2 / 5`；订单详情与出行足迹 `VARIANCE 7 / MOTION 6 / DENSITY 5`。
**不允许各页面自行改动这三个值。**

### 4.3 em dash 禁令的适用范围

主技能把 em dash（`—`）列为"最高频违规项"，要求**零容忍**。

项目的执行口径：

- **面向用户可见的 UI 文案**：零 em dash（`—`）、零 en dash（`–`）作分隔符。中文界面里也一样，改用逗号、句号、括号或分行。
- **内部设计文档 / 代码注释 / commit message**：不受此限。
- 允许的破折号字符只有普通连字符 `-`（连字符、范围如 `2018-2026`）。

### 4.4 与本项目 `02` 文档的关系

`02-前端设计规范-ToC风格与图表指南.md` 是**本项目的落地版**：它把 taste-skill 的通用规则，加上"反后台化守则"和"ECharts ToC 化规范"（这两块 taste-skill 没有覆盖），整理成可直接执行的标准。

**冲突时的优先级**：`02` 文档 > taste-skill。

---

## 5. 怎么"调用"这些 skill

### 5.1 在本项目里（推荐，无需安装 CLI）

skill 就是 Markdown 指令文件。直接让 AI 助手读取对应文件即可：

```
请先读 robotaxi-demo/skills/taste-skill/SKILL.md 与
robotaxi-demo/skills/soft-skill/SKILL.md，
按其中的规则为「首页叫车面板」写代码。
Design Read 先给我一行，三个旋钮用 7 / 6 / 4。
```

### 5.2 用官方 CLI 安装（需要能访问 github.com，本机当前不行）

```bash
# 全部安装
npx skills add https://github.com/Leonxlnx/taste-skill

# 只装某个（用 install name，不是目录名）
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
npx skills add https://github.com/Leonxlnx/taste-skill --skill "high-end-visual-design"
npx skills add https://github.com/Leonxlnx/taste-skill --skill "minimalist-ui"
```

> 本机 `github.com` 不通，`npx skills add` 会失败。**直接用本地已下载的 `skills/` 目录即可**，效果等价。

### 5.3 配合出图流程（可选）

```
按 image-to-code 流程：先用 imagegen-frontend-mobile 生成首页与行程页参考图，
再分析这些图，最后用 Vue3 + Naive UI 实现。
```

---

## 6. 执行纪律（本项目的硬性要求）

1. **开工先声明 Design Read**，一行，写在 PR 描述或对话里。
2. **三旋钮取值固定**，不允许单页调整。
3. **交付前必须过 `02` 文档 §9 的 Pre-Flight 清单**，逐条勾选。
4. **风格红线优先于设计感**：反后台化守则（`02` 文档 §3）是不可协商的约束。
5. **em dash 禁令**适用于全部 UI 文案。
6. 每个多列布局必须在同一组件内写出 `< 768px` 降级方案。
7. 任何新页面开工前，先判断它属于 `02` 文档 §1.2 的哪一类页面，用对应范式。

---

## 7. 维护

- **更新 skill**：`node robotaxi-demo/scripts/fetch-taste-skill.mjs` 会重新拉取 `main` 分支最新压缩包；解压后按 §1.1 更新 commit 记录。
- **协议**：MIT。分发本项目时保留 `skills/LICENSE`。
- **不要修改 `skills/` 下的原始文件**，本项目对 skill 的定制化解读一律写在 `02` 文档里，保持"上游可随时覆盖"。
