# 叙事压缩运行核验（2026-07-18）

## 目的

从开发者视角核对核心模拟的叙事编排器、AI 返回结构、摘要账本、延迟压缩和 Prompt 注入是否与当前产品权威一致。

## 当前真实链路

1. `narrativePrompt` 要求 AI 输出 `[NARRATIVE]` 三段正文和 `[META]` JSON。真实推进与预生成都由 `NarrativeResponseSchema` 验证 `digest`、`keyEvents[].importance`、`keyEvents[].entities`、`arcStatus` 与语义字段；缺失字段不能进入有效回合。
2. `orchestrator.handleNarrativeResponse()` 只在整包 META 通过后把 `digest` 与带权事件写入 `digestLedger`，并把整轮 `importance` 写入记忆生命周期索引。账本保存原始分值、连锁回溯后的修正分值和时间衰减结果。
3. L1 每 10 轮一个块，并延迟一个完整块：第 21 轮整理第 1—10 轮，第 31 轮整理第 11—20 轮。压缩任务在后台串行执行，下一次真实推进会先等待上一轮压缩提交。
4. 延迟区间使用最近 20 轮完整原文作为 L0；L1 尚未生成时不会把中间轮次从 Prompt 中删掉。富 Prompt 同时注入近期 L1、最近可用的 L2/L3/L4、L6/最高层纲要、检索命中和 L0 原文。
5. L1 Prompt 同时接收每轮原文、`digest`、整轮重要性和带权 `keyEvents`。权重用于保留优先级：高分事件单独保留，低分事件允许折叠；摘要器仍只能总结正文已明确发生的事实。
6. L2—L6 生成后写入检索索引，并从已建立的低层索引继承实体标签与最高重要度；L1 清理原始 TaggedEvent 不会让远期摘要失去实体召回。

## 冒烟验证

执行：

```text
npm run test:compression-runtime
npm run validate:narrative
npm run validate:regression
node scripts/check/domains/narrative/playtest-quality-regression.mjs
node scripts/check/domains/narrative/runtime-subsystem-state-regression.mjs
```

覆盖结果：

- 缺少 `digest` 的 META 被拒绝；缺少单事件 `importance` 的 META 被拒绝。
- 高权重事件在账本 Prompt 选择中保持逐条可见，低权重事件进入折叠路径。
- 第 20 轮不提前压缩，第 21 轮覆盖 1—10 轮，第 31 轮覆盖 11—20 轮。
- 生产记忆组装使用延迟安全的 20 轮完整原文窗口。
- 即使叙事历史达到 200 轮保留上限，L1 仍按事件真实轮次 ID 选取目标块，不会因滑动窗口起点变化而错压当前轮次。
- 高层摘要索引接线存在，L1 清理边界仍以实际新生成的覆盖范围为准。

## 结论

当前压缩系统已按 `PD-014` 对齐：字段先经过完整 Schema，摘要账本保留每事件权重，延迟窗口不丢中间叙事，压缩层级可继续检索。`check:mod` 的历史扫描基线仍是独立的遗留问题，不属于本次压缩链路回归。
