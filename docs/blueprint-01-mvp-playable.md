# 蓝图一 · MVP 最小可玩版本（交付 GPT 5.5 执行）

> 状态：待执行 | 版本：v1.2 | 创建：2026-07-04 | 校准：2026-07-04 | 接手基线：2026-07-04
> 定位：本文件是**MVP 执行蓝图**，但不替代 `.agents/` 技能体系；执行者必须先按下方「执行权威优先级」加载技能和项目规范，再用本蓝图约束 MVP 范围。
> 目标读者：一个没有本项目历史对话上下文的 AI 执行者。

---

## 〇、一句话目标

**让项目回到"最初能正常游玩的版本"**：在设置里填 API 端口和 KEY → 新游戏 → 选世界 → 手动配置世界 → AI 抽命格 → 设定角色 → 配属性 → 看身世 → 进入核心模拟界面按"年"推进、AI 生成叙事、带记忆压缩防止 token 爆炸、能存档和自动存档。**全程零报错**。

所有"模拟世界/社会/经济"的系统**全部延后**，先不做，以后由用户逐个确认后再加。

---

## 〇.1 执行权威优先级（必须遵守）

本蓝图只定义 MVP 范围和执行目标；遇到不清楚或与技能文件冲突时，按以下优先级执行：

1. `.agents/核心流程.txt`：行为流程唯一权威，必须先复述、列计划、链路检索，再执行。
2. `.agents/skills/ai-life-sim-skill/SKILL-INDEX.md` + `.agents/cross-domain-contracts.md`：任务路由、跨域契约、分包决策。
3. 对应域 skill：MOD / 子系统走 `mod-dev-skill`，AI Prompt / Token 走 `ai-prompt-skill`，UI 走 `ui-liquid-glass-skill`，验证走 `testing-skill`。
4. 本蓝图：只作为 MVP 本轮范围、页面链路、延后清单和验收标准。
5. 实际代码链路：技能文件的"当前状态"可能滞后；改动前必须用链路检索核实真实代码，再决定怎么改。

若技能文件和实际代码状态冲突，不能凭猜测选择一边；先贴出证据，按 `.agents/核心流程.txt` 的"不懂就停"处理。

---

## 一、必读前置（动手前先读，不在本文件重复）

| 主题 | 权威源 | 要点 |
|------|--------|------|
| 行为流程 + 三铁律 | `.agents/核心流程.txt` | 先读后改、需求优先、不懂就停；改前贴链路检索证据 |
| 技能路由 | `.agents/skills/ai-life-sim-skill/SKILL-INDEX.md` + `.agents/cross-domain-contracts.md` | 先判断涉及哪些域、是否触发跨域契约、是否需要分包 |
| 项目架构 / 为什么叙事是根 | `.agents/skills/ai-life-sim-skill/ARCHITECTURE.md` | 4 层：foundation→core→mods→app；mod-engine 是叙事根 |
| 子系统写法（BaseSubsystem） | `.agents/skills/mod-dev-skill/resources/mod-spec-subsystem.md` §8 | 子系统 `extends BaseSubsystem`；时间只读 `this.getDaysPassed(context)` |
| 子系统模板 / 清空桩模板 | `.agents/skills/mod-dev-skill/templates/subsystem.template.ts` | 恢复子系统 = 照模板填空；清空 = 抛错桩 |
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
- **19 个时间耦合的模拟子系统已清空为「抛错桩」**（economy/politics/culture/environment-ecology/power-system/tech-level 的一部分）——见 §五延后清单。

### 2.2 已知关闸基线（⚠️ 2026-07-04 检测器修正后重新确认）
检测器已做两类维护：一是每次运行自动清理 `reports/` 下超过 10 分钟的旧检测报告；二是 MOD 扫描已适配 `BaseSubsystem` 迁移期，并修正 PowerShell 子扫描器失败退出码传播。因此后续接手时不要再按旧报告判断，必须重新运行并读取最新报告。

当前最新基线：
1. `npm run lint`：PASS。
2. `npx tsc --noEmit`：PASS。
3. `npm run check:structural`：FAIL，硬阻断为：
   - `SUBSYSTEM_CHANGE_SCHEMAS` 与 generated keys 不一致（`fate-prophecy`）。
   - `[A-02]` `orchestrator-system.ts` 对 `@/mods/mod-world/utils/world-init-prompt-vars` 的跨 MOD 深导入。
4. `npm run gate-check`：C1/C2 PASS，C3 FAIL。除上面 structural 两项外，还会暴露：
   - calibration：`world-calibration-acceptance-runner.ts` 运行时导入 CSS module，报 `SyntaxError: Unexpected token '.'`。
   - mod：大量旧规则/迁移期问题已开始真实反映为 FAIL，包含旧子系统生命周期格式、manifest dependency/provides 解析、generated 文件 deep import、未导入 MOD 等。这里必须先分流“真实阻断 / 检测器误报 / 迁移期应降级 / MVP 后处理”，不能直接逐行硬修。
   - ui：`GameStory.module.css` 等存在废弃 CSS 变量和未知 CSS 变量。

**执行策略**：先打通 `check:structural` 两项硬阻断，再做 full gate 分流。MVP 阶段要"去掉世界配置的 AI 调用"（见 §七），这会顺带绕过 calibration 的 AI 校准链；但不能只靠绕过掩盖测试问题，最终仍需让 full gate 的每个 FAIL 都有明确归类和处理计划。**C1 lint（0）+ C2 tsc（0）目前是干净的，必须始终保持。**

### 2.3 代码事实核实规则

本节状态只作为执行起点，不能替代链路检索。执行每个阶段前必须重新核实：

- `RoundContext.daysPassed/totalDays` 是否已经存在，旧字段是否仍有真实代码引用。
- `TimeSystem` 默认步长、`orchestrator-system` 注入 context 的字段是否和本蓝图一致。
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
    │  推进步长默认「年」 · AI 生成叙事 · 记忆压缩防 token 爆炸 · 存档 + 自动存档
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
| core | `core/ai-service/`（`ai-client`/`ai-call-wrapper`/`provider-config`/`prompt-builder`/`parse-ai-json`/`stream-handler`） | 已有 | 确保读 mod-settings 的 endpoint+key，能发一次 AI 调用（命格）+ 叙事流式 |
| core | `core/storage/`（`save-manager`/`persist-layer`/`local-storage`/`opfs-storage`/`game-reset`） | 已有 | 确保存档 + 读档 + 自动存档可用 |
| mod-settings | 全部 | 保留不动 | API endpoint + KEY 输入与持久化（UI 在 `SettingsModal` → `SettingsTabModel`/`SettingsTabPresets`；`ai-service` 侧读取见 `core/ai-service/provider-config.ts`，DeepSeek 默认 `baseUrl: https://api.deepseek.com/v1`） |
| mod-engine | `time-system`（默认改「年」）、`orchestrator-system`、`narrative-parser-system`、`summary-compressor-system`、`memory-engine-system` + `memory-lifecycle`/`memory-forgetting`/`core-memory` | 部分已有 | 核心叙事循环 + 记忆压缩，见 §六 |
| mod-world | `world-select` 预设/自定义、`world-customize` 手动配置 | 需改 | **去掉 world-init 的 AI 调用管线**，只留手动四字段 + 自定义 |
| mod-character | `destiny-pattern-system`、`character-base-system`、`lifespan-system` | 全保留 | 不清空；如需适配新 `daysPassed`/契约则微调 |
| mod-ui | 全部 | 保留不动 | 组件库 |
| mod-pages | 上述页面 | 可改页面逻辑，不做 UI 大重构 | 为 MVP 串通页面链路；`world-customize`/`world-build` 可调整为手动写入，避免 world-init AI 调用 |

### 4.2 模拟系统段 —— 全部延后（抛错桩，用户逐个确认后再加）

**做法**：每个本轮新触碰的延后子系统改成「抛错桩」（照 `templates/subsystem.template.ts` 末尾的清空模板）——类结构按当前技能迁到 `extends BaseSubsystem`，`collectState`/`applyChanges` 抛 `[id] 子系统已清空...`，`reset` 空实现，保留类名/id/mod/label/description，加清空说明注释。引擎的三个调用点（Round1/2/3 收集、advance、RoundCommit）都有 try-catch，抛错被捕获记录、不会崩溃回合。

延后的模拟子系统（"六大类"及其余）见 §五。

---

## 五、延后清单（模拟系统，全部改抛错桩）

> 原则：**只要不在 §四.1 MVP 段里，就延后**。以下按 MOD 归类。已标注哪些「已是抛错桩」（§2.1 完成），哪些「仍是活代码、需清空」。

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
| mod-history-dynamics / mod-difficulty | — | ⬜ 延后 |

> ⚠️ MOD 级依赖不受影响：`mod-character` 的 manifest 依赖 `mod-power-system`，但那是**加载顺序**依赖，不是子系统数据依赖——power-system 的子系统全是抛错桩不影响 character 的 destiny/base/lifespan 运行。

---

## 六、引擎核心：时间 + 叙事 + 压缩 + 存档

### 6.1 时间：默认步长「年」
- `DEFAULT_ENGINE_CONFIG.timeStep`（`src/mods/mod-engine/constants.ts:79`）**已经是** `{ unit: 'year', value: 1 }`。
- 但 `TimeSystem` 内部默认仍是 month（`time-system.ts:134` 和 `reset()` 的 `440`）——**改为 `{ unit: 'year', value: 1 }`**，与 store 默认对齐。
- 子系统读时间统一 `this.getDaysPassed(context)`（一年步进 = daysPassed 365/366）；需要年/月/季用 `context.totalDays` 换算（见 mod-spec-subsystem.md §8.0）。

### 6.2 叙事循环（保留，是根）
- `orchestrator-system.ts`：每回合 收集子系统状态 → 组装 Prompt → AI 生成叙事 + 结构化变更 → 分发 applyChanges。MVP 阶段绝大多数子系统是抛错桩，实际有效状态只有 character-base/destiny/lifespan + time。
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
4. 这一步应顺带消除 §2.2 的 calibration 语法错误 FAIL（那些 runner 属于被绕过的 AI 校准链）。
5. 保留 `world-entity-system`（世界实体基础数据）等纯数据部分；`world-init-system` 的 AI 生成部分从 MVP 路径停用/隔离，保留其手动写入路径。

> 命格抽取（talent-draw）**保留 AI**——这是 MVP 里除叙事外唯一的另一处 AI 调用。

---

## 八、执行顺序（GPT 5.5 分阶段推进，每阶段跑关闸）

> 编码前先跑 `npm run check:structural` 并读取最新报告；每完成一个阶段：`npm run lint`（0）+ `npx tsc --noEmit`（0），阶段末按 L3 跑 `npm run gate-check`。阶段 0 必须先让 structural 变绿；full gate 剩余 FAIL 必须建分流表，不能无视。

- **阶段 0｜关闸基线打通（换电脑后第一步）**：
  1. 运行 `npm run check:structural`，确认最新报告仍只剩 structural 两项硬阻断。
  2. 修 `fate-prophecy` schema/generated keys 不一致：先查 `SUBSYSTEM_CHANGE_SCHEMAS`、`SUBSYSTEM_FIELD_MAP`、`subsystem-field-keys.generated.ts`、manifest/子系统 id 来源，优先用生成源或单一配置解决，禁止手改 generated 产物。
  3. 修 `orchestrator-system.ts` deep import：`@/mods/mod-world/utils/world-init-prompt-vars` 必须改为 `@/mods/mod-world` 公共导出、secondary public entry、事件或 store selector 之一；先做链路检索，再选最小且符合 MOD 边界的方案。
  4. `npm run check:structural` 必须 PASS 后，才进入阶段 A/B。
  5. 随后运行一次 `npm run gate-check`，把剩余 C3 FAIL 建立基线分流表：真实阻断 / 检测器误报 / 迁移期应降级 / MVP 后处理。分流表应写回本蓝图或独立 `docs/` 记录，避免下一轮重复判断。
- **阶段 A｜引擎地基对齐**：TimeSystem 默认步长改「年」；确认 orchestrator 用 `daysPassed`/`totalDays` 正常组装 context（已完成 90%，只差步长）。
- **阶段 B｜世界配置去 AI**：world-select 预设/自定义 + world-customize 手动四字段，绕过 world-init AI 管线；清空 world/base-universe 的 sim 子系统为抛错桩；确认阶段 0 的 structural 基线不回归。
- **阶段 C｜角色链路**：talent-draw（AI 命格）→ character-create（姓名/性别/种族/背景/寿命）→ attribute-alloc（属性）→ fate-preview（身世）串通；清空 mod-character 的 health/life-stage/attribute-decay/morality/post-death-epilogue 为抛错桩，保留 destiny/base/lifespan。
- **阶段 D｜核心模拟循环**：game-story 能按年推进、AI 出叙事、character-base/lifespan 随天数更新、记忆压缩生效。
- **阶段 E｜存档**：手动存档 + 自动存档 + 读档恢复。
- **阶段 F｜清尾**：其余所有模拟子系统（§五 ⬜ 项）全部清空为抛错桩；确认启动→建世界→建角色→进模拟→存读档全程零报错。

---

## 九、验收标准（MVP "能玩"的定义）

1. 设置里填 endpoint + KEY，能保存并被 AI 调用读取。
2. 启动 → 新游戏 → 选世界（预设或自定义手动配置）→ AI 抽命格并选择 → 设定角色 → 配属性 → 看身世 → 进核心模拟，**全程无红色报错、无崩溃**（控制台可有被 try-catch 捕获的"子系统已清空"记录，属预期）。
3. 核心模拟按「年」推进，AI 生成叙事，角色寿命/属性随时间变化。
4. 连续推进多年，token 不爆炸（压缩生效）。
5. 能手动存档、自动存档、读档恢复。
6. C1 lint = 0，C2 tsc = 0，C3 gate-check 按 L3 要求处理；若仍有 FAIL，必须逐项说明是否为本阶段遗留、是否已纳入后续阶段，不能宣称无视。

---

## 十、铁律速记（违反即返工）

- 先读后改：改任何文件前 Read 完整文件 + 贴链路检索证据（含大小写不敏感 + getter 变体搜索）。
- 需求优先：只做 MVP 段，模拟系统一律抛错桩延后，**不要"顺手"恢复任何模拟系统**。
- 不懂就停：世界配置去 AI 的边界、命格 AI 的返回结构等有歧义时，列选项问用户。
- 动 core/foundation 前说明风险等确认（B-01/B-02）。
- 本轮实际触碰、清空、恢复的子系统一律 `extends BaseSubsystem`；时间只读 `this.getDaysPassed(context)`；禁止复活 `ageYearsDelta`/`simulationTicks`。
- 禁止硬编码 maxTokens、禁止 slice 截断叙事/记忆。

---

*配套：`docs/simulation-rewrite-discussion-plan.md`（决策）· `docs/simulation-rewrite-architecture.md`（模板体系）· `.agents/skills/mod-dev-skill/resources/mod-spec-rewrite-tiers.md`（分段）*
