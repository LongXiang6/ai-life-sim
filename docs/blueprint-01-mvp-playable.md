# 蓝图一 · MVP 最小可玩版本（交付 GPT 5.5 执行）

> 状态：待执行 | 版本：v1.4 | 创建：2026-07-04 | 校准：2026-07-04 | 接手基线：2026-07-04
> 定位：本文件是**MVP 执行蓝图**，但不替代 `.agents/` 技能体系；执行者必须先按下方「执行权威优先级」加载技能和项目规范，再用本蓝图约束 MVP 范围。
> 目标读者：一个没有本项目历史对话上下文的 AI 执行者。

---

## 〇、一句话目标

**让项目回到"最初能正常游玩的版本"**：在设置里填 API 端口和 KEY → 新游戏 → 选世界 → 手动配置世界 → AI 抽命格 → 设定角色 → 配属性 → 看身世 → 进入核心模拟界面默认按"年"推进剧情（玩家可切换为日 / 月 / 季 / 年不同叙事步长）、AI 生成叙事、带记忆压缩防止 token 爆炸、能存档和自动存档。最终验收必须**全程零红错、零崩溃、零未分流 gate FAIL**。

所有"模拟世界/社会/经济"的系统**全部延后**，先不做，以后由用户逐个确认后再加。延后系统优先从 MVP 执行路径隔离；只有为了暴露遗漏依赖时才允许临时抛错桩，且最终验收前不能让抛错桩在正常玩法路径产生红色控制台错误。

---

## 〇.1 执行权威优先级（必须遵守）

本蓝图只定义 MVP 范围和执行目标；遇到不清楚或与技能文件冲突时，按以下优先级执行：

1. `.agents/核心流程.md`：行为流程唯一权威，必须先复述、列计划、链路检索，再执行。
2. `.agents/skills/ai-life-sim-skill/SKILL-INDEX.md` + `.agents/cross-domain-contracts.md`：任务路由、跨域契约、分包决策。
3. 对应域 skill：MOD / 子系统走 `mod-dev-skill`，AI Prompt / Token 走 `ai-prompt-skill`，UI 走 `ui-liquid-glass-skill`，验证走 `testing-skill`。
4. 本蓝图：只作为 MVP 本轮范围、页面链路、延后清单和验收标准。
5. 实际代码链路：技能文件的"当前状态"可能滞后；改动前必须用链路检索核实真实代码，再决定怎么改。

若技能文件和实际代码状态冲突，不能凭猜测选择一边；先贴出证据，按 `.agents/核心流程.md` 的"不懂就停"处理。

---

## 一、必读前置（动手前先读，不在本文件重复）

| 主题 | 权威源 | 要点 |
|------|--------|------|
| 行为流程 + 三铁律 | `.agents/核心流程.md` | 先读后改、需求优先、不懂就停；改前贴链路检索证据 |
| 技能路由 | `.agents/skills/ai-life-sim-skill/SKILL-INDEX.md` + `.agents/cross-domain-contracts.md` | 先判断涉及哪些域、是否触发跨域契约、是否需要分包 |
| 项目架构 / 为什么叙事是根 | `.agents/skills/ai-life-sim-skill/ARCHITECTURE.md` | 4 层：foundation→core→mods→app；mod-engine 是叙事根 |
| 子系统写法（BaseSubsystem） | `.agents/skills/mod-dev-skill/resources/mod-spec-subsystem.md` §8 | 子系统 `extends BaseSubsystem`；时间只读 `this.getDaysPassed(context)` |
| 子系统模板 / 清空桩模板 | `.agents/skills/mod-dev-skill/templates/subsystem.template.ts` | 恢复子系统 = 照模板填空；延后系统 = 执行路径隔离优先，必要时再用清空桩 |
| 分段恢复优先级 | `.agents/skills/mod-dev-skill/resources/mod-spec-rewrite-tiers.md` | 本蓝图即"① 核心架构 + ② 主引擎 + MVP 角色链路" |
| 决策背景 | `docs/simulation-rewrite-discussion-plan.md` | 清空范围、时间引擎方案已确认 |
| MOD 清单 / 依赖 | `.agents/skills/mod-dev-skill/resources/mod-spec-mod-list.md` | 18 个 MOD 及真实依赖 |
| 关闸命令 | `.agents/skills/testing-skill/SKILL.md` §1 | 编码前 `npm run check:structural`；交付按级别跑 `npm run gate-check` |

**动 `src/core/` 或 `src/foundation/` 前必须说明风险并等用户确认（B-01/B-02）。**

**迁移口径**：本蓝图不要求一次性机械迁移所有 74 个旧子系统；凡本轮实际触碰、清空、恢复的子系统，必须按当前技能模板迁到 `extends BaseSubsystem`。未触碰的保留系统不得"顺手"大迁移，除非链路检索证明它阻断 MVP。

---

## 二、当前代码基线现状（执行者必须知道）

### 2.1 已完成（不要重做）
- **时间引擎数据契约已改造**：`RoundContext`（`src/foundation/types/subsystem.types.ts`）已删除旧的 `ageYearsDelta`/`calendarDaysDelta`/`simulationTicks`，改为必填 `daysPassed`/`totalDays`（唯一整数时间源，由 `TimeSystem` 产出）。
- **`TimeSystem`**（`src/mods/mod-engine/subsystems/time-system.ts`）已有 `totalDays`、整数天推进、真实公历分布、`getDaysPassed()`。
- **`BaseSubsystem`** 已建成（`src/core/subsystem-base.ts`，implements ISubSystemV2）；**`foundation/subsystem-contracts/`** 空聚合入口已建成。
- **19 个时间耦合的模拟子系统已清空为「抛错桩」**（economy/politics/culture/environment-ecology/power-system/tech-level 的一部分）——见 §五延后清单。注意：这些桩只能作为迁移期信号；若它们进入 MVP 正常玩法路径并触发 `console.error`，仍视为未达到"零红错"。

### 2.2 已知关闸基线（2026-07-05 阶段 A+B 复核）
检测器已做两类维护：一是每次运行自动清理 `reports/` 下超过 10 分钟的旧检测报告；二是 MOD 扫描已适配 `BaseSubsystem` 迁移期，并修正 PowerShell 子扫描器失败退出码传播。因此后续接手时不要再按旧报告判断，必须重新运行并读取最新报告。

当前最新基线：
1. `npm run lint`：PASS。
2. `npx tsc --noEmit`：PASS。
3. `npm run check:structural`：PASS（`reports/check-run-2026-07-05T04-52-21.json`）。
4. `node scripts/check/index.mjs narrative`：PASS（`reports/check-run-2026-07-05T04-51-36.json`），已把 `time-step-resolver-smoke.mjs` 接入 narrative 域，覆盖默认年步长、切换不推进、`daysPassed/totalDays` 注入、日/月/季/年换算静态契约。
5. `npm run test:calibration`：PASS；前三个 runner 全 OK，`calibration-wiring-audit` 将 20 个延后模拟字段登记为 `defer`，未知未接线字段仍会失败。
6. `npm run gate-check`：C1/C2 PASS，C3 FAIL；`wiring` / `loader` / `calibration` / `narrative` PASS，`mod` / `ui` FAIL，ATCE=`REVIEW`，无 repeat offender（`reports/check-run-2026-07-05T04-54-25.json`）。`mod` raw log 仍按全量扫描输出大量延后系统 C3/C4/C5，但正式报告的 primary issue 已收敛到 80 行；该域仍需后续按 MVP/defer 口径整理 scanner 或修活跃核心子系统格式。

本轮已清零或降级的旧阻断：
- `fate-prophecy` 已从活跃叙事变更链移出，并通过 codegen 同步 `subsystem-field-keys.generated.ts`。
- `orchestrator-system.ts` 对 `world-init-prompt-vars` 的跨 MOD 深导入已改为 `@/mods/mod-world` 公共导入。
- `world-calibration` 的 CSS/module 导入链已通过 `world-pool-selectors.ts` 拆分修复，calibration 域现在 PASS。
- A5 `timeBridgeSummary` / `narrativeGuidanceText` / `causalChainHint` 已由扫描器识别 `buildNarrativeUserJson(context)` 消费；真孤儿 `subsystemFields` 已从 `PromptContext`、orchestrator 赋值、re-export 和 generated 契约移除。
- A-15 ATCE 误报已收紧为只认字面 `A-15`，不再因 `orchestrator-system.ts` 文件名误判为强制重构。

阶段 A+B 已完成的新增收敛：
- `TimeSystem` 当前实现保持底层日粒度：`setTimeStep()` 只改变下一轮步长，`advance()` 用 `totalDays` 差值写入 `lastDaysPassed`；narrative 域新增冒烟覆盖该契约，旧 `simulationTicks/ageYearsDelta` 检查已移除。
- 新增 `mod-engine/helpers/mvp-runtime-policy.ts` 作为 MVP 运行策略单一来源：外部运行子系统仅 `character-base` / `destiny-pattern` / `lifespan` / `world-entity`；AI 结构化写入仅允许 `character-base` / `lifespan`。
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
[设置弹窗] 填 API 端口 + KEY
    │  （mod-settings，已保留不动，只需确保能存 endpoint + key 并被 ai-service 读取）
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
命格抽取 talent-draw  ★保留 AI 调用★
    │  调用 AI 抽命格 → 选择命格 / 天赋 / 词条
    │  （mod-character/subsystems/destiny-pattern-system.ts 全保留）
    ▼
角色设定 character-create
    │  姓名 · 性别 · 种族 · 背景信息 · 寿命
    │  （mod-character character-base + lifespan 保留）
    ▼
基础属性配置 attribute-alloc
    │  手动分配 5 项基础属性
    │  （mod-character/subsystems/character-base-system.ts 保留）
    ▼
身世预览 fate-preview
    │  汇总展示，无 AI
    ▼
核心模拟 game-story
    │  底层按「天」推进 · 默认叙事步长「年」 · 玩家可切换日/月/季/年 · AI 生成叙事 · 记忆压缩防 token 爆炸 · 存档 + 自动存档
    ▼
结算 game-over（空壳 → 返回启动页即可）
```

对应页面目录（均在 `src/mods/mod-pages/pages/`，大部分已存在；当前核心模拟真实路由为 `/game-story`）：
`welcome` `new-game` `world-select` `world-customize` `world-build` `talent-draw` `fate-preview` `character-create` `attribute-alloc` `game-story` `game-over` `save-manager`

---

## 四、系统总分段

### 4.1 MVP 段 —— 先做（本蓝图范围）

| 层 | 具体文件 / 系统 | 状态 | MVP 要做的事 |
|----|----------------|------|-------------|
| foundation | 全部 + `subsystem-contracts/` | 已完成 | 不动 |
| core | `core/subsystem-base.ts` | 已完成 | 不动 |
| core | `core/ai-service/`（`ai-client`/`ai-call-wrapper`/`provider-config`/`prompt-builder`/`parse-ai-json`/`stream-handler`） | 已有 | 确保读 mod-settings 的 endpoint+key；`customKey` 必须透传到命格、叙事主调用、降级链和摘要压缩 |
| core | `core/storage/`（`save-manager`/`persist-layer`/`local-storage`/`opfs-storage`/`game-reset`） | 已有 | 确保存档 + 读档 + 自动存档可用 |
| mod-settings | 全部 | 保留不动 | API endpoint + KEY 输入与持久化（UI 在 `SettingsModal` → `SettingsTabModel`/`SettingsTabPresets`；`ai-service` 侧读取见 `core/ai-service/provider-config.ts`，DeepSeek 默认 `baseUrl: https://api.deepseek.com/v1`） |
| mod-engine | `time-system`（底层日粒度，默认叙事步长年，可切换日/月/季/年）、`orchestrator-system`、`narrative-parser-system`、`summary-compressor-system`、`memory-engine-system` + `memory-lifecycle`/`memory-forgetting`/`core-memory` | 部分已有 | 核心叙事循环 + 记忆压缩，见 §六 |
| mod-world | `world-select` 预设/自定义、`world-customize` 手动配置 | 需改 | **去掉 world-init 的 AI 调用管线**，只留手动四字段 + 自定义 |
| mod-character | `destiny-pattern-system`、`character-base-system`、`lifespan-system` | 全保留 | 不清空；如需适配新 `daysPassed`/契约则微调 |
| mod-ui | 全部 | 保留不动 | 组件库 |
| mod-pages | 上述页面 | 可改页面逻辑，不做 UI 大重构 | 为 MVP 串通页面链路；`world-customize`/`world-build` 可调整为手动写入，避免 world-init AI 调用 |

### 4.2 模拟系统段 —— 全部延后（执行路径隔离优先，用户逐个确认后再加）

**做法**：MVP 正常玩法路径优先隔离延后子系统：不注入 Prompt、不允许 AI 写 changes、不参与核心循环关键验证；若必须保留文件结构，本轮触碰的延后子系统按当前技能迁到 `extends BaseSubsystem`，保留类名/id/mod/label/description 和清空说明。`collectState`/`applyChanges` 抛错桩只能作为调试期信号；最终 MVP 验收前，正常推进路径不得持续打印这些错误，否则不满足"全程零红错"。

延后的模拟子系统（"六大类"及其余）见 §五。

---

## 五、延后清单（模拟系统，隔离优先）

> 原则：**只要不在 §四.1 MVP 段里，就延后**。以下按 MOD 归类。已是抛错桩的文件仍需确认是否进入正常玩法路径；若进入并产生红色日志，需改为隔离或无噪声清空状态。

| MOD | 子系统 | 现状 |
|-----|--------|------|
| mod-economy | economy / population / item / settlement / work | ✅ 已抛错桩 |
| mod-politics | conflict-cycle / faction-dynamics / legal / social-stratification / social-values | ✅ 已抛错桩 |
| mod-politics | nation-relation / language-naming | ⬜ 需清空 |
| mod-culture | disciple / education / family / personal-ability / works | ✅ 已抛错桩 |
| mod-culture | culture / art / reputation / relationship / achievement | ⬜ 需清空 |
| mod-environment-ecology | climate / ecology | ✅ 已抛错桩 |
| mod-environment-ecology | geography / natural-resource / pollution | ⬜ 需清空 |
| mod-tech-level | culture-tech | ✅ 已抛错桩 |
| mod-tech-level | industry | ⬜ 需清空 |
| mod-power-system | monster | ✅ 已抛错桩 |
| mod-power-system | combat-power / cultivation / luck / fortune-encounter / faith / supreme-item / divine-intervention / anomaly-phenomena / special-material / skill | ⬜ 需清空 |
| mod-character | health / life-stage / attribute-decay / morality / post-death-epilogue | ⬜ 需清空（**注意：destiny/base/lifespan 保留，这 5 个延后**） |
| mod-npc | npc-attribute / npc-behavior / npc-memory | ⬜ 需清空 |
| mod-history-dynamics | event-pool / causal-simulation | ⬜ 需清空 |
| mod-base-universe | celestial / era / world-map / fate-prophecy / divine-creation | ⬜ 需清空（世界配置改手动后，纪元/天象等 sim 部分延后） |
| mod-world | `world-init-system` 的 AI 部分（保留手动写入路径）；`world-entity-system` 保留基础数据；`world-init-deps` 视情保留 | ⬜ 部分清空（注：旧 `world-timeline-system` 已在先前重构中删除，不存在） |
| mod-world-map | 世界地图渲染 | ⬜ 延后 |
| mod-golden-finger | golden-finger | ⬜ 延后（插件段） |
| mod-difficulty | store/constants/UI 难度选择 | ✅ 保留配置输入；仅延后难度驱动的模拟扩展 |

> ⚠️ MOD 级依赖不受影响：`mod-character` 的 manifest 依赖 `mod-power-system`，但那是**加载顺序**依赖，不是子系统数据依赖——power-system 的子系统全是抛错桩不影响 character 的 destiny/base/lifespan 运行。

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
- `orchestrator-system.ts`：每回合 收集子系统状态 → 组装 Prompt → AI 生成叙事 + 结构化变更 → 分发 applyChanges。MVP 阶段实际有效状态只有 character-base/destiny/lifespan + time；延后子系统不得污染 Prompt 或正常回合日志。
- `narrative-parser-system.ts`：解析 AI 响应。
- AI 调用走 `core/ai-service/`，端点+KEY 来自 mod-settings。**禁止硬编码 maxTokens（B-23），禁止 slice 截断叙事（B-24）**。

### 6.3 数据压缩（防 token 爆炸，MVP 必须可用）
- `summary-compressor-system.ts`：层级摘要压缩。
- `memory-engine-system.ts` + `memory-lifecycle-system.ts` + `memory-forgetting-system.ts` + `core-memory-system.ts`：记忆分层与遗忘。
- **验收点**：连续推进多年（如快进 50 年）后，注入 AI 的上下文 token 不随游戏时长线性爆炸——靠层级压缩把旧叙事收敛为摘要。压缩不得损伤关键因果（AI-07/AI-08：存完整叙事，摘要独立生成，禁止用 slice 破坏原文）。

### 6.4 存档 + 自动存档
- `core/storage/save-manager.ts`（`saveManager`）+ `persist-layer` + `local-storage`/`opfs-storage`。
- 自动存档接线点：`mod-engine/helpers/save-restore.ts` + `orchestrator-system.ts`（回合结束后触发）+ `mod-ui/.../GameBottomBar.tsx`（手动存档按钮）。
- **验收点**：推进若干回合 → 自动存档 → 刷新页面 → 从 `save-manager` 读档 → 世界/角色/时间/叙事历史正确恢复。

---

## 七、世界配置去 AI（屏 3 展开）

当前 `mod-world/world-init-*`（`world-init-api.ts`/`world-init-pipeline.ts`/`world-init-bundle.ts` + calibration）是一条重 AI 生成管线。MVP 要求**世界配置纯手动**：
1. `world-select`：预设世界列表 + "自定义"入口，纯本地数据，无 AI。
2. `world-customize`/`world-build`：手动选择/输入四字段（力量体系 · 世界观本质 · 力量上限 · 空间形态）+ 自定义按钮，**不触发任何 world-init AI 调用**。
3. 把 world-init 的 AI 管线调用**从 MVP 执行路径隔离/停用**（`WorldInitSystem` 及其 calibration/AI validation）；world 数据直接由手动表单写入 store。禁止只靠注释留下无人调用的半成品死代码。
4. 这一步不会自动消除 §2.2 的 calibration 语法错误 FAIL；该 FAIL 属于 gate 检查脚本/导入链问题，需在阶段 0 的 full gate 分流中单独处理。
5. 保留 `world-entity-system`（世界实体基础数据）等纯数据部分；`world-init-system` 的 AI 生成部分从 MVP 路径停用/隔离，保留其手动写入路径。

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
- **阶段 D｜角色链路**：talent-draw（AI 命格）→ character-create（姓名/性别/种族/背景/寿命）→ attribute-alloc（属性）→ fate-preview（身世）串通；隔离 mod-character 的 health/life-stage/attribute-decay/morality/post-death-epilogue，保留 destiny/base/lifespan。
- **阶段 E｜核心模拟循环 + 存档**：game-story 默认按年推进，也能切换为日/月/季推进；AI 出叙事，character-base/lifespan 随 `daysPassed` 更新，记忆压缩生效；手动存档 + 自动存档 + 读档恢复。
- **阶段 F｜最终清尾与验收**：确认启动→建世界→建角色→进模拟→推进→存读档全程零红错；所有 gate FAIL 均已修复或进入有 owner/阶段/原因的分流表，不能以"迁移期"笼统忽略。

---

## 九、验收标准（MVP "能玩"的定义）

1. 设置里填 endpoint + KEY，能保存并被命格 AI、叙事 AI、摘要压缩 AI、降级链读取；不能只验证 UI 存储。
2. 启动 → 新游戏 → 选世界（预设或自定义手动配置）→ AI 抽命格并选择 → 设定角色 → 配属性 → 看身世 → 进核心模拟，**全程无红色报错、无崩溃、无清空桩持续刷 `console.error`**。
3. 核心模拟底层按整数天推进；默认叙事步长为「年」，玩家可切换为「日 / 月 / 季 / 年」，AI 生成叙事，角色寿命/属性随 `daysPassed` 变化。
4. 连续推进多年，token 不爆炸（压缩生效）。
5. 能手动存档、自动存档、读档恢复。
6. C1 lint = 0，C2 tsc = 0，C3 gate-check 按 L3 要求处理；若仍有 FAIL，必须逐项说明是否为本阶段遗留、是否已纳入后续阶段，不能宣称无视。

---

## 十、铁律速记（违反即返工）

- 先读后改：改任何文件前 Read 完整文件 + 贴链路检索证据（含大小写不敏感 + getter 变体搜索）。
- 需求优先：只做 MVP 段，模拟系统一律隔离延后，**不要"顺手"恢复任何模拟系统**；临时抛错桩不能进入最终正常玩法验收路径。
- 不懂就停：世界配置去 AI 的边界、命格 AI 的返回结构等有歧义时，列选项问用户。
- 动 core/foundation 前说明风险等确认（B-01/B-02）。
- 本轮实际触碰、清空、恢复的子系统一律 `extends BaseSubsystem`；时间只读 `this.getDaysPassed(context)`；禁止复活 `ageYearsDelta`/`simulationTicks`。
- 禁止硬编码 maxTokens、禁止 slice 截断叙事/记忆。

---

*配套：`docs/simulation-rewrite-discussion-plan.md`（决策）· `docs/simulation-rewrite-architecture.md`（模板体系）· `.agents/skills/mod-dev-skill/resources/mod-spec-rewrite-tiers.md`（分段）*
