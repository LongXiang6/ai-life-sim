# 2026-07-10 测试问题修复实施计划

> 当前命格首屏实施以 [`PD-013`](../../product-decisions.md#pd-013-ai-命格首屏三路并发与十条批量) 为准。本计划第三批中的“12 条”“首屏只启动一路/不并发”是历史实施记录，已被用户于 2026-07-18 明确提出的“三路并发、每路 10 条、满 5 条即用”取代；执行时必须同步实现、测试和验收文档。

## 约束

- 不改变存档结构、模型/鉴权或依赖；AI 命格批次数量的 schema 长度按 `PD-013` 明确版本化为每批 10 条。
- `mod-engine` 继续作为时间、预生成、解析和 Prompt 组装权威源。
- `mod-culture` 只增加轻量节日历法适配器，不启用 `CultureSystem` 或其他 dormant 系统。
- 所有 Bug 先写失败回归，再做最小实现。

## 第一批：回归入口与时间/预生成竞态

1. 新建 `scripts/check/domains/narrative/playtest-quality-regression.mjs`，覆盖：
   - 预生成失效不等于执行结束。
   - 年切季/月/日与月切季的下一周期语义。
   - malformed 标签信封恢复。
   - 命格绝对年份/传记事件拒绝。
   - 命格首屏三路并发、每路 10 项、满 5 条有效去重候选即交接；`PD-001`/`PD-013` 持续等待语义、最新叙事无专属底色、力量体系相关性裁剪。
2. 修改 `scripts/check/domains.mjs`，把新回归接入 narrative 域。
3. 新建 `src/mods/mod-engine/helpers/pre-gen-activity-state.ts`，把“代次是否有效”和“后台执行是否仍在运行”拆开。
4. 修改 `src/mods/mod-engine/helpers/pre-gen-queue.ts`：
   - `clearPreGenQueue()` 只失效结果，不谎报后台执行已经结束。
   - stale preview 完成前，主推进继续等待单写者释放。
   - stale preview 收尾从 store 恢复时保留步长切换来源。
5. 修改 `src/mods/mod-engine/helpers/simulation-time-api.ts` 与 `src/mods/mod-engine/hooks.ts`：
   - 预生成执行中，步长选择先写权威 store，不直接改正在预览的 orchestrator。
   - 主推进等待预览退出后再同步 context、timeStep 与运行状态。
6. 修改 `src/mods/mod-engine/subsystems/orchestrator-system.ts`：
   - 迁移为 `extends BaseSubsystem`。
   - 不改变持久化 snapshot；正常预览恢复沿用运行态待对齐来源。
   - stale preview 通过 `hydrateFromEngineStore(previousTimeStep)` 重建粗到细的待对齐状态。

## 第二批：叙事解析完整性

1. 新建 `src/mods/mod-engine/helpers/tagged-meta-envelope.ts`：
   - 支持正常闭合标签。
   - 支持第二个 `[NARRATIVE]` 被模型误写成结束标签。
   - 支持由 `[META]` 直接结束正文。
   - 支持缺少 `[/META]` 时按字符串/转义感知恢复首个完整 JSON 对象。
2. 修改 `src/mods/mod-engine/helpers/parse-strategies.ts`，L0 策略统一使用上述信封提取器；schema 与后续降级链不变。

## 第三批：命格首屏速度与语义（历史计划，当前以 PD-013 为准）

1. 修改 `src/mods/mod-character/constants.ts`：每路批大小改为 10，后台默认 10 批、目标约 100 条；首屏三路并发，满 5 条有效去重候选即交接，不增加页面级超时，等待语义以 [`PD-001`](../../product-decisions.md#pd-001-ai-命格抽取等待与兜底) 与 [`PD-013`](../../product-decisions.md#pd-013-ai-命格首屏三路并发与十条批量) 为准。
2. 修改 `src/mods/mod-character/prompts/destiny-pattern-prompt.ts`：
   - 固定每路生成 10 条。
   - 描述改为无时间、无履历的稳定特质/机制定义。
   - 删除“第一次”“未来会”等事件型 few-shot，压缩输入体积。
3. 修改 `src/mods/mod-character/utils/destiny-pattern-content-quality.ts`，拒绝绝对年份、年龄事件、过去履历与具体人生事件。
4. 修改 `src/mods/mod-character/subsystems/destiny-pattern-system.ts`：
   - 迁移为 `extends BaseSubsystem`。
   - 首屏启动三路独立流式 10 项请求；累计 5 条有效去重候选后立即交接，不等待最慢请求。
   - 其余首屏请求完成后再串行后台补池；三路都无效时继续单路请求，不混入预设。
5. 修改 `src/mods/mod-pages/pages/talent-draw/page.tsx`：AI 模式持续等待 5 条合格 AI 命格，离页时中止未完成任务；预设只保留在显式关闭 AI 的分支。

## 第四批：时间视角、分叉、节日历法与 Prompt 精简

1. 修改 `src/mods/mod-engine/helpers/time-scale-narrative.ts`，明确年/季/月/日四级镜头与叙事范围，删除会跨粒度误导的统一宏观措辞。
2. 修改 `src/mods/mod-engine/prompts/narrative-prompt.ts`：
   - 分叉只允许身份、核心关系、长期目标、关键资源、阵营、存亡或不可逆轨迹变化。
   - `branch=true` 必须对应 HIGH 级转折；普通日常写进正文，不生成选择。
   - 压缩重复示例，保持输出 schema 不变。
3. 修改 `src/mods/mod-engine/subsystems/orchestrator-system.ts`：
   - 非强制分支只有 HIGH 级、至少两个有效选项才落地。
   - 非超凡世界不发送力量阶位全文；超凡世界使用现有 narrative 精简阶位函数。
   - 时间导演提示只注入当前粒度和历法上下文。
4. 新建 `src/mods/mod-culture/utils/festival-calendar.ts` 与 `src/mods/mod-culture/calendar-context.ts`，精确匹配已配置节日的月/日并生成简短提示；不读取硬编码模板池。
5. 修改 `src/mods/mod-culture/index.ts` 暴露历法上下文函数；`mod-engine` 通过现有 Remote Interface 可选读取，避免静态反向依赖。
6. 新建 `src/mods/mod-engine/helpers/calendar-narrative-context.ts`：无节日配置时仍要求 AI 结合世界设定、地区、节假日、学期/假期和工作日判断合理性。

## 第五批：UI 与验证

1. 修改 `src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx` 与 `NarrativeTimeline.module.css`，移除 `entryLatest` 专属底色和无用 class。
2. 运行：
   - `node scripts/check/domains/narrative/playtest-quality-regression.mjs`
   - `node scripts/check/domains/narrative/time-step-resolver-smoke.mjs`
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run gate-check`
3. 记录修复前后 Prompt 字符数、首屏请求数/目标输出条数，以及九项需求逐条完成度。
