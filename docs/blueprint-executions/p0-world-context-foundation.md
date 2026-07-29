# P0 多世界模拟执行记录

文档角色：蓝图阶段执行记录
状态：已完成
所属蓝图：[蓝图二 · 多世界模拟重写计划执行书](../blueprint-02-multi-world-simulation-foundation.md)

## P0 世界上下文基础执行契约

本节冻结 P0 的 A2 目标。实现可以在不改变字段语义的前提下调整私有文件拆分，但公开概念、唯一拥有者、原子性、兼容边界和验收结果不得弱化。

### 14.1 P0 系统节点与执行顺序

| 顺序 | SystemPath | A/R/W/S | 拥有者 | 本阶段结果 |
|---:|---|---|---|---|
| 1 | `project > simulation-runtime > multi-world-foundation > contracts` | A2/R0/W5/S1 | 本蓝图、Foundation 跨域契约 | 冻结上下文 ID、全局实体 ID、作用域、能力、空间、当地时间和切换结果类型 |
| 2 | `project > simulation-runtime > multi-world-foundation > world-context-registry` | A3/R1/W5/S2 | `mod-world` | 存档级保存多个上下文实例、当前上下文和生命周期；旧单世界自动迁移为首个上下文 |
| 3 | `project > simulation-runtime > multi-world-foundation > capability-and-scope` | A3/R1/W4/S3 | `mod-world` | 每个上下文显式登记能力画像与 `active/background/dormant/closed` 模拟范围 |
| 4 | `project > simulation-runtime > multi-world-foundation > spatial-graph` | A3/R1/W4/S4 | `mod-world` | 上下文空间根、区域节点、父子边、跨上下文出口和实体位置使用统一图契约 |
| 5 | `project > simulation-runtime > multi-world-foundation > context-transition` | A3/R1/W5/S5 | `mod-world` | 预检目标、出口和状态后原子切换；任一步失败恢复原上下文投影和运行上下文 |
| 6 | `project > simulation-runtime > world-creation > world-init` | A3/R1/W4/S6 | `mod-world` | 单世界工厂改为每次创建一个上下文实例；可选择是否立即激活并与当前上下文建立出口 |
| 7 | `project > simulation-runtime > orchestration > context-integration` | A3/R2/W5/S7 | `mod-engine` | `RoundContext`、Prompt 世界视图、叙事历史、摘要、因果和伏笔使用稳定 `contextId`；唯一时间和提交权威保持不变 |
| 8 | `project > simulation-runtime > persistence > multi-world-round-trip` | A3/R2/W5/S8 | world Store、编排器快照、save/restore 聚合 | 多上下文注册表、当前投影、内部叙事状态、全局角色 ID 和实体命名空间完整保存与恢复 |
| 9 | `project > acceptance > multi-world-p0` | A5/R3/W5/S9 | 项目测试系统 | 单世界兼容、第二上下文创建、切换回滚、休眠不运行完整回合、存档往返和故事作用域均有确定性证据 |

### 14.2 公开概念

| 概念 | 冻结语义 |
|---|---|
| `contextId` | 存档内稳定且全局唯一的世界、星球、区域或场景上下文编号；世界名称和 `worldCode` 都不能替代它 |
| `globalEntityId` | 存档内稳定且不跨上下文碰撞的角色、世界实体、地点和后续物品/NPC 编号；六位诊断编号不得用作业务 ID |
| `contextKind` | `campaign-root/world/universe/plane/galaxy/planet/continent/region/settlement/scene/vehicle/dream/digital/abstract` 中的显式节点类型 |
| `simulationScope` | `active/background/dormant/closed`；一个存档只能有一个当前 `active` 上下文 |
| `capabilityProfile` | 由世界配置和已确认事实派生的能力集合；P0 只决定组合，不恢复 P1—P8 系统 |
| `spatialGraph` | 由节点、父子或邻接边、跨上下文出口及实体位置组成；地图 UI 只是读取投影，不拥有这些事实 |
| `localClock` | 上下文当地历法、时间倍率、当地累计时间和最后同步的全局天数；全局 `TimeSystem.totalDays` 仍是唯一规范时间 |
| `transitionRecord` | 保存来源、目标、出口、全局时间、当地时间换算、移动实体、结果和失败原因的可审计记录；不得按固定容量删除 |

### 14.3 持久化与兼容策略

1. `mod-world` Store 保存完整 `contexts` 注册表和 `currentContextId`，同时继续提供 `worldConfig/entities/worldCode/...` 当前上下文投影，供现有页面和旧调用方使用。
2. 当前投影的每次合法写入必须同步回当前上下文实例；切换时先保存离开上下文投影，再一次性投影目标上下文。
3. 旧存档只有单一 `worldConfig` 时，在迁移中创建一个首上下文，保留原配置、实体、标签、校准、世界编码、纪元和初始化状态；不得要求玩家重开。
4. 旧世界实体和区域保留原本地 ID 作为迁移元数据，运行主键改为带上下文命名空间的全局 ID，并同步更新商路、势力区域和地点引用。
5. 角色 Store 新增稳定全局角色 ID；旧存档首次迁移时生成并持久化，之后不得因改名、切换世界或读档改变。
6. 编排器快照保存当前 `contextId` 和内部叙事子系统状态；恢复时世界 Store 先恢复完整注册表，再恢复编排器和当前世界投影，任一核心步骤失败整包回滚。
7. “开始新人生”与“同一存档新增上下文”是两种不同生命周期。前者由 `mod-pages` 新人生生命周期在调用 `world-init` 前清空当前人生的世界注册表、角色、叙事、活动子系统和本局草稿；后者必须由明确的多世界产品流程提供当前存档和连接参数。`world-init` 不自行推断或替换整个存档。

### 14.4 运行与 AI 边界

1. P0 已将世界上下文注册表、上下文能力画像、空间关系图、上下文切换、模拟范围策略和世界初始化加入 MVP 外部运行成员；主叙事可写名单仍只有基础属性、寿命、气运和道德。
2. `time` 和 `orchestrator` 继续保持单例。上下文系统只能读取规范时间、选择运行范围和请求切换，不能建立第二时间线或第二提交链。
3. 当前 `active` 上下文运行完整 MVP 链；`background` 只允许明确登记的聚合系统；`dormant` 与 `closed` 不进入完整回合、Prompt 或状态写入。
4. 世界上下文注册表、能力画像、模拟范围、时间和编排为 AI 只读；空间图和世界实体为事件输入；上下文切换和世界初始化为提议。P0 不向主叙事开放任何新可写字段。
5. Prompt 世界视图必须明确当前上下文编号、类型和范围；叙事历史、摘要、账本、伏笔和延迟因果必须保存发生上下文。旧世界事实可以检索，但当地伏笔和当地因果不能在无关世界自动触发。

### 14.5 P0 非目标

- 不恢复旧 `world-map` 模拟或地图页面。
- 不恢复 NPC、历史事件账本、地理资源、经济政治、文化生态或世界观插件。
- 不实现逐后台世界的完整回合重放；P0 只建立范围与当地时间结算契约。
- 不把 `worldCode`、世界名称、角色名称或六位诊断编号继续当作稳定业务主键。
- 不为了多世界复制第二个 `TimeSystem`、编排器、存档聚合器或叙事调用链。
- P0 不新增玩家页面；玩家可见入口在定版页面方案获批后接入，本阶段以公开运行 API、存档能力和确定性验收证明底座可用。

### 14.6 P0 完成矩阵

| 验收项 | 必须证明的结果 | 证据状态 |
|---|---|---|
| 单世界兼容 | 旧单世界快照迁移后仍可进入当前 MVP、推进、保存和加载 | 已通过：旧快照迁移断言、创建首轮叙事回归与 save/restore 路径检查 |
| 第二上下文 | 同一存档创建第二个上下文，不覆盖第一个上下文配置、实体、空间和当地时间 | 已通过：`test:world-context-p0` |
| 原子切换 | 有合法出口时切换成功；目标关闭、出口不存在或运行上下文注入失败时完整回滚 | 已通过：提交、拒绝与运行注入失败回滚断言 |
| 模拟范围 | 只有当前上下文完整运行；休眠和关闭上下文不进入 Prompt 或完整子系统回合 | 已通过：范围策略、能力过滤和错误世界 Prompt 排除断言 |
| 全局身份 | 角色、世界实体和空间节点 ID 在两个上下文中不碰撞，改名不改变稳定 ID | 已通过：实体命名空间、稳定角色 ID 与上下文重用断言 |
| 时间权威 | 全局天数单调且唯一；当地时间按范围与倍率结算，切换不重复推进角色年龄 | 已通过：唯一 `TimeSystem`、当地时钟结算与休眠不重放断言 |
| 故事作用域 | 新叙事、摘要账本、伏笔和延迟因果记录发生上下文，当地事项不在错误世界触发 | 已通过：叙事历史、摘要、因果、伏笔、记忆和角色当地修正作用域断言 |
| 存档往返 | 完整注册表、当前上下文、切换记录、内部叙事状态和旧世界事实序列化后等价恢复 | 已通过：world JSON 往返、编排器内部状态快照恢复和核心上下文不一致回滚契约检查 |
| 新人生隔离 | 从欢迎页、`/new-game` 或直接世界选择入口开始新人生时，旧叙事、角色、世界注册表、P1 账本和本局草稿均不能进入新世界；同一未完成创建世界返回仍保留有效草稿 | 已通过：`test:new-life-isolation`、创建首轮叙事回归和 UI 入口结构检查 |
| 权威同步 | 产品决策、系统索引、蓝图、运行配置、manifest、生成接线与测试记录一致 | 已完成：A1—A4 文档、24 系统运行策略、manifest 和生成接线同步 |

P0 交付记录：本地游戏版本 `5.1.3`，北京时间 `2026-07-19 19:11:14`，玩家更新记录 `public/changelog-16.txt`。`check:changelog` 与完整 `gate-check` 已通过；该记录只表示本地项目完成，不表示已经部署到服务器。

P0 二次审批记录：首次审批发现切换旁路、位置不唯一、父链无环校验、当地历法、Prompt 作用域和真实存读档证据缺口；同任务完成根因收口后，扩展 `test:world-context-p0`、TypeScript、结构接线、叙事协议与无硬截断审计通过。该收口不单独生成版本，随 P1 的同一项功能记录交付。
