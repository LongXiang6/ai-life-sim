# 技能体系更新提案：根优先元原则 + 本次调研固化红线

日期：2026-07-07
状态：**历史提案，2026-07-11 已退役**。原治理资料保存在 `D:\AI\docs\archive\agent-governance-2026-07-11\`；当前只使用四个高自由度项目上下文 Skill。

> 背景：本次 2026-07-07 的调研（见 [plan](file:///D:/AI/ai-life-sim/docs/plan-2026-07-07-narrative-deregex-ui-eval.md) §八 P1）查出一批"会反复发生"的问题——字段契约三方漂移、寿命双算、死代码伪装成活代码、中文 `split(/\s+/)` 失效。这些靠改一次代码治不住，须固化成红线/理念，让后续每个 AI（含 GPT 执行者）开工必读，同类错误不再被引入。

---

## 落地结果

已完成：

| 项 | 落地位置 |
|----|----------|
| 根优先元原则 | 历史工作流已归档；当前范围与权限见 `D:\AI\AGENTS.md` |
| Markdown 低噪声 | 当前入口文档与四个 Skill 保持项目事实优先、低噪声 |
| 字段契约单一真源红线 | `prohibited-behaviors.md` B-49、`anti-patterns.md` E-09 |
| 判定/落地闭环红线 | `prohibited-behaviors.md` B-50、`anti-patterns.md` E-10 |
| 根优先镜像红线 | `prohibited-behaviors.md` B-51、`anti-patterns.md` P-10 |
| Markdown 低噪声镜像红线 | `prohibited-behaviors.md` B-52、`anti-patterns.md` P-11 |
| 死代码识别 | 当前由 `ai-life-sim` 的运行权威说明与 MVP runtime 配置定位 |
| 中文分词反模式 | `anti-patterns.md` C-27 |
| 技能入口 | 四个现行 `SKILL.md` 及各自直接 references |
| 自动治理检查 | `.agents/scripts/check-governance.mjs` |

验证：

```bash
node .agents/scripts/check-governance.mjs --verbose
```

通过标准：无撤废语残留、镜像同步、元原则入口同步、testing P 编号唯一、`.agents` 末端索引完整。

换机后从 `D:\AI\AGENTS.md` 和匹配的现行 Skill 进入；修改 `.agents` 后运行当前插件、治理和引用检查。

---

## 一、现状：哪些已有规则、哪些缺失

先说清楚，避免重复造轮子：

**已有、无需新增（本次问题不是缺规则，是旧代码没遵守）：**
- 去正则化：`prohibited-behaviors.md` B-39（AI 自由文本禁正则做关键路径判定）+ `anti-patterns.md` PM-09（新判定优先 AI 结构化）已覆盖。G2 去正则化按现有红线执行即可。
- 单一权威源（泛化）：B-43（能自动发现/生成的不手动接线）、B-45（工具函数提取 core/shared）已有"单一来源"精神，但**没有针对"字段契约"这一具体场景**。

**缺失、本次要补：**
1. **根优先元原则**——核心流程只讲"怎么做一步"，不讲"先做哪件"。缺一条顶层优先级原则。
2. **字段契约单一真源**——B-43 的精神在，但没有点名"子系统字段名三处手写会漂移"这一具体反模式。
3. **判定/落地闭环**——没有规则约束"业务规则不得散在 orchestrator + 子系统 + post-narrative 多处"。
4. **死代码识别**——没有规则提醒"判断某系统是否运行要先查 MVP 白名单"。
5. **中文分词**——`anti-patterns.md` 没有"中文文本不可 `split(/\s+/)`"这条。

---

## 二、提案 1：根优先元原则（最重要，放核心流程顶层）

### 落地位置
历史方案原计划把该原则放入独立工作流文档；该工作流已归档，当前不再作为模型必须执行的固定六步。

### 拟新增内容（措辞草案）

> ## 优先级原则：先根后叶
>
> 做任何事都有优先级。**先完成重要的、根本的核心，再做表层的枝叶。** 像种一棵树：先有种子、再长树根树干、最后才是枝叶——绝不能反过来先做表层再回头补核心。
>
> - **动手前先判断当前任务处在哪一层**：是根（数据结构/契约/核心算法/单一权威源），还是叶（UI 措辞/单点样式/局部优化）。
> - **根未稳时不做叶**：若一个表层改动依赖的核心契约/数据结构本身有问题或将要改，先修核心，否则叶改完还要跟着核心返工。
> - **多任务并存时，核心优先排序**：字段契约、数据结构、判定归属这类"改了会牵连一片"的根问题，排在 UI/文案/局部优化之前。
> - **例外**：完全独立、与核心无耦合的表层任务（如纯前端 token 治理），可并行，不必等核心。

### 为什么值得进技能
本次就踩了这个坑：差点先做 G2 去正则化（叶），但字段契约漂移（根）没修，delta 会写进系统不读的字段，等于白做。根优先原则能让后续 AI 自动先问"这是不是要先修根"。

### 引用同步
核心流程新增节后，检查 `AGENTS.md`、`prohibited-behaviors.md` 顶部的流程引用描述是否需要提及此原则；`cross-domain-contracts.md` 若有流程概述也同步。

---

## 三、提案 B：字段契约单一真源（新增红线）

**问题**：子系统字段名在「子系统 impl / Zod registry / AI 指南」三处手写，漂移后 AI 输出被静默丢弃（本次 B3/B4/B5 的根因）。B-43 有"单一来源"精神但没点名此场景。

**建议落地**：在 `anti-patterns.md` 新增一条（归入 E 引擎类或 A 架构类）：

> **E-09（拟）｜子系统字段契约三处手写**：子系统可写字段的名称/类型/语义，不得在「applyChanges 实现 / Zod registry / AI subsystemGuide」三处各自手写。必须单一声明、其余派生。改字段契约时改声明一处，三处随之同步。
> 正确做法：字段契约集中声明为常量，registry schema 与 AI 指南从声明生成（详见 [core-architecture 文档 C-1](file:///D:/AI/ai-life-sim/docs/design-2026-07-07-core-architecture.md)）。

对应在 `prohibited-behaviors.md` 补一个 B 编号（如 B-49）镜像此条，并更新顶部 Must 清单 + 镜像映射表（B ↔ anti-patterns 需同步，见现有 P-02 事故教训）。

---

## 四、提案 C：判定/落地闭环（新增红线）

**问题**：业务规则散在「子系统 + orchestrator + post-narrative」多处 → 双算、连锁改动（本次 B2 寿命双算）。

**建议落地**：在 `anti-patterns.md` 新增（E 引擎类）：

> **E-10（拟）｜业务判定散落多处**：一个业务规则（如寿命突破、属性变化）的"判定"与"落地写状态"必须在同一子系统内闭环。禁止 orchestrator / post-narrative / helper 自己算业务数值再写回子系统状态。跨系统只能经 `context.subsystemStates` 读、经 RoundCommitBus 写。
> 正确做法：判定+落地归属单一子系统；编排层只排顺序、只分发（详见 core-architecture C-3）。

同样在 `prohibited-behaviors.md` 补镜像 B 编号 + 更新映射表。

---

## 五、提案 D：死代码识别（补充到检索规范）

**问题**：MVP 白名单外的子系统"已实现但不运行"，读代码看不出来，是"不清楚哪个系统在起作用"的最大来源。

**当前落点**：由 `ai-life-sim` 说明运行权威，由 `ai-life-sim-mod-development` 说明子系统注册与 runtime policy：

> 判断某子系统"是否实际运行"，先查 MVP 运行白名单（`mvp-stages-config.default.json` 的 runtime.external / engine），不能因为文件存在、类已定义就假设它在跑。抛错桩（collectState 直接 throw）与非白名单子系统属"已实现未启用"，改动前须确认其运行状态。

---

## 六、提案 E：中文分词反模式（新增 Critical 反模式）

**问题**：`split(/\s+/)` 对中文无意义（无空格，整句变一个 token），导致相似度/因果判定失效。本次两处（memory-forgetting / memory-lifecycle）都中招。

**建议落地**：在 `anti-patterns.md` C 代码类新增：

> **C-27（拟）｜中文文本用 `split(/\s+/)` 分词**：中文无空格，按空白分词会把整句当成一个词，相似度/重叠/因果判定全部失效。
> 正确做法：中文用字符块提取（如 `/[一-龥]{2,6}/g`，参照 `digest-ledger.ts` 的 `extractEntities`）或分词库，禁止空白分词。

此条纯代码规则，不涉及行为红线，可只加 anti-patterns、不必进 prohibited-behaviors。

---

## 七、落地清单（你确认后我执行）

| 提案 | 落地位置 | 类型 | 需同步 |
|------|---------|------|--------|
| A 根优先元原则 | 历史工作流归档 | 元原则 | 当前不作为独立模型纪律 |
| B 字段契约单一真源 | `anti-patterns.md` E-09 + `prohibited-behaviors.md` B-49 | 红线 | 镜像映射表 + Must 清单 |
| C 判定/落地闭环 | `anti-patterns.md` E-10 + `prohibited-behaviors.md` B-50 | 红线 | 镜像映射表 + Must 清单 |
| D 死代码识别 | `ai-life-sim` + `ai-life-sim-mod-development` | 项目事实 | MVP runtime 配置 |
| E 中文分词 | `anti-patterns.md` C-27 | 代码反模式 | 无（不进 prohibited） |

**落地后必做**（核心流程第五步第 5 条）：跑 `node .agents/scripts/check-governance.mjs` 确认 0 ERROR（撤废语残留 + 镜像编号同步），并核对所有引用处索引描述已更新。

⚠️ 编号 E-09/E-10/B-49/B-50/C-27 均为**拟定**，落地时需先查 `anti-patterns.md` / `prohibited-behaviors.md` 当前最大编号，避免与已有冲突。
