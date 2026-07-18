# 叙事压缩运行核验（2026-07-18）

文档角色：acceptance
权威层级：A5
状态：active
适用范围：主叙事 META、摘要账本、L1-L6 延迟压缩、长期记忆注入与无硬截断回归
拥有者：`mod-engine` 叙事编排、摘要压缩与记忆生命周期
最后验证：2026-07-18；no-hard audit、压缩/叙事/回归/Prompt/校准、结构、lint、TypeScript、完整 gate 与生产 build 均通过
取代关系：取代旧的固定历史窗口、占位摘要覆盖和摘要字符上限验收口径
运行真源：live Prompt、Schema、parser/interceptor、RoundCommit、summary-compressor、memory-lifecycle
验收证据：`test:compression-runtime`、no-hard-truncation audit、narrative/regression/gate/build

## 目的

从开发者视角核对核心模拟的叙事编排器、AI 返回结构、摘要账本、延迟压缩和 Prompt 注入是否与当前产品权威一致。

## 当前真实链路

1. `narrativePrompt` 要求 AI 输出 `[NARRATIVE]` 三段正文和 `[META]` JSON。解析器只做结构映射并保留完整变更数组；`NarrativeResponseSchema`、严格字段 Schema 与拦截器负责整包判定，不允许先过滤非法项再提交剩余项。
2. `RoundCommit` 在任何子系统写入前完成整包预检；未知、不可写或非法目标会拒绝整个 META。意外出现提交失败时，orchestrator 恢复提交前子系统快照，并且不写入 `digestLedger`、关系、伏笔、原创或其他部分 META，只保留正文。
3. L1 每 10 轮一个块，并延迟一个完整块：第 21 轮整理第 1—10 轮，第 31 轮整理第 11—20 轮。压缩任务在后台串行执行，下一次真实推进会先等待上一轮压缩提交。
4. 延迟区间使用最近 20 轮完整原文作为 L0；L1 尚未生成时不会把中间轮次从 Prompt 中删掉。富 Prompt 按覆盖区间注入未被更高层摘要覆盖的 L1—L6 叶子摘要、检索命中和 L0 原文，不再固定只取 L1×2、L2/L3/L4×1。
5. L1 Prompt 同时接收每轮原文、`digest`、整轮重要性和带权 `keyEvents`。所有层级允许合并重复表达，但不得设置字符上限、逐层缩小硬 token 上限或省略独立事实。
6. 每次 AI 摘要只有在返回 `[SUMMARY_COMPLETE]` 且正文非空后才能建立覆盖节点。L2—L6 缺标记、空结果或调用失败时不追加摘要、不增加统计，完整保留全部低层叶子等待重试；禁止使用仅含轮次的占位“概略”。
7. 成功的 L2—L6 摘要写入检索索引，并从已建立的低层索引继承实体标签与最高重要度；L1 清理原始 TaggedEvent 不会让远期摘要失去实体召回。

## 冒烟验证

执行：

```text
npm run test:compression-runtime
npm run validate:narrative
npm run validate:regression
node scripts/check/domains/narrative/no-hard-truncation-audit.mjs
node scripts/check/domains/narrative/playtest-quality-regression.mjs
node scripts/check/domains/narrative/runtime-subsystem-state-regression.mjs
npm run gate-check
npm run build
```

覆盖结果：

- 缺少 `digest` 的 META 被拒绝；缺少单事件 `importance` 的 META 被拒绝。
- “合法 morality 变更 + 非法系统变更”的混合包在解析后仍保留两项，并由拦截器整包拒绝；契约外字段也不能被静默剥离后部分提交。
- 高权重事件在账本 Prompt 选择中保持逐条可见，低权重事件进入折叠路径。
- 第 20 轮不提前压缩，第 21 轮覆盖 1—10 轮，第 31 轮覆盖 11—20 轮。
- 生产记忆组装使用延迟安全的 20 轮完整原文窗口。
- 叙事历史不再存在 200 轮容量淘汰；L1 始终按事件真实轮次 ID 选取目标块。
- 摘要账本超过旧 500 条边界仍完整保留，分层摘要通过覆盖区间选择叶子节点，不按固定条数截掉历史。
- 硬截断审计覆盖摘要字符上限、逐层缩小 token 上限、压缩失败占位覆盖、解析前过滤、提交前预检/回滚、核心记忆覆盖证明、完整遗忘理由、死后叙事字数范围、NPC 固定年限删除、历史事件池过滤、因果队列容量与艺术流派随机淘汰。
- 主叙事 Prompt 与 Zod/JSON Schema 已取消 digest、keyEvents、entities、关系变化、伏笔、原创内容等字符或条数上限；Prompt 版本升级为 `2.8.0`，避免在生成源头诱导省略或因完整语义包超限而整包失效。
- 外围 MOD 的天象、纪元、地理、外交、NPC 行为/记忆、因果锚点、文化价值、艺术流派/作品与地图关系固定容量已纳入同一审计，即使当前未进入 MVP 运行名单也不得保留破坏性淘汰。
- 高层摘要索引接线存在，L1 清理边界仍以实际新生成的覆盖范围为准。
- `.agents` 插件结构、治理层级、33 份活跃文档引用与 Pi 工具测试通过；官方 Python 插件/Skill 校验器因当前环境缺少 `PyYAML` 未运行，不代表内容失败。
- `npm run check:mod` 仍报告既有 80 项历史扫描问题，本轮没有增加数量；完整 gate 当前不包含 mod profile，因此不能把该历史基线描述为全绿。

## 结论

当前实现已按 `PD-014` 与 `PD-015` 收口并通过本轮交付验证：完整 META 整包判定与回滚、摘要完成标记、失败保留低层叶子、原始历史完整保存、延迟叶子覆盖和长期检索均有代码、确定性用例与自动审计。唯一非绿项是项目既有的 `check:mod` 80 项历史扫描基线，未因本轮增加。
