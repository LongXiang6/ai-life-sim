# AI 人生模拟器项目调度

## 项目职责

- 本文件承接 `D:\AI\AGENTS.md`，只拥有 AI 人生模拟器的项目事实、部门路由、运行边界和验收入口。
- 应用根目录为 `D:\AI\ai-life-sim`；依赖方向固定为 `app -> mods -> core -> foundation`。
- 项目是 AI 驱动的叙事人生模拟器；玩家可感知结果同时关注剧情质量、生成速度、操作直觉和低信息压力。
- 运行时活动子系统只以 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 为准，源码存在不等于已经激活。

## 项目金字塔

- 核心模拟回合是运行时总指挥：Orchestrator 确定本轮目标、上下文和必需工作，再通过公开契约委派给活动 MOD。
- MOD 是部门所有者，在边界内分派到子系统和组件；下级拥有业务计算、状态和持久化，上级只拆解目标、协调依赖、汇总状态并发布终态。
- 自动化只负责加载、注册、接线、依赖解析、排队、状态校验、快照、持久化编排和诊断，不拥有业务判断、业务状态或业务结果。
- 活动执行流必须消费 `src/core/execution/execution-flow-registry.ts` 的中央登记项；流程 ID、owner、阶段和状态契约不得在调用方复制。
- 普通函数内部步骤、页面交互、单次服务调用和测试清单沿用所属模块现有控制流；只有承担跨组件硬依赖、并行汇合、公开状态迁移或唯一终态的运行时流程才进入中央登记。

## Skill 路由

任何项目任务先加载 `.agents/skills/ai-life-sim/SKILL.md`，再只追加直接命中的分支；本表是项目定向 Skill 的唯一索引。修改 Skill 时，另外读取 `D:\AI\.agents\skill-editing-operation.md`；普通任务不加载 Skill 编辑历史。

| 任务 | 项目 Skill 与权威 |
|---|---|
| 项目权威入口 | `docs/authority-index.md` |
| 架构、所有权、系统演进、标识或数值边界 | 基础 Skill `references/project-development.md` 与 `docs/authority/system-tree.md` 目标章节 |
| MOD、Manifest、生命周期、子系统、公共 API | `.agents/skills/ai-life-sim-mod-development/SKILL.md` 与系统树目标章节 |
| 核心模拟、编排、活动成员、回合提交 | MOD Skill 与 `docs/authority/core-simulation.md` 目标章节 |
| Prompt、解析、结构化 AI 输出、叙事组装、Provider、Token 或缓存 | `.agents/skills/ai-life-sim-prompt-engineering/SKILL.md` 与核心模拟、逻辑树目标章节 |
| 页面、布局、交互、文案或响应式 | `.agents/skills/ai-life-sim-ui/SKILL.md` 与 `docs/authority/interface-tree.md` 目标章节 |
| 问题、复现、浏览器路径或交付验证 | `.agents/skills/ai-life-sim-testing/SKILL.md` 与问题所属权威章节 |
| 数据存储、选择、压缩、传递、容量或限长 | 基础 Skill `references/data-integrity.md` |
| 项目结构、文件、格式、命名、排序或生成物 | 基础 Skill `references/standardization.md` |
| 修改或交付应用文件 | 基础 Skill `references/development-checks.md` |
| 版本、缺陷记录或玩家更新日志 | 基础 Skill `references/release-recording.md` |
| 生产环境、部署、恢复或服务 | 基础 Skill 对应 `production-*.md` reference |

## 项目边界

- 当前运行机制写入对应活动权威；Skill 只保存可复用流程和稳定项目路由，任务证据只写任务溯源。
- 按 `D:\AI\AGENTS.md` 判断任务是否命中主项目运行代码门槛。命中时按任务溯源规范处理：新任务默认在项目 `traces.sqlite` 建立记录，只有用户明确点名接手未完成记录或同一未结束任务轮次的修正/返工/追加才续写原记录；写入用户原始要求并完成范围说明后，得到确认再智能拆分阶段，并按“更新所属活动权威 -> 修改 Skill、源码、配置、测试或资产”执行，在完成、验证或形成关键结论时回写。文档、Skill、测试、格式和不改变运行行为的任务直接执行。
- 活动权威只描述应达到的玩家结果、系统效果、范围和边界；Skill 描述实现方法、架构选择和验证方式。
- 同一事实只保留一个所有者、一个命名源、一个公开契约和一个验收入口；页面和聚合器不成为业务状态所有者。
- 变更系统、功能或运行策略时同步更新唯一活动权威，并在同一任务清理被取代入口、注册、调用、状态所有权和测试引用。
- 除协议最低产品、结构与类型、身份完整性、真实安全边界或用户明确要求外，禁止新增内容拦截、过滤、黑名单、相似度阈值或静默丢弃。剧情重复、偏题、强度偏移以及功能或 UI 问题，沿输入、规则、状态、调用、解析、渲染和副作用追踪到最早偏差，在唯一根因所有者处修复或合并原实现；不以输出过滤、重复校验、页面特判、额外样式覆盖或旁路替代。只有职责、字段、状态或契约确实缺失，或用户明确要求新增时，才增加对应规则或机制。
- 不保留兼容层、旁路、备用实现、双写双读或平行真源；不因结构拆分改变业务行为、公共 API、持久化 Schema 或界面效果。
- 用户未明确要求时，不设置任何数量、长度、条数、比例、阈值、时限、配额或其他上下限。确需设置限制时，先完整说明前因后果、具体边界、适用范围和影响，并取得明确同意；未经同意不自行设限、截断、拒绝或增加门禁。

## 验收入口

- 标准化与结构：`npm run check:standardization`、`npm run check:structural`。
- 执行流与 MOD：`npm run check:execution`、`npm run check:mod`。
- TypeScript 应用：`npm run lint`、`npx tsc --noEmit`。
- 跨领域或持久化交付：`npm run gate-check`。
- 本项目用户已明确要求：版本批次、修订号递增和续办/连续 UI 的复用条件只以 [版本记录](.agents/skills/ai-life-sim/references/release-recording.md) 为准；版本化溯源完成并验证后再记录该批次。记录版本或完成任务验收后，在保留无关工作原状的前提下及时暂存、提交并推送 GitHub；优先使用仅在发布期间开启的服务器临时隧道，不保存代理配置。部署仍只在用户明确要求时执行。
