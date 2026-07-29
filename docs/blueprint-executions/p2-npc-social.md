# P2 多世界模拟执行记录

文档角色：蓝图阶段执行记录
状态：已完成（P2 范围）
完成时间：2026-07-28 13:03（Asia/Shanghai）
所属蓝图：[蓝图二 · 多世界模拟重写计划执行书](../blueprint-02-multi-world-simulation-foundation.md)

## P2 NPC 与社会关系基础接入

本文件保存 P2 的冻结输入、实际执行结果和验收证据。P2 已在同一任务完成运行接线、旧实现清理、统一协议迁移和第 16.6 节验收；后续阶段不得把本文件中的旧来源节点恢复为并行运行入口。

### 16.1 系统节点、所有者与接入顺序

| 顺序 | SystemPath | 拥有者 | P2 接入结果 |
|---:|---|---|---|
| 1 | `project > simulation-runtime > npc-social > contracts` | Foundation | 新增 provider-owned 的 `npc-social.contract.ts`，定义 NPC、关系、实体引用、操作字段键集和持久化数据契约；不承载 Store、业务校验或 Prompt。 |
| 2 | `project > simulation-runtime > world-identity > entity-directory` | `mod-world` 的 `world-entity` | 扩展现有世界实体系统为全局实体引用目录：为玩家、NPC 与组织登记稳定 `GlobalEntityId`、实体种类与可见上下文，不拥有 NPC 属性、关系、记忆或位置。 |
| 3 | `project > simulation-runtime > npc-social > relationship-system` | 新增 `mod-social` | 以唯一运行 ID `relationship-system` 拥有有向通用关系图、状态和追加式迁移记录；依赖 `mod-world` 的实体引用目录，不依赖 NPC 私有数组或 `mod-culture`。 |
| 4 | `project > simulation-runtime > npc-social > npc-system` | `mod-npc` | 以唯一运行 ID `npc-system` 拥有 NPC 身份档案、当地状态、目标、行为记录和独立记忆；行为组件只通过 `relationship-system` 的公开读取接口消费关系。 |
| 5 | `project > simulation-runtime > orchestration > npc-social-transaction` | 编排器与 RoundCommit | 将 NPC、关系、空间移动和历史证据的预检与提交纳入同一回合事务；编排器只协调快照、顺序和回滚，不拥有业务状态。 |
| 6 | `project > acceptance > npc-social-p2` | 项目测试系统 | 已新增 `test:npc-social-p2`，证明多世界身份、范围调度、原子提交、存档和旧机制唯一化。 |

`npc-attribute`、`npc-behavior` 与 `npc-memory` 是 `npc-system` 的内部组件来源，不再保留独立运行 ID、Manifest 子系统、字段契约、Prompt 或 Store。`relationship` 从 `mod-culture` 移出；`mod-culture` 在 P2 后不保存人物关系、不计算好感或信任，也不作为关系写入中转。

### 16.2 唯一公开事实与状态所有权

| 概念 | 冻结语义与唯一所有者 |
|---|---|
| `entityReference` | `mod-world/world-entity` 维护的只读目录条目，含稳定 `GlobalEntityId`、`player/npc/organization` 种类、显示标签和允许引用的上下文。它只校验引用存在性与命名空间，不复制实体业务状态。 |
| `npcId` | 直接使用已登记的 `GlobalEntityId`，由 NPC owning system 请求实体目录分配或登记；名称、外号和组织名称不能代替该 ID。 |
| `npcIdentity` | `npc-system` 拥有的跨世界连续身份：显示名、创建来源、出生规范时间、稳定特质和生命周期前的可用状态。年龄是 NPC system 基于唯一 `TimeSystem` 的只读投影，P2 不新增第二个年龄时钟、生命阶段或死亡系统。 |
| `npcContextState` | `npc-system` 按 `npcId + contextId` 保存的当地称呼、立场、角色和当地规则修正。目标由独立追加式 `npcGoal` 保存；稳定属性与当地修正分开，离开上下文不把当地修正写成全局属性。 |
| `npcGoal` 与 `npcBehaviorRecord` | `npc-system` 追加保存的目标和已确认行动。目标具有稳定 ID、状态、目标上下文、规范时间与事件证据；行为记录只能引用存在的实体、空间节点和已接受历史事件。 |
| `npcMemory` | `npc-system` 保存的主观记忆，不与主角记忆或其他 NPC 共享。每项记录发生上下文、来源事件/关系迁移、主观摘要、情绪和关联实体；语义合并必须保留完整 `sourceMemoryIds` 覆盖，不能以容量、年份或位置淘汰原始事实。 |
| `relationship` | `relationship-system` 拥有的有向边，以 `fromEntityId + toEntityId + scope` 标识。边保存关系类别标签、好感、信任、羁绊或冲突状态；建立、调整、解除和作用域改变均追加 `relationshipTransition`，不原地抹除历史证据。 |
| `entityLocation` | 仍唯一属于 `spatial-graph`。NPC system 只能请求或读取 `EntitySpatialLocation`；不得在 NPC 档案、行为记录或关系边中再保存竞争的当前位置字段。 |
| 历史证据 | 仍唯一属于 `historical-event-ledger`。NPC 目标、行为、记忆和关系迁移只引用已接受事件 ID，或引用同一已预检历史批次中的合法 ID；不得从正文或显示名称补造事实。 |

关系的 `scope` 只可为 `global`、单一 `context` 或显式 `cross-context`。全局关系保留跨世界连续性；当地关系保留原上下文而不在其他世界自动生效；跨界关系必须明确列出所有相关上下文。P2 只提供通用关系图和中性类别标签，不把家庭、师徒、婚姻、阶层、政治或特定世界观的规则硬编码进基础关系系统；这些专项语义在 P7 以关系扩展提交。

### 16.3 运行范围、AI 与事务边界

1. 上下文缺少 `npc` 能力时，`npc-system` 与 `relationship-system` 返回禁用投影，不推进、不接受写入，也不进入该上下文的叙事内容；`mod-world` 的组织实体和 P0/P1 系统继续按各自契约运行。
2. `active` 上下文运行当前相关 NPC 的完整本地规则与受校验叙事提交。NPC Prompt 从玩家同场实体开始，扩展到与同场实体直接相连的一跳关系端点，再选取活动目标及同场、相关或最近同一规范时间批次的行为和记忆；关系 Prompt 只投影至少一个端点位于当前场景且作用域适用的边。完整 Store 不截断，后台、休眠或无关世界人物不逐个进入主叙事 Prompt。
3. `background` 上下文只有在能力画像的 `backgroundSubsystemIds` 明确列出对应系统时才运行确定性低频聚合，不逐 NPC 调用主叙事 AI。`dormant` 和 `closed` 上下文不推进 NPC 或关系；重新进入上下文时只按离开后的规范时间生成一次带来源的追赶记录，不逐回合重放。
4. NPC 支持受校验的创建身份、设置当地状态、设定目标、记录行为和记录记忆；关系支持建立、调整、解除和变更作用域。每个操作只接受公共契约列出的精确载荷键，夹带其他合法字段也会整条拒绝；关系解除唯一使用空“变更”对象。AI 不生成稳定实体 ID、当前年龄、全局时间、提交结果或未在输入中出现的空间节点与历史事件 ID。
5. 现有四项可写系统和 P2 两项系统已一次性迁移到 `PD-025` 的七字段中文“系统指令”协议：`系统/目标对象/目标上下文/操作/说明/变更/依据事件` 均必需，其中依据事件为可空数组。旧 `状态变更` 成功协议、转译、Schema 和白名单已删除，不存在双协议、降级路径或兼容旁路。
6. RoundCommit 先对整包执行阶段运行门禁、能力、模拟范围、实体目录、空间可达性、历史证据、关系端点、操作载荷和各 owning Store 预检；随后在同一快照中提交普通状态、空间迁移、NPC/关系批次、历史批次、连续性与记忆引用。任一步失败恢复所有副作用并拒绝结构化整包；合格正文和摘要仍按既有规则保留。

### 16.4 持久化、查询与迁移策略

1. `npc-system` 的 `schemaVersion: 1` 完整保存 `identities/contextStates/goals/behaviorRecords/memories/memoryCompressions`；`relationship-system` 的 `schemaVersion: 1` 完整保存 `relationships/transitions`；`world-entity` 的 `schemaVersion: 1` 只保存实体引用目录。空间位置继续由 world context 快照保存。三个 owning system 均使用严格 `capturePersistenceState/restorePersistenceState`，预生成和真实读档共用同一校验。
2. 每轮 `collectState()` 只返回当前相关 NPC 和关系派生视图，不把完整 NPC、记忆或关系事实全量克隆进 Prompt；该选择不删除、压缩或改变持久真源。
3. 缺少 P2 owning snapshot 的存档初始化空 NPC、关系和非组织实体引用状态，再由当前存档的世界组织与玩家恢复流程重建其明确引用。P2 不实现、不暴露也不调用旧 `npc-attribute/npc-behavior/npc-memory/relationship` collected state 迁移接口；旧字段不能被猜测、部分解释或绑定到当前上下文。
4. 旧浏览器键 `mod-npc:persist:npc-state` 没有存档和上下文归属，P2 运行态不读取、不写入、不迁移，也不以其作为恢复后备。实体目录同样从 `mod-world` 浏览器持久 Store 和 World 通用存档快照中排除，只由 owning snapshot 恢复，防止跨存档残留。
5. P2 不允许固定容量、FIFO、字符截断、数组位置淘汰或按年份删除 NPC、目标、行为、记忆或关系事实。未知版本、未知字段、重复 ID、断开的来源/端点、错误作用域、错误位置或跨 Store 引用不一致必须整包拒绝，保持当前已加载人生不变。

### 16.5 旧实现清理与运行接线

P2 已在完成新所有者后同时删除下列旧入口：

1. `mod-npc` 中 `npc-attribute`、`npc-behavior`、`npc-memory` 的独立类、独立 Store 责任、旧随机行为、NPC 私有关系数组、旧年龄推进和独立持久化键读写。
2. `mod-culture` 中 `relationship` 的类、类型、Manifest 声明、Prompt 注入、状态写入与关系计算；不存在“文化关系”和“通用关系”双真源。
3. 旧运行 ID、旧 Manifest 子系统、旧字段契约、旧 Prompt、旧 `narrativeChange` 项、旧生成接线和旧测试入口。源码存在、生成文件存在或浏览器残留都不能成为 P2 的运行后备。

新 `mod-social` Manifest 只声明通用关系公共边界、`RelationshipSystem` 和 `useRelationshipStore`，没有虚构未发出的事件；`mod-npc` 依赖 `mod-world` 与 `mod-social` 的公开 API，不深层导入其他 MOD 的 Store。`world-entity` 的实体目录扩展仍使用现有 `mod-world` 公共边界，不新增与空间图或历史账本竞争的身份、位置或事件 Store。

### 16.6 P2 验收矩阵

| 验收项 | 必须证明的结果 | 当前状态 |
|---|---|---|
| 多世界身份与位置 | 同名 NPC 在两个上下文不碰撞；NPC、组织和玩家关系只引用稳定实体 ID；NPC 唯一位置由空间图保存，错误世界或地点引用被拒绝。 | 已通过：P2 聚焦测试覆盖同名 NPC、实体种类、上下文可见性、空间节点和位置端点。 |
| 关系与记忆连续性 | 再次遇见 NPC 时其年龄投影、立场、目标、主观记忆、好感和信任可恢复；主角记忆与 NPC 记忆不互相伪装为同一事实。 | 已通过：完整 NPC/关系快照往返后状态一致，记忆来源、关系迁移和历史证据均严格关联。 |
| 范围调度 | active 完整、background 低频聚合、dormant/closed 冻结；后台人物不逐个进入主叙事 Prompt，也不调用全量 AI。 | 已通过：活动、后台、休眠、关闭和重新进入路径均有确定性断言，异场人物不会进入当前 Prompt。 |
| 原子事务 | 混合合法和非法的 NPC、关系、空间、历史与连续性变化不留下部分写入；预生成与失败提交完整恢复。 | 已通过：混合合法身份与非法关系端点的整包在 owning preflight 阶段零写入拒绝。 |
| 存档与隔离 | P2 完整状态严格往返；缺少 P2 快照时初始化空状态，浏览器残留或另一个存档绝不串入；畸形和未来版本被隔离。 | 已通过：严格版本、未知字段、重复/断开引用、错误位置和跨存档清理均有断言；P2 不暴露旧载荷迁移入口。 |
| AI 协议唯一化 | 统一中文系统指令覆盖原四项可写系统和 P2 允许操作；不存在旧 `状态变更` 成功路径、双 Schema 或手写字段旁路。 | 已通过：七字段中文协议、操作级键集、解除空载荷、夹带字段整包拒绝和旧成功协议拒绝均有断言。 |
| 唯一化与数据完整性 | 源码、Manifest、注册表、Prompt、字段契约和运行清单中旧 P2 来源 ID 残留为零；无固定容量、截断或静默淘汰。 | 已通过聚焦检查、`check:structural`、`check:mod` 和无截断审计：生成接线只注册两个新系统，虚假事件声明已清除，旧运行入口和旧浏览器键实时源码残留为零。 |
| 权威同步 | 本蓝图、产品决策、系统树、核心模拟、Manifest、运行配置、Foundation 契约和聚焦测试描述一致。 | 已完成：当前机制分别归入系统树、核心模拟、逻辑树、PD-025 与本阶段文件，主蓝图只保留目标架构和阶段索引。 |

### 16.7 实际执行结果

1. 新增 `npc-social.contract.ts`、`mod-social/relationship-system`、统一 `mod-npc/npc-system` 和 `world-entity` 实体引用目录；玩家恢复时自动登记并放置到空间图。
2. 删除旧 NPC 属性、行为、记忆三个运行系统及 `mod-culture/relationship`，同时删除其 Manifest、Prompt、Store 所有权、生成接线和虚假事件声明；不存在兼容入口或第二关系真源。
3. 主叙事的四项原可写系统与 P2 两项系统统一使用七字段中文“系统指令”。操作字段从公共契约派生，转译、注册表 Schema、RoundCommit 和 owning preflight 共同执行整包校验。
4. NPC、关系和实体目录分别保存封闭 `schemaVersion: 1` 完整快照；World 通用快照和 Zustand 浏览器持久化排除实体目录，缺少 owning snapshot 时先清空，防止跨存档串入。
5. NPC 与关系完整 Store 不做固定条数或容量淘汰；主叙事只消费按当前场景、上下文、作用域、一跳关系和相关时间批次派生的非破坏性视图。
6. 为 `mod-npc`、`mod-social` 补齐轻量根入口、纯类型入口和次级运行 API；跨 MOD 调用不再穿透 `subsystems/`，生成 Remote API 接线与架构白名单保持一致。

### 16.8 验证入口

- 聚焦：`npm run test:npc-social-p2`
- 上游回归：`npm run test:world-context-p0`、`npm run test:history-causality-p1`、`npm run test:narrative-protocol`
- 静态与结构：`npx tsc --noEmit`、`npm run lint`、`npm run check:structural`、`npm run check:mod`
- 数据完整性：`node scripts/check/domains/narrative/no-hard-truncation-audit.mjs`
- 完整交付：`npm run check:changelog`、`npm run gate-check`（C0/C1/C2、wiring、loader、mod、calibration、UI 通过；叙事域仅受既有命格 Prompt 契约不一致和缺失 `narrative-safety.ts` 基线失败阻断）

### 16.9 最终验证记录

2026-07-28 13:03（Asia/Shanghai）完成最终复核：

- `npm run generate:wiring`：通过，生成两个 P2 次级公共 API 接线。
- `npx tsc --noEmit`、`npm run lint`：通过；lint 仍为 0 error、6 个既有 warning。
- `npm run test:world-context-p0`、`npm run test:history-causality-p1`、`npm run test:npc-social-p2`、`npm run test:narrative-protocol`：全部通过。
- `npm run check:structural`、`npm run check:mod`、`node scripts/check/domains/narrative/no-hard-truncation-audit.mjs`、`npm run check:changelog`：全部通过。
- `npm run gate-check`：C0 版本、C1 lint、C2 TypeScript，以及 C3 的 wiring、loader、mod、calibration、UI 通过；叙事域剩余失败均来自本任务开始前已存在的工作树基线：命格 Prompt 回归契约的 7 项断言，以及 `narrative-minor-safety-smoke.mjs` 引用但不存在的 `src/mods/mod-engine/helpers/narrative-safety.ts`。这些文件不属于 P2，本任务未添加兼容文件或修改无关功能。
