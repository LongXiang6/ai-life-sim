# 项目文档入口

文档角色：documentation-index
权威层级：A3
状态：active
体系路径：project > governance > documentation-system
上级目标：用最少的活动文档准确路由产品、架构、运行系统和验收信息
下级组成：产品决策、执行蓝图、架构契约、系统索引、QQ Bot 接口契约、验收账本与 UI 定版原型
适用范围：`docs/` 中的活动项目文档
拥有者：项目文档治理
最后验证：2026-07-21；活动引用审计与系统顺序检查
取代关系：取代按日期计划、提案、发布说明和独立 playtest 文件作为活动入口的做法
运行真源：本表列出的活动文档及其指向的 live source
验收证据：`.agents` 治理检查、引用审计、`git diff --check`

## 1. 权威层级

| 层级 | 文档或真源 | 回答的问题 |
|---|---|---|
| A0 | `../../AGENTS.md` 与项目 Skills | 能否修改、必须读取什么、如何验证和发布 |
| A1 | [产品决策](product-decisions.md) | 产品现在必须是什么、不允许是什么 |
| A2 | [MVP 蓝图](blueprint-01-mvp-playable.md)、[多世界蓝图](blueprint-02-multi-world-simulation-foundation.md) | 当前范围、目标架构和 P0—P8 顺序 |
| A3 | [模拟架构](simulation-rewrite-architecture.md)、[系统权威索引](system-authority-index.md)、[QQ Bot 接口契约](qq-bot-integration-contract.md) | 系统归属、公开边界、写入权威、依赖和外部适配契约 |
| A4 | live types、运行策略、manifest、实现与生成注册表 | 实际执行的数据形状和运行成员 |
| A5 | [验收账本](acceptance-ledger.md)、自动检查与生产证据 | 功能是否按当前权威工作 |
| A6 | Git 历史、未选 UI 候选和已取代方案 | 为什么曾经这样做，不可作为当前指令 |

冲突按 A0 → A6 处理。低层实现、测试结果或历史记录不能覆盖更高层产品意图。

## 2. 按任务阅读

| 任务 | 最小阅读集合 |
|---|---|
| 修改产品语义或玩家流程 | 产品决策 → 对应蓝图 → 系统权威索引 |
| 新增、恢复、删除或重组模拟系统 | 多世界蓝图 → 模拟架构 → 系统权威索引 → live runtime policy |
| 修改 MOD、Foundation 或跨域字段 | 模拟架构 → 系统权威索引 → live types/manifest |
| 修改 Prompt、叙事协议或记忆压缩 | 产品决策 → 系统权威索引 → 验收账本对应章节 → live Prompt/Schema |
| 修改页面 | 产品决策 → `ui-prototypes/mobile/flow.html` 串联的定版原型 → live page |
| 修改 QQ Bot 联动或积分 | 产品决策 → 系统权威索引 → QQ Bot 接口契约 → live account routes/services |
| 诊断 Bug 或核对发布 | 系统权威索引 → 验收账本 → 自动检查、日志或生产运行态 |

## 3. 文档维护规则

1. 新产品决定写入 `product-decisions.md`，不新建日期型决策稿。
2. 阶段目标、顺序和完成状态写入对应蓝图，不另建执行计划副本。
3. 系统责任、启停、公开边界、AI 参与或持久化变化同步到 `system-authority-index.md`。
4. 跨系统架构规则只写入 `simulation-rewrite-architecture.md`；字段和接口细节以 live source 为准。
5. 验收结果追加到 `acceptance-ledger.md` 对应系统章节；详细命令输出、截图和逐轮流水作为临时证据或 Git 历史，不长期保留为活动文档。
6. 玩家版本变化只由 `public/changelog-*.txt` 与版本索引记录；文档整理、测试或注释变更不得生成玩家更新日志。
7. `docs/ui-prototypes/mobile/` 保存定版原型与候选比较证据，按 UI Skill 的原型治理规则单独维护，不纳入一般文档压缩。

## 4. 当前活动文档

| 文档 | 主要责任 |
|---|---|
| [产品决策](product-decisions.md) | 当前产品语义和绝对红线 |
| [MVP 蓝图](blueprint-01-mvp-playable.md) | 可玩主链范围和恢复边界 |
| [多世界蓝图](blueprint-02-multi-world-simulation-foundation.md) | 多上下文目标、系统处置与 P0—P8 执行顺序 |
| [模拟架构](simulation-rewrite-architecture.md) | BaseSubsystem、Foundation、字段、提交和生成接线契约 |
| [系统权威索引](system-authority-index.md) | 当前运行系统、平台服务、内部齿轮和延后系统的责任登记 |
| [QQ Bot 接口契约](qq-bot-integration-contract.md) | Bot 签名、白名单 DTO、QQ 绑定、共享积分和安全边界 |
| [验收账本](acceptance-ledger.md) | 当前有效验收结论、历史取代关系和发布证据摘要 |
