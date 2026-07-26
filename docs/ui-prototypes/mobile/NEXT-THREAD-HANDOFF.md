# AI Life Sim 移动端 UI 原型交接记录（已停用）

> 停用说明：本文只保留 UI 原型迭代历史，不再是任务入口、活动权威、前置阅读或执行计划。后续任务从 `D:/AI/AGENTS.md` 和 `docs/authority-index.md` 按需路由，不得因本文要求完整阅读、领取任务编号或按历史波次执行。

> 交接时间：2026-07-24
> 项目根目录：`D:/AI/ai-life-sim`  
> 原型根目录：`D:/AI/ai-life-sim/docs/ui-prototypes/mobile`  
> 当前 Git：`main`；活动提交以 `git log` 为准，不在交接文档固定易过期的 SHA
> 历史说明：本文保留早期竞赛记录；活动状态以紧接下来的 2026-07-24 覆盖段、`flow.html` 与产品决策为准。

## 0. 2026-07-24 当前覆盖状态

活动主流程为：欢迎 → 世界选择 → 世界配置 → 角色创建 → 命格抽取 → 命格选取 → 属性分配 → 命运预览 → 核心模拟 → 人生结算。账号与云端、设置、说明、反馈为欢迎页辅助入口，不参与主流程编号。

- 所有活动原型使用 Pro Max `430 × 932` 观察画布，并保留原定版背景、主题、配色、纹样和光效方向。
- 当前命格机制为十二个普通候选中选择三条；轮回天赋使用两个独立可选槽，不占普通命格槽。
- 属性分配是活动步骤：新人生四项基础属性共 15 点，每项 `0—10`，命格修正独立显示；旧存档值保持兼容。
- 世界预设、世界规则、角色分区、属性、命运预览、结算指标、账号页签和反馈字段使用克制的语义表情标记；欢迎、命格抽取/选取、设置、说明与核心模拟不额外堆叠。图标不进入页面标题或可访问名称。
- 人生结算沿用 A1-2D4A 结构，同步当前真实四维、人生记录、大事、轮回天赋与分享能力；底部操作区已统一为白色悬浮承托、圆形工具入口和完整主操作。
- `flow.html` 是当前移动端定版主界面、活动页面顺序、当前文件选择与截图验收入口。下方关于移除属性分配、三转世槽、十二候选或待选页面的描述均为历史记录，不再定义当前状态。

## 0A. 2026-07-15 历史覆盖状态

2026-07-20 产品语义再次覆盖本节中的属性分配结论：`PD-002` 与 `PD-012` 已删除玩家加点，四项基础值开局为零，`attribute-alloc/` 只保留 A6 历史原型；活动 `flow.html` 由神话传承直接进入命运预览。其余页面的已选视觉稿不因此失效。

本节高于下方旧竞赛顺序。用户后续已经完成欢迎、世界选择、世界配置与角色创建的连续定版，并明确要求以 `CC-RF9-1` 的纯白承托、灰蓝状态、淡墨与规则圆纹为当前共同视觉真源，直接为方案库入口 05–12 产出新一轮三选一。旧 B10 → B11–B20 的启动限制不再阻止这次用户明确授权的批量迭代。

用户随后进一步收窄入口 05–10 的授权：只能在各页现有 `final.html` 基础上做风格适配，不得修改 DOM、JavaScript、状态、操作顺序或任何原有机制，尤其不得改写命格抽取与神话传承的抽取/选取逻辑。用户已选择入口 05–10 的第 1 版，并要求通用底部返回/主操作栏保持同一视觉族；核心模拟没有导航底栏，继续保留正文末尾推进语义。随后用户把相同的 CSS-only 边界扩展到入口 11 设置和入口 12 说明，旧结构重写候选不再作为当前轮。

2026-07-16 又完成一次跨页导航收束：新增 `assets/mobile-action-bar-unified.css`，把入口 02–08、10 的白色浮动承托、圆形返回、边框、圆角、阴影、焦点环与紧凑主按钮规格统一；入口 09 继续排除固定底栏，入口 01 继续保留流程根页的透明路径布局。设置与说明只统一来源关闭控件，不强塞创建流程底栏。`flow.html` 与 `assets/prototype.js` 已改为运行用户选定的入口 05–10 第 1 版文件；各目录原 `final.html` 仍未覆盖，DOM、脚本与机制保持不变。

当前适配组与选择状态：

| 入口 | 候选页 | 候选 |
|---|---|---|
| 05 命格抽取 | `talent-draw/round-refactor-17.html` | `TD-RF17-1` 已选择；2 / 3 保留 |
| 06 神话传承 | `mythic-inheritance/round-refactor-01.html` | `MI-RF1-1` 已选择；2 / 3 保留 |
| 历史 属性分配 | `attribute-alloc/round-refactor-01.html` | 已移除；仅保留历史候选 |
| 07 命运预览 | `fate-preview/round-refactor-01.html` | `FP-RF1-1` 已选择；2 / 3 保留 |
| 08 核心模拟 | `game-story/round-refactor-20.html` | `GS-RF20-1` 已选择；2 / 3 保留 |
| 09 人生结算 | `game-over/round-refactor-01.html` | `GO-RF1-1` 已选择；2 / 3 保留 |
| 10 设置 | `settings/round-refactor-17.html` | `ST-RF17-1 / 2 / 3` 待选择 |
| 11 说明 | `help/round-refactor-01.html` | `HP-RF1-1 / 2 / 3` 待选择 |

入口 05–12 均不再采用结构梯度，三版依次为“1 极简白纸、2 淡墨承托、3 书页精修”，差异仅来自 CSS 视觉层；每版原 DOM、内联 JavaScript、状态和运行顺序均与同目录 `final.html` 一致。入口 05–10 的第 1 版已由用户选择，入口 11–12 仍待选择。所有既有 `final.html`、`flow.html` 与共享 CSS/JS 保持不变；未经进一步明确指令，不覆盖任何 `final.html`。

## 1. 历史文件的使用方式

只有用户明确要求追溯这轮 UI 原型竞赛时，才读取本文的对应章节。本文不要求新任务完整阅读任何蓝图或任务书，也不分配任务编号；当前界面目标、机制和实时源以 [界面体系权威](../../authority/interface-tree.md) 及用户本次要求为准。

## 2. 用户当前目标

用户希望：

- 以欢迎页最终定稿 `S2-A2a-17C` 为排版语言基准，但不复制欢迎页专属曲线。
- 当前先确定“文字即界面”的版式：宋体主叙事、章回、书页、边注、页码、路径、脚注和阅读留白；颜色与主题之后再设计。
- 不接受把旧布局原样保留后只换暖白、冷蓝、深色或材质的做法。
- 现有布局是起点而不是禁区。候选可以调整内容顺序、分区、导航和操作收束，但必须保留字段、机制、状态含义和完整流程。
- 上述结构竞争原则属于较早阶段；对入口 05–12，最新明确指令覆盖它：本轮必须原布局、原机制运行，只允许风格层适配。
- 使用多个独立 Codex 线程优胜劣汰，不再调用 Pi。
- 第一阶段 B01–B04 四个线程已经分别建立跨页面方向，并完成世界选择、命格抽取、核心模拟和设置。
- B05 必须按具体界面分组，把同一界面的 B01–B04 四版同时展示；用户逐页选择，不再先选择一个全局母版。
- 四个代表页面决定后，B10 从逐页结果提炼共用语法和页面差异；第二阶段才由 B11–B20 对界面 02–11 分别做 A/B/C 三选一。
- 保留完整历史迭代记录；未经用户明确选择，不得把临时推荐写成胜者或覆盖任何 `final.html`。

## 3. 绝对不能擅自改变的机制

### 3.1 命格抽取

- 当前文件：[talent-draw/final.html](talent-draw/final.html)
- 采用 P1 云紫宽环与十二命印的原抽取机制。
- 不得把抽取过程简化成普通卡片选择。
- 不得把旧版命格选取机制重新塞回抽取页面。

### 3.2 命格选取 / 神话传承

- 当前文件：[mythic-inheritance/final.html](mythic-inheritance/final.html)
- 神话传承界面用于替代原先独立的命格选取界面。
- 命格抽取机制与神话传承式命格选取机制是两个不同阶段，不能合并或互相改写。
- 当前必须保留第十一轮的三套候选：
  - U1：单环远波
  - U2：主波余响
  - U3：极缓薄纹
- 当前 `final.html` 的 Git blob hash 为：
  - `50cd099a9713300546996018bbda874a51fb73e9`
- 当前文件 SHA-256 为：
  - `A537C4324C9019CCF1B7FE4BD2AEB090EEDD6A20086007F95111CDB4E4B7660D`
- 未经用户明确选择，不得淘汰 U1、U2 或 U3，也不得用第十二轮覆盖当前 `final.html`。

### 3.3 当前最终稿保护规则

- 未经用户明确说“选定”“晋级”“替换最终稿”，不得覆盖任何 `final.html`。
- 新一轮设计应按任务书新增独立目录或 `round-NN-名称.html`。并行线程不得同时修改目录入口，统一由 B05/B21 集成任务加入链接。
- 用户选择后，才允许将胜出方案整合进 `final.html`。
- 淘汰方案仍必须保留在历史目录中。

## 4. 当前文件结构

### 4.1 顶层入口

- [index.html](index.html)：移动端 UI 总览大页面。
- [flow.html](flow.html)：当前适配版完整串联测试。
- [BOOK-STYLE-CODEX-THREAD-PLAN.md](BOOK-STYLE-CODEX-THREAD-PLAN.md)：已停用的多线程排版竞赛历史任务书。
- [assets/library.css](assets/library.css)：当前暖白适配版与串联测试共享样式。
- [assets/library-history.css](assets/library-history.css)：历史轮次原版蓝灰样式，并包含跨文档无缝过场。
- [assets/prototype.js](assets/prototype.js)：当前流程路由、跨页面过场和测试台通信。

### 4.2 各界面入口

| 界面 | 当前稿 | 历史目录 | 历史入口数 |
|---|---|---|---:|
| 欢迎界面 | `welcome/final-s2a2-17c.html` | `welcome/index.html` | 19 |
| 世界选择 | `world-select/final.html` | `world-select/index.html` | 9 |
| 世界配置 | `world-customize/final.html` | `world-customize/index.html` | 8 |
| 角色创建 | `character-create/final.html` | `character-create/index.html` | 8 |
| 命格抽取与旧选取 | `talent-draw/final.html` | `talent-draw/index.html` | 25 |
| 命格选取 / 神话传承 | `mythic-inheritance/final.html` | `mythic-inheritance/index.html` | 17 |
| 属性分配（历史） | `attribute-alloc/final.html` | `attribute-alloc/index.html` | 11 |
| 命运预览 | `fate-preview/final.html` | `fate-preview/index.html` | 12 |
| 核心模拟 | `game-story/final.html` | `game-story/index.html` | 26 |
| 人生结算 | `game-over/final.html` | `game-over/index.html` | 20 |
| 设置 | `settings/final.html` | `settings/index.html` | 8 |
| 说明 | `help/final.html` | `help/index.html` | 3 |

当前原型树共有 181 个可运行 HTML 页面。

## 5. 历史恢复来源

全部历史界面来自唯一的悬空快照提交：

```text
46dea5764e30b6951b61bd9ec1d88c8645ba64b8
chore: seed mobile UI prototypes for Pi
```

该提交的父提交是当前主线 HEAD：

```text
5cb1f4db6bc36aa3575b5608a1862eb7c5e5d8f3
```

已完成：

- 快照中的 145 个历史 HTML 均已恢复到原始路径。
- 当前新增的适配版页面与 `flow.html` 继续保留。
- 所有历史轮次页面使用 `library-history.css`，不会被当前暖白样式重新绘制。
- 所有目录 `index.html` 使用当前 `library.css`，便于统一浏览。

尚未恢复：

- 快照中的 154 张 `_review` / `screenshots` PNG。
- 这些图片是静态评审证据，不影响历史 HTML 的运行。
- 如果用户明确要求恢复截图档案，再从上述快照提交恢复；不要因此改动 HTML 或当前最终稿。

## 6. 当前已经验证通过的内容

- 145 个快照历史 HTML：全部存在。
- 当前 HTML 总数：181。
- 所有本地 `href` / `src`：无缺失。
- 所有内联 JavaScript：无语法错误。
- 总览 12 个卡片：全部进入对应历史目录。
- 当前适配版板块：可进入 `flow.html`。
- `flow.html` 上一界面、下一界面和嵌套预览：正常。
- 命格抽取历史：22 个入口。
- 神话传承历史：14 个入口。
- 当前神话传承与历史第十一轮：均有 U1、U2、U3 三个候选。
- 375px、390px、768px：总览、历史目录和抽查轮次均无横向溢出。
- Edge / Playwright 控制台：无错误、无警告。
- `npm run check:ui`：通过。
- `npm run gate-check:quick`：通过。
- 2026-07-15 入口 05–12 原机制视觉适配：24 个 `*-style-[1-3].html` 删除标记的两条 CSS 引用后，均与同目录 `final.html` 字节完全一致；全部内联脚本 SHA-256 序列也一致。第 1 版对 05、06、07、08、10 只统一白色承托底栏、主次按钮高度与圆角；09 无导航底栏，不纳入固定栏契约。三选一总览固定为 1440 三列、768 两列、375/390 单列的响应式契约。
- 本轮通过 `127.0.0.1` 只读静态服务使用内置 Browser 完成真实渲染：1440 三列、768 为 2+1、390/375 单列且无横向溢出；隔离新标签复查神话传承、设置、说明均无控制台错误。已实测命格抽取完整 12 枚周期、神话传承选择 1 枚即启用确认的原行为、设置页签/开关/恢复默认和说明模式/章节同步。截图保存在工作区外 `D:/AI/.qa-output/`。
- 已否决的 Pi 3 选 1 增量：30 个候选此前在 375px、390px、768px 下均无横向溢出；去掉评审返回按钮后，候选 DOM 与各自 `final.html` 完全一致；每页 3 个截图哈希均不同。该验证只证明文件可运行，不代表设计方向获得认可。
- 代表性交互已验证：世界选中、世界配置模式、角色标签、命格抽取、U1/U2/U3 选择、属性加点、种子随机、故事分支、结算维度、设置选项卡。
- 10 个目录入口已把 Pi A/B/C 统一标记为“用户否决：仅换色/主题，不进入下一轮”。
- 10 个 `*-pi-selection.json` 已设置 `status: "rejected_by_user"`，原评分和原推荐只作为历史记录保留。
- 新的书本式排版候选尚未开始实现。

最近验证截图位于工作区外：

```text
D:/AI/.qa-output/mobile-history-overview-desktop.png
D:/AI/.qa-output/mobile-history-talent-index.png
D:/AI/.qa-output/mobile-history-mythic-index.png
D:/AI/.qa-output/mobile-history-overview-390.png
```

## 7. 历史执行顺序（已停用）

下列波次只记录当时的竞赛安排，后续任务不再按此启动或排队：

```text
并行波次 1：B01 章节书页 + B02 对开书册 + B03 批注手稿 + B04 章回长卷
当前评审：B05 按界面同屏四选一 → 用户逐页选择或指定页面内融合
串行规范：B10 汇总逐页胜者的共用语法与差异
并行波次 2：B11–B20，分别负责界面 02–11 的 A/B/C 三选一
串行集成：B21 → 用户逐页选择
```

当时第一阶段 B01–B04 已完成；相关候选和后续安排仅作为历史结果保留。实际文件是否修改由当前用户要求决定。

## 8. 历史验证清单（按需参考）

### 静态检查

- 检查所有新文件链接存在。
- 检查内联 JavaScript 语法。
- 确认历史页面使用 `library-history.css`。
- 确认当前 `final.html` 使用 `library.css` 和 `prototype.js`（按页面需要）。
- 确认没有误删任何旧轮次。

### 浏览器检查

使用 Browser 插件优先；插件不可用时使用 Playwright + Edge。

最少验证：

```text
index.html
→ 目标界面历史 index.html
→ 新轮次页面
→ 返回历史目录
→ 返回总览
```

同时检查：

- 页面标题与内容不为空；
- 控制台无错误、无相关警告；
- 375px、390px、768px 无横向溢出；
- 主要交互有效；
- 页面切换没有 `Transition was skipped`；
- 当前串联测试没有被历史恢复破坏。

### 项目命令

在 `D:/AI/ai-life-sim` 执行：

```powershell
npm run check:ui
npm run gate-check:quick
git diff --check
```

如果只新增交接文档而未修改界面，不必重复运行 UI 浏览器验收；实际界面变化必须运行。

## 9. 历史工作区说明

- 当前工作区很脏，保留所有无关修改。
- 不得运行 `git reset --hard`、`git checkout --` 或批量清理未跟踪文件。
- 不得删除 `docs/ui-prototypes/mobile/` 中的历史页面。
- 不得提交或暂存，除非用户明确要求。
- 不得把 `.qa-output` 截图写回项目目录。
- 不得把当前历史目录再次“只保留 final”。用户已经明确要求保留全部迭代记录。

## 10. 历史启动提示（已停用）

以下文本只用于还原当时任务，不得用于启动当前任务：

```text
请先完整阅读：
D:/AI/AGENTS.md
D:/AI/.agents/skills/ai-life-sim/SKILL.md
D:/AI/ai-life-sim/docs/authority-index.md
D:/AI/.agents/skills/ai-life-sim-ui/SKILL.md
D:/AI/ai-life-sim/docs/ui-prototypes/mobile/NEXT-THREAD-HANDOFF.md
D:/AI/ai-life-sim/docs/ui-prototypes/mobile/BOOK-STYLE-CODEX-THREAD-PLAN.md

然后执行任务 B01（把 B01 替换为本线程编号）。不要调用 Pi，不要清理历史文件，不要覆盖任何 final.html，不要修改其他线程拥有的目录。主题和颜色不是本轮重点；先用中性色证明排版、阅读层级和书本式沉浸感。布局可以竞争和重排，但必须保留页面全部字段、机制、状态含义和流程。完成后按任务书提交浏览器证据、门禁结果和实际文件清单。
```
