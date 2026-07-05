# 交接文档 · 2026-07-05 → GPT 5.5 接手

> 背景：本轮会话执行到一半，本机网络环境不稳定，工具调用可能存在丢失/未同步（对话叙述与磁盘实际 diff 一度对不上，已发现但未逐一核实到底）。
> **接手铁律：不要相信本文档"某项已完成"的断言，也不要相信对话历史里的文字描述。凡涉及下方"磁盘未提交改动"的文件，一律先 `git diff` 该文件、亲自读一遍逻辑，确认它做了什么、是否正确，再决定保留/修正/回滚。本文档只负责告诉你"调查到的事实"和"应该做什么"，不保证磁盘当前状态已经是对的。**

---

## 一、总体目标（不变，来自用户原话）

把 `D:\AI\ai-life-sim` 拉回"最初能正常游玩的版本"。这个项目是从 `D:\AI\废弃项目` 重构而来，重构一个多月后问题堆积，怀疑是 **AI 执行时没有确立"以什么为主"，导致核心和插件互相迁就**。

**裁决原则（贯穿所有阶段，遇到不清楚的地方直接按此裁决，不要停下来问）：**
- **核心优先**：`mod-engine` 叙事循环 + `time-system` + `mod-character`(destiny/base/lifespan) + `ai-service` + `storage` + `mod-settings` 是核心，必须纯净自洽、不被插件污染。
- **插件适配核心**：所有"模拟世界/社会/经济/NPC"系统一律隔离延后，绝不让核心为了迁就它们而变形。
- **代码事实优先于文档**：本文档、`.agents/` 技能文件的"当前状态"可能滞后于真实代码；改动前必须用链路检索（Grep/Read 实际代码）核实，再动手。检测器（gate-check/scanner）和真实代码脱节时，优先怀疑并修检测器，而不是让核心迁就误报（本轮已发生两次，见下）。
- **动 `src/core/` 或 `src/foundation/` 前**：在执行记录里说明风险，评估后直接按最推荐方案做（用户已明确要求全自动执行、不要暂停确认）。

权威蓝图仍是 `docs/blueprint-01-mvp-playable.md`（本轮已对它做了编辑，见下方"磁盘未提交改动"部分，接手前先 `git diff` 确认那些编辑内容对不对）。

---

## 二、已确认坐实的结论（调查证据链完整，可直接信任这些判断本身；但"是否已经正确写入代码"要看下面的磁盘状态部分）

### 2.1 A-15 ATCE 误报（判断可信）
- **现象**：`npm run gate-check` 报 `ATCE: REFACTOR_MANDATORY`，signal 是 `A-15`（"非 mod-engine 禁静态 orchestrator"），日志说 `orchestrator-system.ts` 触发第 2 次同规则+同模块，判定强制重构。
- **根因**：`scripts/check/lib/atce-signals.mjs` 的 `extractRuleId()` 有一条过宽的兜底正则 `/orchestrator|A-15/i` —— **任何一行日志只要出现裸字符串 "orchestrator"，就会被打成 A-15 架构信号**，与真实的 A-15 静态导入检查（在 `scan-typescript-wiring.mjs` 里，wiring 域，结果是 PASS，日志里没有一行真实 A-15 失败）完全无关。
- **实际被误标的行**：`orchestrator-system.ts` 上的 `C3-APPLY-FIVE`（applyChanges 五段式格式检查）失败，因为文件名/内容含 "orchestrator" 字样而被误分类。
- **验证方法**：
  1. `reports/check-log-wiring-*.txt` 里 grep "orchestrator" 应为空或只有非 FAIL 行。
  2. 全项目 grep `import[^;]*orchestrator[^;]*from '@/mods/mod-engine'`，非 mod-engine 目录下应无匹配（真实架构合规）。
  3. 历史 `check-run-*.json` 的 `refactorSignals` 里 `ruleId==='A-15'` 的条目，`excerpt` 实际都是 `[FAIL] [C3-APPLY-FIVE] .../orchestrator-system.ts`。
- **修法**：把兜底正则从 `/orchestrator|A-15/i` 收紧为只认字面规则 ID `/\bA-15\b/i`（真实 A-15 失败行必带 `[A-15]` 或 `见 A-15`，前面的 `extractRuleId` 分支已能捕获，收紧不影响真实检测能力）。
- **磁盘状态**：`scripts/check/lib/atce-signals.mjs` 显示已有该修改的 diff（6 行变化，内容看起来符合上述修法）。**接手后第一件事**：`git diff scripts/check/lib/atce-signals.mjs`，确认改动就是这行正则收紧，没有被其它东西污染，然后跑一次 `npm run gate-check` 看 ATCE 是否不再是 `REFACTOR_MANDATORY`（假设没有其它真实阻断）。

### 2.2 calibration 检查脚本导入链阻断（判断可信，且已验证修复有效）
- **现象**：`npm run gate-check` 的 calibration 域报 `SyntaxError: Unexpected token '.'`，来自 `world-calibration-acceptance-runner.ts` 被 tsx 当 CommonJS 跑。
- **根因链路（已用 Grep/Read 逐跳坐实）**：
  ```
  world-calibration-acceptance-runner.ts
    └─ calibration-clamp.ts（只想要纯函数 buildDefaultCalibration/clampCalibration）
         └─ [旧版第19行] world-init-fallback.ts
              ├─ @/mods/mod-settings (barrel) ──▶ SettingsModal.tsx ──▶ SettingsModal.module.css
              └─ ../store (Zustand persist)
         └─ 顺 barrel 继续拉起 mod-world-map ──▶ WorldMapCanvas.tsx ──▶ WorldMapCanvas.module.css  ← tsx 报错点
         └─ CSS 修掉后的下一症状：mod-engine barrel 循环初始化 ──▶ estimateTokenBudget undefined
  ```
- **本质**：纯计算核心 `calibration-clamp.ts` 在**模块加载期**静态依赖了运行时 store/UI 链（`world-init-fallback.ts` 混了两类函数：只读世界 store 的 `shouldUseGenericSimulationPools`/`resolveStaticPoolWorldviewKey`，和读设置 store 的 `isWorldInitAIAvailable`/`shouldUseStaticEntityFallback`）。calibration-clamp 只需要前者，却被同文件拖入后者的重链（`mod-settings` barrel）。
- **修法（已验证生效）**：按 store 依赖边界拆分：
  - 新建 `src/mods/mod-world/utils/world-pool-selectors.ts`，只放 `shouldUseGenericSimulationPools`/`resolveStaticPoolWorldviewKey`（只依赖 `../store` 即世界 store，轻量）。
  - `world-init-fallback.ts` 只保留 `isWorldInitAIAvailable`/`shouldUseStaticEntityFallback`（依赖 `@/mods/mod-settings`）。
  - `calibration-clamp.ts` 改为从 `world-pool-selectors.ts` 导入。
  - `world-init-system.ts` 的对应 import 路径同步改。
  - `mod-world/index.ts` barrel 里原本合并导出的 4 个函数拆成两条 `export { ... } from` 语句，分别指向两个文件，对外公共 API 名字不变。
- **验证结果（本轮会话内已实测通过）**：
  - `npx tsx scripts/check/domains/calibration/world-calibration-acceptance-runner.ts` → `[OK] world-calibration acceptance (§15) — 4 scenarios passed`
  - `npm run test:calibration`（跑全部 3 个 calibration runner）→ 全部 OK。
  - `npm run lint` → 0 错误；`npx tsc --noEmit` → 0 错误。
- **磁盘状态**：`world-pool-selectors.ts`（新文件）、`world-init-fallback.ts`、`world-init-system.ts`、`mod-world/index.ts`、`calibration-clamp.ts` 均显示已修改/新建。**这部分改动本会话内已经过实测验证（跑过 runner + lint + tsc 全绿），可信度最高，接手后建议只做一次复核性质的 `npm run test:calibration` + `npm run lint` + `npx tsc --noEmit` 确认没有被后续误改，不需要重新设计**。
- **遗留问题**：本次调查过程中一度创建过两个"CSS stub loader"临时方案（`scripts/check/lib/stub-css-loader.mjs` 和 `scripts/check/lib/css-module-stub.mjs`），**这两个文件是调查过程中的实验产物，最终没有采用**（真正的修法是上面的"按 store 边界拆分"，不需要 stub）。**磁盘上这两个文件目前仍然存在（未删除，之前一次"已删除"的说法未经核实、可能不准确），且没有任何脚本引用它们**。接手后请先确认无引用，然后删除这两个文件，避免留下死文件误导后人。

### 2.3 A5-CTX-ORPHAN×4 字段孤儿检查（判断可信，部分代码修改可能未完成）
- **现象**：mod 域报 4 条 `A5-CTX-ORPHAN`：`timeBridgeSummary`/`narrativeGuidanceText`/`subsystemFields`/`causalChainHint` "在 `assemblePromptContext()` 里赋值但叙事模板没有 `{{字段}}`，数据算了但没到 AI"。
- **根因**：`narrative-prompt.ts` 的叙事模板**运行时根本不走** `{{变量}}` 占位符替换。`prompt-builder.ts` 的 `buildPrompt()` 对 `template.name === 'narrative'` 有特殊分支，直接调用 `buildNarrativeUserJson(context)`，把 `context.<字段>` 映射成中文 JSON 键，跳过 `variables[]` 数组。A5 扫描器（`scripts/check/domains/mod/anomaly-scanner.ps1`）却只检查 `narrative-prompt.ts` 的 `variables[]` 数组，两者脱节，导致部分字段被误判。
- **逐字段核实结果（已读 `prompt-builder.ts` 源码坐实）**：
  | 字段 | `buildNarrativeUserJson` 里是否有 `context.<字段>` | 判定 |
  |------|------|------|
  | `timeBridgeSummary` | ✅ 第350行左右「时间桥摘要」 | 误报 |
  | `narrativeGuidanceText` | ✅「叙事引导」 | 误报 |
  | `causalChainHint` | ✅「因果链提示」 | 误报 |
  | `subsystemFields` | ❌ 完全不在 `buildNarrativeUserJson` 里 | **真孤儿** |
- **`subsystemFields` 的真孤儿细节（已读源码坐实，风险评估：低）**：
  - `orchestrator-system.ts` 里赋值：`subsystemFields: formatSubsystemFieldsForPrompt(promptOpenIds)`。
  - `formatSubsystemFieldsForPrompt`（定义在 `src/mods/mod-engine/helpers/subsystem-field-registry.ts`）**函数体本身就是空实现**：`return ''`，并标注 `@deprecated 已迁移至 System Prompt 的 subsystemGuide 字段...本函数保留仅供调试用途，不应再在运行时使用`。
  - 也就是说 `subsystemFields` 这个 PromptContext 字段，运行时**恒为空字符串**，且 `buildNarrativeUserJson` 根本不读它——是彻底的死代码/死重量。它的功能已被同文件里活跃的 `subsystemGuideText`（来自 `SUBSYSTEM_GUIDE` 常量，在 `buildNarrativeUserJson` 里映射为「子系统变更指南」，确认在用）取代。
  - `subsystem-field-registry.ts` 文件本身**不能删**：它还导出 `validateChange`/`validateRoundChanges`/`SUBSYSTEM_CHANGE_SCHEMAS`/`SUBSYSTEM_FIELD_MAP`，被 `round-commit-bus.ts`/`parse-strategies.ts`/`narrative-interceptor-pipeline.ts` 消费，这些是校验 AI changes 的活代码，只删 `formatSubsystemFieldsForPrompt` 这一个函数及其全部导出链（`orchestrator-pipeline-support.ts` 的 re-export、`subsystems/shared.ts` 的 re-export、`orchestrator-system.ts` 的 import 和赋值行、`foundation/types/narrative.types.ts` 里 `PromptContext.subsystemFields?: string` 字段声明）。
  - `mod-settings/components/SettingsTabPrompt.tsx:25` 里也有个字面量 `subsystemFields: '...'`，但那是设置面板 UI 展示用的**另一个同名变量**，与 `PromptContext.subsystemFields` 无关，**不要动**。
- **修法（两条腿，缺一不可）**：
  1. **改扫描器判据**：`anomaly-scanner.ps1` 的 A5 Check A，除了检查 `narrative-prompt.ts` 的 `variables[]`，还要检查 `prompt-builder.ts` 里 `context.<字段>` 的引用（正则 `context\.(\w+)` 提取），两处都没出现才真报 orphan。
  2. **删真孤儿死链**：从 `orchestrator-system.ts` 移除 `subsystemFields:` 赋值行和对应 import；从 `subsystem-field-registry.ts` 删 `formatSubsystemFieldsForPrompt` 函数；同步清理 `orchestrator-pipeline-support.ts`、`subsystems/shared.ts` 里的 re-export；从 `foundation/types/narrative.types.ts` 删 `PromptContext.subsystemFields?: string` 字段声明；重跑 `npm run generate:wiring` 让 `prompt-context-contract.generated.ts` 同步更新（它是 codegen 产物，不能手改）。
- **磁盘状态（⚠️ 需要重点核实）**：
  - `anomaly-scanner.ps1` 显示的 diff **远超**预期改动量（本会话只对 A5 Check A 做过一次编辑，但磁盘 diff 里还出现了一大段关于 `A9-MISSING-APIKEY` 检查、"spread-forwarding 识别 apiKey carrier" 的代码，这部分内容**不在本会话的调查范围和交代范围内，来源不明**，可能是网络问题导致的工具调用错乱、或磁盘状态被其它并行进程/历史会话修改）。**接手后必须完整读一遍 `anomaly-scanner.ps1` 现在的全文，而不是只看 A5 那一段**，确认里面的 A9 相关改动是否合理、是否需要保留。
  - `orchestrator-system.ts` 里 `subsystemFields: formatSubsystemFieldsForPrompt(promptOpenIds)` 这一行**根据最后一次核实，依然存在，没有被删除**——即上述修法的"第 2 条腿"（删真孤儿）**尚未执行**。
  - `subsystem-field-registry.ts`、`subsystem-field-keys.generated.ts`、`subsystem-prompt-gate.ts`、`narrative-prompt.ts` 均显示有磁盘改动，但改动内容**未逐一核实**，不确定是否是本次 A5 修复相关、是否正确、是否完整。
  - `remote-contracts.generated.ts`、`time-system.ts`、三个 `docs/*.md` 文件也显示有改动，**这些完全不在本会话可追溯的操作范围内**，很可能是更早的会话（如 baseline 文档提到的 "Stage A 时间引擎" 工作）遗留的未提交改动，也可能有交叉污染。

---

## 三、接手后第一步：不要相信任何"已完成"，先做一次全量核实

按顺序执行，每步先看结果再决定下一步，不要跳过：

1. `git status --short` 看当前改动文件全貌（与本文档"磁盘状态"部分逐一核对，确认没有进一步漂移）。
2. 对上面列出的每个"⚠️ 磁盘状态"文件，`git diff <file>` 通读一遍，用本文档给的"根因/修法"描述去对照，判断：
   - 改动是否符合描述的修法意图？
   - 改动是否完整（比如 subsystemFields 的第 2 条腿是否已经做完）？
   - 有没有本文档未提及、来源不明的改动混进去？如果有，单独评估是否合理，不合理就 `git checkout -- <file>` 回滚该文件重新做。
3. 确认后依次跑：
   - `npm run lint`（预期 0 错误）
   - `npx tsc --noEmit`（预期 0 错误）
   - `npm run test:calibration`（预期 3 个 runner 全 OK）
   - `npm run gate-check`（看 ATCE 是否仍是 `REFACTOR_MANDATORY`、A5-CTX-ORPHAN 是否只剩预期条目或清零）
4. 如果 `subsystemFields` 死链还没删，按"修法"第 2 条腿执行，然后重跑 `npm run generate:wiring` 同步 codegen 产物，再跑一次 lint+tsc+gate-check。
5. 删除确认无引用的两个 stub 文件（`stub-css-loader.mjs` / `css-module-stub.mjs`）。
6. 把 `npm run gate-check` 最新一次全量结果，重新做一次"真实阻断 / 检测器误报 / 迁移期应降级 / MVP 后处理"四分类，更新到 `docs/blueprint-01-mvp-playable.md`（该文件本轮也显示有磁盘改动，同样需要先 `git diff` 核实内容再决定是否在其基础上继续编辑）。

---

## 四、阶段 0 之后的执行顺序（蓝图 §八 已有定义，直接照做，遇到不清楚按"核心优先"裁决，不要停下确认）

1. **阶段 0 收尾**（本文档主要覆盖的部分）：structural 两项硬阻断清零 → full gate 分流表完整 → lint=0 tsc=0。
2. **阶段 A｜引擎地基对齐**：确认 `TimeSystem` 天粒度、默认年步长、日/月/季/年切换换算正确（`docs/gate-check-baseline-2026-07-04.md` 记录这部分之前已完成，但 `time-system.ts` 本轮显示有未提交改动，需要先核实那个改动是否破坏了已完成的部分）。
3. **阶段 B｜MVP 执行路径收敛**：核实蓝图 §五列出的延后子系统（economy/politics/culture/environment-ecology/power-system/tech-level 等模拟系统）已从 Prompt 注入、AI changes、核心循环验证路径隔离；已是抛错桩的文件确认不会在正常玩法路径打印 `console.error`。
4. **阶段 C｜世界配置去 AI**：`world-select` 预设/自定义 + `world-customize` 手动四字段（力量体系·世界观本质·力量上限·空间形态），绕开 `world-init-*` 的 AI 生成管线；`WorldInitSystem` 的 AI 部分从 MVP 路径隔离/停用，保留手动写入路径；保留 `world-entity-system` 纯数据部分。
5. **阶段 D｜角色链路**：talent-draw（AI 抽命格，唯一保留的第二处 AI 调用）→ character-create（姓名/性别/种族/背景/寿命）→ attribute-alloc（手动分配属性）→ fate-preview（汇总展示，无 AI）串通；隔离 `mod-character` 的 health/life-stage/attribute-decay/morality/post-death-epilogue，保留 destiny/base/lifespan。
6. **阶段 E｜核心模拟循环 + 存档**：`game-story` 默认按年推进、可切日/月/季/年，AI 生成叙事，character-base/lifespan 随 `daysPassed` 更新，记忆压缩（`summary-compressor-system`+`memory-engine-system`+`memory-lifecycle`+`memory-forgetting`+`core-memory`）防 token 爆炸；手动存档+自动存档+读档恢复（`core/storage/save-manager.ts` 等）。
7. **阶段 F｜最终验收**：启动→建世界→建角色→进模拟→推进→存读档全程零红错、零崩溃；所有 `gate-check` FAIL 项均已修复或进入有明确 owner/阶段/原因的分流表；`npm run lint`=0、`npx tsc --noEmit`=0。

验收标准细节见 `docs/blueprint-01-mvp-playable.md` §九（该文件本轮有改动，核实后为准）。

---

## 五、给 GPT 5.5 的行为提醒（沿用本项目已有的三铁律，用户本轮追加要求"全自动不暂停"）

- **先读后改**：改任何文件前完整 Read，贴链路检索证据（大小写不敏感 + getter 变体搜索）再动手。
- **需求优先，不要顺手扩大范围**：模拟系统一律隔离延后，不要因为"顺手"就恢复或深挖任何延后系统；本文档以外的额外重构一律不做。
- **不懂就停 → 本轮改为"不懂就按核心优先裁决直接做"**：用户已明确表示不需要暂停确认，遇到分歧按"核心优先、插件适配核心、代码事实优先于文档"的顺序自行裁决并继续，事后在总结里说明裁决依据即可。
- **动 `core/`/`foundation/` 前**：正常仍要评估风险，但评估后直接执行，在交付总结里写清楚改了什么、为什么、风险多大，不需要等用户确认。
- **每个阶段结束**：跑 `npm run lint`（0）+ `npx tsc --noEmit`（0），阶段末跑 `npm run gate-check`，新的 FAIL 必须归类，不能忽略或笼统甩给"迁移期"。
