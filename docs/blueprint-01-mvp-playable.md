# 蓝图一 · MVP 最小可玩版本（交付 AI 执行）

文档角色：selected-target
权威层级：A2
状态：active
适用范围：MVP 可玩路径、恢复范围和验收链路
拥有者：产品决策与 `mod-engine` MVP runtime policy
最后验证：2026-07-20；对照当前 Skills、MVP runtime policy、零基础值创建链、蓝图二 P0/P1 与系统职责索引
取代关系：none
运行真源：`src/mods/mod-engine/helpers/mvp-stages-config.default.json` 与实际玩家路径
验收证据：结构、MOD、UI、lint、TypeScript、交付 gate 与玩家路径

版本：v1.6；创建：2026-07-04。本文档约束 MVP 范围，但不替代 `.agents/` 技能体系。

---

## 〇、一句话目标

**让项目回到"最初能正常游玩的版本"**：选择服务器预设模型或填写自己的 API → 新游戏 → 选世界 → 手动配置世界 → 设定角色 → AI 抽取并选择命格 → 以四项零基础值核对命运 → 进入核心模拟界面默认按"年"推进剧情（玩家可切换为日 / 月 / 季 / 年不同叙事步长）、AI 生成叙事、带记忆压缩防止 token 爆炸、能存档和自动存档。最终验收必须**全程零红错、零崩溃、零未分流 gate FAIL**。

[蓝图二](blueprint-02-multi-world-simulation-foundation.md)已经完成 P0 多世界基础与 P1 历史事件账本；NPC、旧地图、地理资源、成长、生命周期、经济、社会文明、生态和世界观插件继续延后，等待用户按 P2—P8 逐阶段确认。延后系统优先从 MVP 执行路径隔离；只有为了暴露遗漏依赖时才允许临时抛错桩，且最终验收前不能让抛错桩在正常玩法路径产生红色控制台错误。

---

## 〇.1 执行权威优先级

本蓝图只定义 MVP 范围和执行目标；遇到不清楚或与技能文件冲突时，按以下优先级执行：

1. `docs/product-decisions.md`：当前产品语义的唯一真源，生效 `PD-xxx` 优先于旧计划和本文档。
2. `../../AGENTS.md` 与 `.agents/skills/ai-life-sim/SKILL.md`：项目边界、总体架构、运行权威和精确命令。
3. 对应域 Skill：MOD / 子系统使用 `ai-life-sim-mod-development`，Prompt / Token 使用 `ai-life-sim-prompt-engineering`，UI 使用 `ai-life-sim-ui`。
4. 本蓝图：只作为 MVP 范围、页面链路、延后清单和验收标准。
5. 实际代码与运行配置：用调用链和 `mvp-stages-config.default.json` 核实当前状态，文件存在不代表系统正在运行。

若当前 Skill、旧计划与实际代码冲突，先按产品决策和运行配置判定；仍有多种合理解释时列出证据与影响后再确认。

---

## 一、必读前置（动手前先读，不在本文件重复）

| 主题 | 权威源 | 要点 |
|------|--------|------|
| 项目边界与命令 | `../../AGENTS.md` | 修改权限、工作区、结构检查与交付关闸 |
| 项目架构 / 为什么叙事是根 | `.agents/skills/ai-life-sim/SKILL.md` + `docs/system-authority-index.md` | foundation→core→mods→app；mod-engine 是叙事根 |
| 子系统写法（BaseSubsystem） | `.agents/skills/ai-life-sim-mod-development/SKILL.md` + `src/core/subsystem-base.ts` | 新建或恢复子系统遵循 live BaseSubsystem；时间只读 canonical RoundContext |
| 子系统模板 / 清空桩模板 | `.agents/skills/ai-life-sim-mod-development/assets/templates/subsystem.template.ts` | 恢复子系统使用当前模板；延后系统优先从执行路径隔离 |
| 分段恢复优先级 | 本蓝图 + `docs/blueprint-02-multi-world-simulation-foundation.md` | 当前 MVP 边界与 P0—P8 恢复顺序；冲突时以活动产品决策为准 |
| 架构边界 | `docs/simulation-rewrite-architecture.md` | BaseSubsystem、时间、字段契约、原子提交与跨域数据规则 |
| MOD 清单 / 依赖 | live manifests + `src/foundation/types/mod.types.ts` + MVP runtime policy | 当前依赖、公开边界与运行成员 |
| 关闸命令 | `../../AGENTS.md` §5 | 使用 structural、MOD、lint、tsc 和相应 gate |

**改变 `src/core/` 或 `src/foundation/` 的公开契约、持久化、运行态结构或跨模块语义时，按 `../../AGENTS.md` 权限边界处理。**

**迁移口径**：本蓝图不要求一次性机械迁移所有 74 个旧子系统；凡本轮实际触碰、清空、恢复的子系统，必须按当前技能模板迁到 `extends BaseSubsystem`。未触碰的保留系统不得"顺手"大迁移，除非链路检索证明它阻断 MVP。

---

## 二、当前代码基线现状（执行者必须知道）

### 2.1 已完成（不要重做）
- **时间引擎数据契约已改造**：`RoundContext`（`src/foundation/types/subsystem.types.ts`）已删除旧的 `ageYearsDelta`/`calendarDaysDelta`/`simulationTicks`，改为必填 `daysPassed`/`totalDays`（唯一整数时间源，由 `TimeSystem` 产出）。
- **`TimeSystem`**（`src/mods/mod-engine/subsystems/time-system.ts`）已有 `totalDays`、整数天推进、真实公历分布、`getDaysPassed()`。
- **`BaseSubsystem`** 已建成（`src/core/subsystem-base.ts`，implements ISubSystemV2）；**`foundation/subsystem-contracts/`** 已登记运行中的角色、世界实体、P0 世界上下文和 P1 历史事件跨域契约。
- **19 个时间耦合的模拟子系统已清空为「抛错桩」**（economy/politics/culture/environment-ecology/power-system/tech-level 的一部分）——见 §五延后清单。注意：这些桩只能作为迁移期信号；若它们进入 MVP 正常玩法路径并触发 `console.error`，仍视为未达到"零红错"。

### 2.2 已知关闸基线（2026-07-05 阶段 A+B 复核）
检测器已做两类维护：一是每次运行自动清理 `reports/` 下超过 10 分钟的旧检测报告；二是 MOD 扫描已适配 `BaseSubsystem` 迁移期，并修正 PowerShell 子扫描器失败退出码传播。因此后续接手时不要再按旧报告判断，必须重新运行并读取最新报告。

当前最新基线：
1. `npm run lint`：PASS。
2. `npx tsc --noEmit`：PASS。
3. `npm run check:structural`：当时通过；历史 JSON 报告未保留，交付时必须重跑当前命令。
4. `node scripts/check/index.mjs narrative`：当时通过，并覆盖默认年步长、切换不推进、`daysPassed/totalDays` 注入、日/月/季/年换算静态契约；历史 JSON 报告未保留。
5. `npm run test:calibration`：PASS；前三个 runner 全 OK，`calibration-wiring-audit` 将 20 个延后模拟字段登记为 `defer`，未知未接线字段仍会失败。
6. `npm run gate-check`：当时 C1/C2 通过、C3 失败；历史报告未保留。当前交付不得沿用该结果，必须记录新基线并运行现行 gate。

本轮已清零或降级的旧阻断：
- `fate-prophecy` 已从活跃叙事变更链移出，并通过 codegen 同步 `subsystem-field-keys.generated.ts`。
- `orchestrator-system.ts` 对 `world-init-prompt-vars` 的跨 MOD 深导入已改为 `@/mods/mod-world` 公共导入。
- `world-calibration` 的 CSS/module 导入链已通过 `world-pool-selectors.ts` 拆分修复，calibration 域现在 PASS。
- A5 `timeBridgeSummary` / `narrativeGuidanceText` / `causalChainHint` 已由扫描器识别 `buildNarrativeUserJson(context)` 消费；真孤儿 `subsystemFields` 已从 `PromptContext`、orchestrator 赋值、re-export 和 generated 契约移除。
- A-15 ATCE 误报已收紧为只认字面 `A-15`，不再因 `orchestrator-system.ts` 文件名误判为强制重构。

阶段 A+B 已完成的新增收敛：
- `TimeSystem` 当前实现保持底层日粒度：`setTimeStep()` 只改变下一轮步长，`advance()` 用 `totalDays` 差值写入 `lastDaysPassed`；narrative 域新增冒烟覆盖该契约，旧 `simulationTicks/ageYearsDelta` 检查已移除。
- MVP 运行策略由 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 与 runtime policy 共同执行：当前外部运行子系统共 13 个，包含 P0 的世界上下文注册表、能力画像、空间图、上下文切换、模拟范围和世界初始化、P1 历史事件账本，以及角色/世界既有 6 个系统；引擎系统 12 个，总计 25 个。AI 结构化直写仍只允许 `character-base` / `lifespan` / `luck` / `morality`，历史事件由本地 `event-input` 提交。
- `registerAllSubsystems()`、orchestrator 本地推进/状态收集、Prompt 状态卡、跨域联动、RoundCommit 提交总线均接入 MVP allowlist。延后模拟系统保持 manifest/文件存在，但不进入正常叙事回合，不再因清空桩在玩法路径持续 `console.error`。
- `narrative-prompt.ts` 的 `allowedSubSystems`、`SUBSYSTEM_GUIDE` 和示例已改成 MVP 写入口径，普通剧情优先返回 `changes: []`，避免 AI 被示例诱导写 health/economy/skill 等延后系统。

Full gate 剩余 FAIL 分流表：

| 分类 | 当前信号 | 处理口径 |
|------|----------|----------|
| 真实阻断 | `ui` 域 34 项：`GameStory.module.css` 30 个废弃 CSS 变量，`GameStory` / `FatePreview` / `TalentDraw` 4 个未知变量 | 阶段 B/E 处理；这些页面在 MVP 路径内，不能留到最终验收 |
| 真实阻断 | `mod-engine` 核心叙事/压缩/记忆子系统、`time-system`、`mod-character` 保留三件套、`world-entity` 上的 `C3/C5` 生命周期与 summary 格式 FAIL | 阶段 E 前针对性处理；先核实扫描器是否误读模板字符串，再改真实不合规处 |
| 检测器误报/需修检测器 | `D30-DEP-EXISTS` 把 `provides:[engine`、`]`、`orchestrator` 等 manifest 片段当 dependency；`C9-CROSS-PATH` 报 generated `all-stores.generated.ts` 的 store import；`D31-UNIMPORTED-MOD` 与 codegen/自动发现模式疑似脱节 | 先修扫描器解析/allowlist，不让核心为了误报变形 |
| 迁移期应降级 | 延后模拟系统的大量 `C3-APPLY-*` / `C4-DEEPCOPY` / `C5-SUMMARY-FMT`（economy/culture/politics/environment/power/base-universe 等）与 `calibration` 20 个延后字段 | 阶段 B 已完成运行时隔离；后续只需让 mod scanner 识别 MVP/defer 口径，未进入 MVP 路径的延后系统不逐行硬修 |
| MVP 后处理 | `G1/G2/G5/G10` 文件纯度、`D7-SUBSINDEX`、`D9-PROVIDE`、`D24-SEGMENT-REVERSE`、`A10-UNWIRED-EXPORT` 等架构健康债 | 不阻断阶段 0；后续按 owner/阶段逐项收敛，不能笼统无视 |

**执行策略**：阶段 0/A/B 的 structural / calibration / narrative / lint / tsc 已打通；full gate 剩余项已分流。下一步进入阶段 C「世界配置去 AI」，同时保留一个验证债：mod scanner 需要识别 MVP/defer 口径，UI token 与核心引擎格式问题在对应阶段修复。**C1 lint（0）+ C2 tsc（0）必须始终保持。**

### 2.3 代码事实核实规则

本节状态只作为执行起点，不能替代链路检索。执行每个阶段前必须重新核实：

- `RoundContext.daysPassed/totalDays` 是否已经存在，旧字段是否仍有真实代码引用。
- `TimeSystem` 是否仍以"日"为唯一最小单位；默认叙事推进步长是否为"年"且玩家可切换日 / 月 / 季 / 年；`orchestrator-system` 注入 context 的 `daysPassed`/`totalDays` 是否和当前步长一致。
- 设置页保存的 `customKey` 是否真实透传到命格 AI、叙事 AI、降级链、摘要压缩等所有 MVP AI 调用点，不能只验证设置页 UI。
- `mod-pages` 的真实路由注册和页面目录是否存在。
- `.agents/` 中若有"当前状态"文字与实际代码不一致，以实际代码证据为准，并在交付总结中标明技能文件漂移。

---

## 三、MVP 玩法流程（页面链路）

```
[设置弹窗] 选择服务器预设模型或填写自己的 API
    │  （托管目标与凭据只在服务端；自定义配置由 mod-settings 保存并被 ai-service 读取）
    ▼
启动页 welcome → 点「开始新游戏」
    │  （mod-pages/pages/welcome → new-game）
    ▼
世界选择 world-select（预设列表 / 自定义入口）
    │  （mod-pages/pages/world-select + mod-world 预设）
    ▼
世界配置 world-customize / world-build  ★去掉 AI 调用★
    │  只保留手动选择四字段 + 自定义按钮：力量体系 · 世界观本质 · 力量上限 · 空间形态
    │  （文明阶段字段：注释掉，最后做）
    ▼
角色设定 character-create
    │  姓名 · 性别 · 种族 · 背景信息 · 寿命
    │  （mod-character character-base + lifespan 保留）
    ▼
命格抽取 talent-draw  ★保留 AI 调用★
    │  调用 AI 抽命格 → 选择命格 / 天赋 / 词条
    │  （mod-character/subsystems/destiny-pattern-system.ts 全保留）
    ▼
身世预览 fate-preview
    │  四项基础值强制为 0；种族、命格和其他随机来源作为 modifiers 展示
    │  汇总展示，无额外 AI
    ▼
核心模拟 game-story
    │  底层按「天」推进 · 默认叙事步长「年」 · 玩家可切换日/月/季/年 · AI 生成叙事 · 记忆压缩防 token 爆炸 · 存档 + 自动存档
    ▼
结算 game-over（人生评分与真实四维 → 人生三记与结构化大事 → 转世天赋三选一封存 → 本机生成分享卡 → 开启新人生）
```

对应页面目录（均在 `src/mods/mod-pages/pages/`，大部分已存在；当前核心模拟真实路由为 `/game-story`）：
`welcome` `new-game` `world-select` `world-customize` `world-build` `character-create` `talent-draw` `fate-preview` `game-story` `game-over` `save-manager`。旧 `/attribute-alloc` 只保留兼容跳转，不是活动页面节点。

---

## 四、系统总分段

### 4.1 MVP 段 —— 先做（本蓝图范围）

| 层 | 具体文件 / 系统 | 状态 | MVP 要做的事 |
|----|----------------|------|-------------|
| foundation | 全部 + `subsystem-contracts/` | P0/P1 已扩展 | 保持跨域纯类型；世界上下文与历史事件分别以 `world-context.contract.ts`、`historical-event.contract.ts` 为真源 |
| core | `core/subsystem-base.ts` | 已完成 | 不动 |
| core | `core/ai-service/`（`ai-client`/`ai-call-wrapper`/`provider-config`/`prompt-builder`/`parse-ai-json`/`stream-handler`） | 已有 | 确保读 mod-settings 的 endpoint+key；`customKey` 必须透传到命格、叙事主调用、降级链和摘要压缩 |
| core | `core/storage/`（`save-manager`/`persist-layer`/`local-storage`/`opfs-storage`/`game-reset`） | 已有 | 确保存档 + 读档 + 自动存档可用 |
| mod-settings | 全部 | 保留不动 | API endpoint + KEY 输入与持久化（UI 在 `SettingsModal` → `SettingsTabModel`/`SettingsTabPresets`；`ai-service` 侧读取见 `core/ai-service/provider-config.ts`，DeepSeek 默认 `baseUrl: https://api.deepseek.com/v1`） |
| mod-engine | 当前 12 个引擎系统 | P0/P1 已适配 | 核心叙事循环、记忆压缩、当前上下文过滤、历史事实投影和跨系统原子快照，见 §六 |
| mod-world | P0 六个外部运行系统、`world-entity`、世界选择与手动配置 | P0 已完成 | 每次创建一个世界上下文；保持本地手动配置，不恢复旧地图或 world-init AI 调用链 |
| mod-history-dynamics | `historical-event-ledger` | P1 已完成 | 作为唯一历史事实账本运行；旧 `event-pool` 与 `causal-simulation` 已降为无独立 ID/Store 的内部组件 |
| mod-character | `destiny-pattern`、`character-base`、`lifespan`、`luck`、`morality` | 保留并完成 P0 身份适配 | 主角 ID 全局稳定；当地属性修正按 `contextId/sourceId` 分区 |
| mod-ui | 全部 | 保留不动 | 组件库 |
| mod-pages | 上述页面 | 可改页面逻辑，不做 UI 大重构 | 为 MVP 串通页面链路；`world-customize`/`world-build` 可调整为手动写入，避免 world-init AI 调用 |

### 4.2 P2—P8 模拟系统段 —— 继续延后（执行路径隔离优先，用户逐阶段确认后再加）

**做法**：MVP 正常玩法路径优先隔离延后子系统：不注入 Prompt、不允许 AI 写 changes、不参与核心循环关键验证；若必须保留文件结构，本轮触碰的延后子系统按当前技能迁到 `extends BaseSubsystem`，保留类名/id/mod/label/description 和清空说明。`collectState`/`applyChanges` 抛错桩只能作为调试期信号；最终 MVP 验收前，正常推进路径不得持续打印这些错误，否则不满足"全程零红错"。

延后的模拟子系统（"六大类"及其余）见 §五。

---

## 五、延后清单（模拟系统，隔离优先）

> 原则：**只要不在 §四.1 MVP 段里，就延后**。以下按 MOD 归类。已是抛错桩的文件仍需确认是否进入正常玩法路径；若进入并产生红色日志，需改为隔离或无噪声清空状态。

| MOD | 子系统 | 现状 |
|-----|--------|------|
| mod-economy | economy / population / item / settlement / work | 状态：已完成； 已抛错桩 |
| mod-politics | conflict-cycle / faction-dynamics / legal / social-stratification / social-values | 状态：已完成； 已抛错桩 |
| mod-politics | nation-relation / language-naming | ⬜ 需清空 |
| mod-culture | disciple / education / family / personal-ability / works | 状态：已完成； 已抛错桩 |
| mod-culture | culture / art / reputation / relationship / achievement | ⬜ 需清空 |
| mod-environment-ecology | climate / ecology | 状态：已完成； 已抛错桩 |
| mod-environment-ecology | geography / natural-resource / pollution | ⬜ 需清空 |
| mod-tech-level | culture-tech | 状态：已完成； 已抛错桩 |
| mod-tech-level | industry | ⬜ 需清空 |
| mod-power-system | monster | 状态：已完成； 已抛错桩 |
| mod-power-system | combat-power / cultivation / fortune-encounter / faith / supreme-item / divine-intervention / anomaly-phenomena / special-material / skill | ⬜ P8/P4 延后；`luck` 已由 mod-character 运行系统独占 |
| mod-character | health / life-stage / attribute-decay / post-death-epilogue | ⬜ P5 延后；`morality` 已进入当前 MVP |
| mod-npc | npc-attribute / npc-behavior / npc-memory | ⬜ 需清空 |
| mod-history-dynamics | 旧 event-pool / causal-simulation | P1 已淘汰独立系统；候选与因果图能力已并入历史事件账本内部组件 |
| mod-base-universe | celestial / era / world-map / fate-prophecy / divine-creation | ⬜ 需清空（世界配置改手动后，纪元/天象等 sim 部分延后） |
| mod-world | P0 世界上下文、空间、切换、范围、初始化和 `world-entity` | 已进入运行；P3 之前不恢复旧 `world-map` 或地图 UI |
| mod-world-map | 世界地图渲染 | ⬜ 延后 |
| mod-golden-finger | 已按 `PD-027` 删除 | 不再加载、恢复或进入插件段 |
| mod-difficulty | store/constants/UI 难度选择 | 状态：已完成； 保留配置输入；仅延后难度驱动的模拟扩展 |

> 风险提示： MOD 级依赖不受影响：`mod-character` 的 manifest 依赖 `mod-power-system`，但那是**加载顺序**依赖，不是子系统数据依赖——power-system 的子系统全是抛错桩不影响 character 的 destiny/base/lifespan 运行。

---

## 六、引擎核心：时间 + 叙事 + 压缩 + 存档

### 6.1 时间：底层日粒度 + 可切换叙事步长
- **底层最小单位永远是"天"**：`TimeSystem` 只产出整数 `daysPassed`（本轮增量）和 `totalDays`（累计总天数），子系统统一读 `this.getDaysPassed(context)`，禁止恢复 `ageYearsDelta` / `simulationTicks` / 年累加器。
- **开局默认叙事推进步长是"年"**：`DEFAULT_ENGINE_CONFIG.timeStep`（`src/mods/mod-engine/constants.ts:79`）已是 `{ unit: 'year', value: 1 }`；`TimeSystem` 的底层单位仍然是"天"，`reset()` 只把叙事 `timeStep` 恢复到这个 UI / store 默认值。
- **玩家必须可切换推进步长**：一次叙事轮次 = 玩家点击一次推进；本轮推进多少天由当前 `timeStep` 决定。日 = 1 天；月 = 按当前月份真实天数推进；季 = 连续 3 个真实月份天数之和；年 = 365 天。当前 MVP 固定 365 天、2 月 28 天，不做闰年。
- **切换步长本身不推进时间**：玩家从年切到月 / 季 / 日时，只改变下一次叙事轮次的换算口径，不能修改当前 `round`、`daysPassed` 或 `totalDays`；只有真正执行推进动作时才累加天数。
- **AI 叙事必须感知本轮跨度**：orchestrator 组装 Prompt 时应使用当前 `timeStep` 和 `daysPassed` 生成时间语境，避免把月/季/日推进误写成年推进。
- 需要年/月/季判断的子系统基于 `context.totalDays` 和统一日历常量换算（见 `simulation-rewrite-architecture.md` §八），不要在子系统内各自硬编码 `/30` 或年循环。

### 6.2 叙事循环（保留，是根）
- `orchestrator-system.ts`：每回合按当前上下文能力和模拟范围筛选系统 → 收集状态 → 组装 Prompt → AI 生成叙事 + 结构化变更 → 原子分发。当前 25 个运行系统都可提供合法状态；`historical-event-ledger` 以只读事实投影和本地 `event-input` 参与，主叙事结构化直写仍只有 character-base/lifespan/luck/morality；P2—P8 延后系统不得污染 Prompt 或正常回合日志。
- `narrative-parser-system.ts`：解析 AI 响应。
- AI 调用走 `core/ai-service/`，端点+KEY 来自 mod-settings。**禁止硬编码 maxTokens（B-23），禁止 slice 截断叙事（B-24）**。

### 6.3 数据压缩（防 token 爆炸，MVP 必须可用）
- `summary-compressor-system.ts`：层级摘要压缩。
- `memory-engine-system.ts` + `memory-lifecycle-system.ts` + `memory-forgetting-system.ts` + `core-memory-system.ts`：记忆分层与遗忘。
- **验收点**：连续推进多年（如快进 50 年）后，注入 AI 的上下文 token 不随游戏时长线性爆炸——靠层级压缩把旧叙事收敛为摘要。L1 每 5 轮一块，在第 5、10 轮等完整块结束后立即生成；常驻 Prompt 只保留最近 5 轮完整原文，不能漏掉已经成功压缩的中间轮次，也不得因摘要失败而自适应扩大窗口；原始叙事、摘要账本和检索索引不设置容量淘汰上限，目标块始终按真实回合 ID 选取，失败块继续重试。低重要度旧日常可从常驻 Prompt 动态卸载，但必须仍由完整账本、原文或可追踪摘要覆盖。压缩不得损伤关键因果（AI-07/AI-08：存完整叙事，摘要独立生成，禁止用字符、条目、数组位置或容量上限破坏原文与语义事实）。
- **结构验收点**：每个真实叙事响应都必须通过 `NarrativeResponseSchema`，携带 `digest` 与带 `importance/entities` 的 `keyEvents`；L1 Prompt 必须接收这些结构化压缩线索并优先保留高权重事件。L2—L6 生成后写入检索索引，L1 清理原始事件时不丢失远期实体召回。

### 6.4 剧情质量硬截断红线（PD-015）
- 任何叙事正文、摘要、事件、记忆、关系、伏笔、因果标记、原创设定和用户叙事输入都不得按字符、条目、数组位置或容量上限静默丢弃。
- 长局容量只通过分层语义摘要、叶子摘要注入、可追踪检索与 OPFS 存档解决；原始叙事完整保存。近期窗口是非破坏性 Prompt 选择，窗口之外必须由摘要/检索覆盖。
- 世界描述、维度自定义文本和角色背景不设会砍掉输入的 `maxLength`；界面只显示实际字数，不改变定版布局。
- AI 结构化变更若含非法项则整包拒绝状态变更，禁止“只提交前 N 条”或“删掉坏项后提交剩余项”。
- 主叙事及其他剧情规则 AI 的 Prompt、Zod/JSON Schema 不得对语义文本或事实数组设置字符/条数上限；外围 MOD 的天象、纪元、地理、外交、NPC、文化、艺术与地图历史同样不得固定容量淘汰。

### 6.5 存档 + 自动存档
- `core/storage/save-manager.ts`（`saveManager`）+ `persist-layer` + `local-storage`/`opfs-storage`。
- 自动存档接线点：`src/mods/mod-engine/helpers/save-restore.ts` + `src/mods/mod-engine/subsystems/orchestrator-system.ts`（回合结束后触发）+ `src/mods/mod-ui/components/organisms/GameBottomBar.tsx`（手动存档按钮）。
- **验收点**：推进若干回合 → 自动存档 → 刷新页面 → 从 `save-manager` 读档 → 世界/角色/时间/叙事历史正确恢复。

---

## 七、世界配置与 P0 上下文创建（屏 3 展开）

MVP 继续要求世界配置由玩家手动确认；P0 只恢复本地结构化世界初始化，不恢复 world-init AI 生成管线：
1. `world-select`：预设世界列表 + "自定义"入口，纯本地数据，无 AI。
2. `world-customize`/`world-build`：手动选择/输入四字段（力量体系 · 世界观本质 · 力量上限 · 空间形态）+ 自定义按钮，**不触发任何 world-init AI 调用**。
3. world-init AI 管线继续从 MVP 执行路径隔离；`WorldInitSystem` 当前作为本地创建工厂，每次创建或受控重初始化一个带稳定 `contextId`、能力画像、空间根和当地时间的上下文实例。
4. 这一步不会自动消除 §2.2 的 calibration 语法错误 FAIL；该 FAIL 属于 gate 检查脚本/导入链问题，需在阶段 0 的 full gate 分流中单独处理。
5. `world-entity-system` 已按 `contextId` 分区并使用全局实体 ID；旧地图、NPC、经济、政治和世界观插件仍不进入创建流程。

> 命格抽取（talent-draw）**保留 AI**——这是 MVP 里除叙事外唯一的另一处 AI 调用。

---

## 八、执行顺序（GPT 5.5 分阶段推进，每阶段跑关闸）

> 编码前先跑 `npm run check:structural` 并读取最新报告；每完成一个阶段：`npm run lint`（0）+ `npx tsc --noEmit`（0），阶段末按 L3 跑 `npm run gate-check`。阶段 0 必须先让 structural 变绿；full gate 剩余 FAIL 必须建分流表，不能无视。

- **阶段 0｜关闸基线打通（换电脑后第一步）**：
  1. 运行 `npm run check:structural`，确认最新报告仍只剩 structural 两项硬阻断。
  2. 修 `fate-prophecy` schema/generated keys 不一致：MVP 口径是 `fate-prophecy` 延后，因此优先从活跃叙事变更链移出（`SUBSYSTEM_CHANGE_SCHEMAS`、Prompt 允许列表、prompt gate 等需链路检索后同步）；若选择保留字段，必须说明为什么它仍属于 MVP，并补齐单一来源，禁止只为 generated 变绿而手改产物。
  3. 修 `orchestrator-system.ts` deep import：`@/mods/mod-world/utils/world-init-prompt-vars` 必须改为 `@/mods/mod-world` 公共导出、secondary public entry、事件或 store selector 之一；先做链路检索，再选最小且符合 MOD 边界的方案。
  4. `npm run check:structural` 必须 PASS 后，才进入阶段 A/B。
  5. 随后运行一次 `npm run gate-check`，把剩余 C3 FAIL 建立基线分流表：真实阻断 / 检测器误报 / 迁移期应降级 / MVP 后处理。分流表必须至少覆盖 calibration CSS module 导入链、AI `apiKey` 透传、MOD scanner 迁移期误报、UI token 错误。分流表应写回本蓝图或独立 `docs/` 记录，避免下一轮重复判断。
- **阶段 A｜引擎地基对齐**：确认 `TimeSystem` 以"天"为唯一最小单位，默认叙事步长为年，且日/月/季/年切换都会换算成正确 `daysPassed`；确认 orchestrator 用 `daysPassed`/`totalDays` 正常组装 context。
- **阶段 B｜MVP 执行路径收敛**：先把 §五所有非 MVP 子系统从 Prompt、AI changes、核心循环验证路径中隔离；必须保留的清空桩不得在正常玩法路径持续 `console.error`。这一步放在核心模拟验证前，避免旧活代码或抛错桩干扰阶段 D。
- **阶段 C｜世界配置去 AI**：world-select 预设/自定义 + world-customize 手动四字段，绕过 world-init AI 管线；world/base-universe 的 sim 子系统只保留 MVP 所需纯数据入口；确认阶段 0 的 structural 基线不回归。
- **阶段 D｜角色链路**：character-create（姓名/性别/种族/背景/寿命）→ talent-draw（AI 命格）→ fate-preview（零基础值与随机修正核对）串通；旧属性分配页仅兼容跳转。隔离 mod-character 的 health/life-stage/attribute-decay/post-death-epilogue，保留 destiny/base/lifespan/luck/morality。
- **阶段 E｜核心模拟循环 + 存档**：game-story 默认按年推进，也能切换为日/月/季推进；AI 出叙事，character-base/lifespan 随 `daysPassed` 更新，记忆压缩生效；手动存档 + 自动存档 + 读档恢复。
- **阶段 F｜最终清尾与验收**：确认启动→建世界→建角色→进模拟→推进→存读档全程零红错；所有 gate FAIL 均已修复或进入有 owner/阶段/原因的分流表，不能以"迁移期"笼统忽略。

---

## 九、验收标准（MVP "能玩"的定义）

1. 设置里填 endpoint + KEY，能保存并被命格 AI、叙事 AI、摘要压缩 AI、降级链读取；不能只验证 UI 存储。
2. 启动 → 新游戏 → 选世界（预设或自定义手动配置）→ 设定角色 → AI 抽命格并选择 → 以四项零基础值核对命运 → 进核心模拟，**全程无红色报错、无崩溃、无清空桩持续刷 `console.error`**。
3. 核心模拟底层按整数天推进；默认叙事步长为「年」，玩家可切换为「日 / 月 / 季 / 年」，AI 生成叙事，角色寿命/属性随 `daysPassed` 变化。
4. 连续推进多年，token 不爆炸（压缩生效）。
5. 长局原始叙事、摘要、关系、伏笔、因果标记和用户设定不因字符数、条目数或容量上限被截断；近期窗口之外由压缩与检索覆盖。
6. 能手动存档、自动存档、读档恢复。
7. 同一存档可保存至少两个世界上下文、建立合法出口并原子切换；休眠或关闭上下文不进入完整回合，旧单世界存档自动迁移。
8. 已发生、待续和跨界历史事实按世界作用域进入账本；延期因果、伏笔、剧情与记忆只在完整提交成功后关联稳定事件 ID，存读档和失败回滚不串世界或留下半提交。
9. C1 lint = 0，C2 tsc = 0，C3 gate-check 按 L3 要求处理；若仍有 FAIL，必须逐项说明是否为本阶段遗留、是否已纳入后续阶段，不能宣称无视。

---

## 十、铁律速记（违反即返工）

- 先读后改：改任何文件前 Read 完整文件 + 贴链路检索证据（含大小写不敏感 + getter 变体搜索）。
- 需求优先：保持已完成的 P0 多世界基础与 P1 历史事件账本，只按蓝图二和用户授权恢复后续阶段，**不要顺手进入 P2—P8**；临时抛错桩不能进入最终正常玩法验收路径。
- 不懂就停：世界配置去 AI 的边界、命格 AI 的返回结构等有歧义时，列选项问用户。
- 动 core/foundation 前说明风险等确认（B-01/B-02）。
- 本轮实际触碰、清空、恢复的子系统一律 `extends BaseSubsystem`；时间只读 `this.getDaysPassed(context)`；禁止复活 `ageYearsDelta`/`simulationTicks`。
- 禁止硬编码 maxTokens；禁止以 `slice/substring/shift/splice`、固定字符数、固定条数、容量淘汰或部分提交等任何破坏性方式截断剧情语义。允许语义压缩和可解释遗忘，但原始事实与覆盖链必须可追踪。

---

配套：`docs/blueprint-02-multi-world-simulation-foundation.md`（P0—P8 多世界重写目标）、`docs/simulation-rewrite-architecture.md`（架构）、`docs/system-authority-index.md`（活动系统职责）和 `docs/acceptance-ledger.md`（当前验收）。
