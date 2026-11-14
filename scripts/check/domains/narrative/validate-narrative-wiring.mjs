/**
 * Purpose: Validate the approved 01/02/03 narrative Prompt and execution wiring.
 * Owner: quality:narrative
 * Responsibility: Static call, asset, stage, and no-repair assertions only.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
let failed = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assertOk(condition, message) {
  if (condition) return
  console.error(`[FAIL] ${message}`)
  failed += 1
}

function sortedMatches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]).sort()
}

const promptBuilder = read('src/core/ai-service/prompt-builder.ts')
const narrativePrompt = read('src/mods/mod-engine/prompts/narrative-prompt.ts')
const continuityPrompt = read('src/mods/mod-engine/prompts/narrative-story-continuity-prompt.ts')
const talentPrompt = read('src/mods/mod-engine/prompts/narrative-talent-growth-prompt.ts')
const narrativeServer = read('src/mods/mod-engine/server/narrative-system-prompt.ts')
const proxyRoute = read('src/app/api/proxy/route.ts')
const worldCatalog = read('src/mods/mod-world/constants/presets/catalog.ts')
const continuityServer = read('src/mods/mod-engine/server/narrative-story-continuity-system-prompt.ts')
const talentServer = read('src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts')
const serverAssets = read('src/mods/mod-engine/server-prompt-assets.ts')
const campaign = read('src/mods/mod-engine/campaigns/default/index.ts')
const orchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const manifest = read('src/mods/mod-engine/manifest.ts')
const fetchExecutor = read('src/core/ai-service/ai-client/fetch-executor.ts')
const schemaValidation = read('src/core/ai-service/ai-client/schema-validation.ts')
const envelope = read('src/mods/mod-engine/helpers/tagged-meta-envelope.ts')
const protocol = read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts')
const quality = read('src/mods/mod-engine/helpers/narrative-response-quality.ts')
const mainNarrativeCall = read('src/mods/mod-engine/helpers/main-narrative-call.ts')
const httpTransport = read('src/core/ai-service/ai-client/http-transport.ts')
const cachePool = read('src/core/ai-service/cache-pool.ts')
const promptContextRuntime = read('src/mods/mod-engine/subsystems/orchestrator-system/prompt-context-runtime.ts')
const timelineProjectionRuntime = read('src/mods/mod-engine/subsystems/orchestrator-system/timeline-projection-runtime.ts')
const timelineMemory = read('src/mods/mod-engine/helpers/timeline-memory.ts')
const controlPlane = read('src/mods/mod-engine/helpers/narrative-control-plane.ts')
const controlPlaneInput = read('src/mods/mod-engine/helpers/narrative-control-plane-input.ts')
const controlPlaneCall = read('src/mods/mod-engine/helpers/narrative-control-plane-call.ts')
const eventNormalizer = read('src/mods/mod-engine/helpers/narrative-control-plane-normalizers.ts')

assertOk(
  promptBuilder.includes('userSegments: string[]')
    && promptBuilder.includes('const dataLayerSegment = JSON.stringify(input)')
    && promptBuilder.includes("名称: nonEmpty(rawWorld.名称) ?? ''")
    && promptBuilder.includes('描述: buildWorldDescription(context, rawWorld.描述)')
    && promptBuilder.includes('subsystemSummaries')
    && promptBuilder.includes('{ 世界: world }')
    && promptBuilder.includes('{ 玩家信息: character }')
    && promptBuilder.includes('{ 历史输出: { 事件: historicalEvents } }')
    && promptBuilder.includes('玩家本次点属性: buildNarrativeAttributes')
    && promptBuilder.includes('本次信息: {')
    && promptBuilder.includes('时间节点')
    && promptBuilder.includes('时间窗口')
    && promptBuilder.includes('篇幅偏好: nonEmpty(context.wordCountInstruction)')
    && promptBuilder.includes('叙事称呼: formatNarrativeAddressing(context.narrativeAddressing)')
    && promptBuilder.includes('文风偏好: nonEmpty(context.narrativeStyle)')
    && promptBuilder.includes('难度指引')
    && promptBuilder.includes("财富: '0'")
    && promptBuilder.includes('recentStories')
    && promptBuilder.includes('timelineMemory')
    && !promptBuilder.includes('当前人生状态')
    && !promptBuilder.includes('当前到期事件'),
  '01 必须只组装世界、玩家信息、历史输出、玩家本次点属性和本次信息五段动态数据',
)
assertOk(
  mainNarrativeCall.includes('prepareMainNarrativeRequest')
    && mainNarrativeCall.includes('executeMainNarrativeRequest')
    && [...mainNarrativeCall.matchAll(/callAIWithPromptTemplate\(/gu)].length === 1
    && !mainNarrativeCall.includes("name: 'submit_story_turn'")
    && !mainNarrativeCall.includes('toolChoice')
    && !mainNarrativeCall.includes('responseToolName')
    && mainNarrativeCall.includes('splitNarrativeBatchResponse')
    && mainNarrativeCall.includes('queuedResponses')
    && mainNarrativeCall.includes('故事批次')
    && promptContextRuntime.includes('narrativeBatchSize: 10')
    && promptBuilder.includes('最多${context.narrativeBatchSize}轮故事')
    && promptBuilder.includes('该轮即本批最后一项')
    && !fs.existsSync(path.join(ROOT, 'src/mods/mod-engine/helpers/narrative-pre-generation.ts')),
  '01 批次必须由正式主故事响应拆包，且不保留独立预生成入口',
)
assertOk(
    !mainNarrativeCall.includes('strict: true')
    && !mainNarrativeCall.includes('strictSchema: true')
    && envelope.includes('parseLifeSimulatorText')
    && envelope.includes('changesFromReportedAttributes')
    && envelope.includes('reportedAttributes')
    && !mainNarrativeCall.includes('toolChoice')
    && !mainNarrativeCall.includes('responseToolName'),
  '01 必须宽容解析人生重开文本、简写分支结局与状态行属性，不启用工具或额外严格请求',
)
assertOk(
  narrativePrompt.includes("version: '10.0.0'")
    && narrativePrompt.includes('mod-engine:narrative:10.0.0')
    && !narrativePrompt.includes('mod-engine:narrative:9.50.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.56.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.55.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.1.1')
    && continuityPrompt.includes("version: '3.2.0'")
    && talentPrompt.includes("version: '5.0.0'")
    && talentPrompt.includes('mod-engine:narrative-talent-growth:5.0.0')
    && [narrativePrompt, continuityPrompt, talentPrompt].every((source) => (
      source.includes("systemPrompt: ''") && source.includes('serverPromptAssetId:')
    )),
  '01/02/03 客户端契约必须绑定当前三个受保护资产版本',
)
assertOk(
  narrativeServer.includes('composeNarrativeUserMessage')
    && narrativeServer.includes('COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE')
    && narrativeServer.includes('你是人生模拟器')
    && narrativeServer.includes('角色是中心')
    && narrativeServer.includes('历史是已经发生的人生')
    && narrativeServer.includes('正文像人生小说的一章，不是因果报告')
    && narrativeServer.includes('允许概括、跳跃、留白')
    && narrativeServer.includes('“人生规划”和“事件卡池”只是软提示')
    && narrativeServer.includes('事件卡池只提供卡名')
    && narrativeServer.includes('属性只写发生持续变化的项')
    && narrativeServer.includes('事件卡消费（可选）')
    && narrativeServer.includes('天赋表现线索（可选）')
    && narrativeServer.includes('dynamic[0].世界')
    && narrativeServer.includes('dynamic[1].玩家信息')
    && narrativeServer.includes('dynamic[2].历史输出')
    && narrativeServer.includes('dynamic[3].玩家本次点属性')
    && narrativeServer.includes('dynamic[4].本次信息')
    && narrativeServer.includes('"正文": ""')
    && narrativeServer.includes('"命运分支": false')
    && narrativeServer.includes('"属性": {')
    && narrativeServer.includes('"财富": 0')
    && narrativeServer.includes('"结局": false')
    && narrativeServer.includes('"角色死亡": false')
    && narrativeServer.includes('故事批次')
    && narrativeServer.includes('命运分支：本轮自然形成')
    && narrativeServer.includes('结局：人生不可逆终态')
    && narrativeServer.includes('事件卡消费（可选）')
    && !narrativeServer.includes('事件结果是锁定本轮重要事实')
    && !narrativeServer.includes('正文是宏观事件记录')
    && !narrativeServer.includes('先形成改变玩家社会位置'),
  '01 必须按 V3A 职责区块编译角色、输入、写法、最小输出与动态数据',
)
const narrativePromptSections = ['# 角色', '# 输入', '# 写法', '# 输出'].map((section) => narrativeServer.indexOf(section))
assertOk(
  narrativePromptSections.every((position, index) => position >= 0
    && (index === 0 || position > narrativePromptSections[index - 1])),
  '主故事 Prompt 必须按角色、输入、写法、输出顺序组织',
)
assertOk(
  promptContextRuntime.includes('projectNarrativeResultForPrompt')
    && promptContextRuntime.includes('displayAge: entry.displayAge')
    && promptContextRuntime.includes('buildWorldStateSummaries')
    && timelineMemory.includes('formatAgePrefixedStory')
    && timelineMemory.includes('endingSummary')
    && !timelineMemory.includes('已结束事件身份：')
    && !timelineMemory.includes('eventResults')
    && timelineProjectionRuntime.includes('displayAge: time?.displayAge')
    && timelineProjectionRuntime.includes("orchestrator['resolveNarrativeRoundTime'](entry.sortRound)?.displayAge")
    && !promptContextRuntime.includes('return `${ageLabel}·${timeLabel}·第${round}轮：${text}`')
    && !timelineMemory.includes('已结算现实结果：')
    && !timelineMemory.includes('已结算事实：'),
  '01 历史读取投影必须只保留正文与发生年龄前缀，不附加事件账本或结算标签',
)
assertOk(
  serverAssets.includes("delivery: 'composed-user'")
    && serverAssets.includes('composeUserMessage: composeNarrativeUserMessage')
    && !serverAssets.includes('COMPILED_NARRATIVE_SYSTEM_PROMPT')
    && proxyRoute.includes("promptAsset.delivery === 'composed-user'")
    && proxyRoute.includes("role: 'user'")
    && proxyRoute.includes('promptAsset.composeUserMessage')
    && proxyRoute.includes("{ role: 'system', content: promptAsset.systemPrompt }"),
  '01 主故事必须在服务端合成唯一 user 消息，02/03 继续使用各自 system 资产',
)
assertOk(
  worldCatalog.includes("name: '烬海诸邦'")
    && worldCatalog.includes("name: '远星航标'")
    && !worldCatalog.includes('霍格沃茨')
    && !worldCatalog.includes('SCP基金会')
    && !worldCatalog.includes('斗气大陆'),
  '世界预设应使用原创题材，避免直接采用存在版权争议的作品设定',
)
assertOk(
    continuityServer.includes('你是人生模拟器的故事连续性提取器。')
    && continuityServer.includes('本轮剧情')
    && continuityServer.includes('未来事件')
    && continuityServer.includes('待压缩五轮正文')
    && continuityServer.includes('来源回合')
    && continuityServer.includes('长期影响7至9')
    && !continuityServer.includes('故事状态提取器')
    && !continuityServer.includes('本轮记忆')
    && talentServer.includes('你是天赋进阶路线生成器。')
    && continuityServer.includes('未来事件')
    && talentServer.includes('深度强化、广度强化、转变强化')
    && talentServer.includes('机缘已经由程序确认')
    && talentServer.includes('三条路线都必须保留当前已经成立的核心能力')
    && talentServer.includes('不默认叠加历代能力')
    && !talentServer.includes('每条路线保留同一命格的核心来源')
    && !talentServer.includes('不额外扩大影响总量')
    && talentServer.includes('首句直接落到能力机制、触发条件、动作、可观察结果或世界反馈')
    && talentServer.includes('模板化起句')
    && talentServer.includes('长期积累')
    && talentServer.includes('机缘类型')
    && !talentServer.includes('明确契机')
    && !talentServer.includes('证据链最完整')
    && !talentServer.includes('突破契机最明确')
    && !talentServer.includes('直接证据三要素')
    && talentServer.includes('资质阶位原样保留')
    && talentServer.includes('二至六个汉字')
    && talentServer.includes('禁止返回不成长')
    && !talentServer.includes('不得转为直接')
    && !talentServer.includes('禁止直接操控'),
  '三个固定 Prompt 分别承担故事、连续性和成长职责，03 只推进开发阶段且保留已有能力',
)

const registeredAssetIds = sortedMatches(serverAssets, /^\s*\[(NARRATIVE(?:_[A-Z]+)*_SERVER_PROMPT_ASSET_ID)\]:/gmu)
assertOk(
  JSON.stringify(registeredAssetIds) === JSON.stringify([
    'NARRATIVE_SERVER_PROMPT_ASSET_ID',
    'NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID',
    'NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID',
  ].sort()),
  '服务端资产注册表必须恰好登记 01/02/03 三个 Prompt',
)

const aiStages = sortedMatches(campaign, /name: '(ai-[^']+)'/gu)
assertOk(
  JSON.stringify(aiStages) === JSON.stringify([
    'ai-narration',
    'ai-story-continuity',
    'ai-talent-growth',
  ].sort()),
  'Campaign 必须恰好包含 01 主故事和 02/03 两个专项阶段',
)
assertOk(
  campaign.includes("name: 'prepare-narrative'")
    && campaign.includes("name: 'commit-round'")
    && campaign.includes("name: 'finalize-round'")
    && /name: 'ai-story-continuity'[\s\S]{0,220}dependsOn: \['prepare-narrative'\][\s\S]{0,120}parallelGroup: SPECIALIST_PARALLEL_GROUP/u.test(campaign)
    && /name: 'ai-talent-growth'[\s\S]{0,220}dependsOn: \['prepare-narrative'\][\s\S]{0,120}parallelGroup: SPECIALIST_PARALLEL_GROUP/u.test(campaign)
    && campaign.includes("ctx._talentInput.eligiblePatterns.length === 0")
    && campaign.includes('getRoundContextSnapshot')
    && campaign.includes('totalBasePoints: roundContext.totalBasePoints')
    && /name: 'commit-round'[\s\S]{0,220}dependsOn: \[\s*'ai-story-continuity',\s*'ai-talent-growth',?\s*\]/u.test(campaign)
    && campaign.includes('getPendingNarrativeBatch()')
    && campaign.includes('consumePendingNarrativeBatch(')
    && campaign.includes('setPendingNarrativeBatch(')
    && campaign.includes('clearPendingNarrativeBatch()'),
  '正文发布后必须并行执行 02/03，并由 commit-round 唯一汇合',
)
assertOk(
  ['ai-narration', 'prepare-narrative', 'ai-story-continuity', 'ai-talent-growth', 'commit-round', 'finalize-round']
    .every((stage) => manifest.includes(`'${stage}'`))
    && sortedMatches(manifest, /'(ai-[^']+)'/gu).join('|') === aiStages.join('|'),
  'Manifest 必须与 Campaign 的三个 AI 阶段唯一对齐',
)

const promptContracts = fs.readdirSync(path.join(ROOT, 'src/mods/mod-engine/prompts'))
  .filter((name) => /^narrative(?:-[a-z-]+)?-prompt\.ts$/u.test(name))
  .filter((name) => !['narrative-analysis-output-prompt.ts', 'narrative-prompt-components.ts'].includes(name))
  .sort()
const serverContracts = fs.readdirSync(path.join(ROOT, 'src/mods/mod-engine/server'))
  .filter((name) => /^narrative(?:-[a-z-]+)?-system-prompt\.ts$/u.test(name))
  .sort()
assertOk(
  JSON.stringify(promptContracts) === JSON.stringify([
    'narrative-prompt.ts',
    'narrative-story-continuity-prompt.ts',
    'narrative-talent-growth-prompt.ts',
  ].sort())
    && JSON.stringify(serverContracts) === JSON.stringify([
      'narrative-story-continuity-system-prompt.ts',
      'narrative-system-prompt.ts',
      'narrative-talent-growth-system-prompt.ts',
    ].sort()),
  '运行时叙事 Prompt 资产文件必须只剩 01/02/03',
)
assertOk(
  protocol.includes('NarrativeAIStoryContinuityDataSchema')
    && protocol.includes('NarrativeAITalentGrowthDataSchema')
    && !protocol.includes('NarrativeAIEventLibraryResultSchema')
    && !quality.includes('inspectNarrativeEventLibraryQuality')
    && !protocol.includes('NarrativeAIWorldSimulationResultSchema')
    && !quality.includes('inspectNarrativeWorldSimulationQuality')
    && protocol.includes('min(2).max(4)')
    && !protocol.includes('系统操作')
    && !quality.includes('系统操作')
    && !quality.includes('剧情进度')
    && !quality.includes('到期候选判定'),
  '协议与质量检查必须只保留 01/02/03 的输出职责',
)
assertOk(
  cachePool.includes("'narrative-main'")
    && cachePool.includes("'narrative-story-continuity'")
    && cachePool.includes("'narrative-talent-growth'")
    && !cachePool.includes("'narrative-event-library'")
    && sortedMatches(cachePool, /^\s*'((?:narrative)-(?:main|story-continuity|talent-growth))',?$/gmu).length === 3,
  '叙事缓存池必须恰好隔离 01/02/03',
)
assertOk(
  fetchExecutor.includes('const result = await fetchAttempt()')
    && fetchExecutor.includes('A single transport attempt only')
    && !fetchExecutor.includes('for (let attempt')
    && !fetchExecutor.includes('retryResult')
    && schemaValidation.includes('never starts another AI request')
    && !schemaValidation.includes('callAI('),
  '每次逻辑调用必须零重试、零格式修复、零备用请求',
)
assertOk(
  envelope.includes('parseNarrativeResponseEnvelope')
    && envelope.includes('isExplicitPermanentNoAgency')
    && envelope.includes('extractTaggedFields'),
  '01 宽容解析必须继续支持正文、分支和结局的既有恢复边界',
)
const eventRefreshStart = orchestrator.indexOf('private scheduleNarrativeEventPoolRefresh')
const eventRefreshEnd = orchestrator.indexOf('\n  /**', eventRefreshStart)
const eventRefresh = eventRefreshStart >= 0 && eventRefreshEnd > eventRefreshStart
  ? orchestrator.slice(eventRefreshStart, eventRefreshEnd)
  : ''
assertOk(
  orchestrator.includes("const parallelKinds = ['plan', 'timeline', 'event'] as const")
    && orchestrator.includes('await Promise.all(parallelKinds.map(async (kind) =>')
    && orchestrator.includes('prepared.triggers.find((item) => item.kind === kind)')
    && orchestrator.includes('this.scheduleNarrativeEventPoolRefresh({')
    && orchestrator.includes('this.state.pendingNarrativeBatch.length > 0 ? { suppressEventRefill: true }')
    && controlPlaneInput.includes('suppressEventRefill?: boolean')
    && orchestrator.indexOf('commitPlan(entry.value') < orchestrator.indexOf('commitTimeline(entry.value')
    && orchestrator.indexOf('commitTimeline(entry.value') < orchestrator.indexOf('commitEvents(entry.value')
    && /try \{\s*this\.narrativeControlPlane\.commitPlan\(entry\.value[\s\S]{0,400}?conditional-call-deferred/u.test(orchestrator)
    && eventRefresh.includes('void executeNarrativeControlCall({')
    && eventRefresh.includes('pendingNarrativeEventPoolRefreshes')
    && eventRefresh.includes('.then(({ value }) =>') && eventRefresh.includes('generation !== this.narrativeControlGeneration')
    && eventRefresh.includes('lifeRunId !== this.state.lifeRunId') && eventRefresh.includes('currentFingerprint !== input.fingerprint')
    && controlPlane.includes('if (this.currentFingerprint !== fingerprint) return false')
    && controlPlane.includes('isCardAvailableFor') && !controlPlane.includes('drawEventHand')
    && !/kind: 'event'[\s\S]{0,200}?hasCurrentPlan/u.test(controlPlane)
    && controlPlane.includes('!input.suppressEventRefill')
    && /this\.state\.eventPoolFingerprint !== fingerprint \|\| rawPool\.length === 0/u.test(controlPlane)
    && !controlPlane.includes('最低合龄') && !eventNormalizer.includes('最低合龄') && !controlPlaneCall.includes('最低合龄')
    && !read('src/foundation/types/narrative/control-plane.ts').includes('最低合龄')
    && controlPlaneInput.includes("NARRATIVE_EVENT_POOL_VERSION = '3.0.0'")
    && controlPlaneInput.includes("NARRATIVE_PLAN_VERSION = '1.1.0'")
    && orchestrator.includes("input.context.difficulty ?? 'normal'")
    && eventNormalizer.includes('EVENT_CARD_NAME_MIN') && eventNormalizer.includes('EVENT_CARD_NAME_MAX')
    && eventNormalizer.includes('EVENT_CARD_POLARITIES') && eventNormalizer.includes('seenNames.has(nameKey)')
    && eventNormalizer.includes('boundedWeight(card.权重)')
    && !eventNormalizer.includes('生命周期') && !eventNormalizer.includes('适用阶段')
    && eventNormalizer.includes('名称: name')
    && protocol.includes('事件卡消费')
    && envelope.includes('eventCardsConsumed')
    && campaign.includes('commitNarrativeControlPlaneOutcome(ctx._narrativeParsed?.事件卡消费)'),
  '事件卡池异步补充且拒绝过期写入，首轮 plan/timeline/event 并行并按 plan→timeline→event 提交，规划诊断错误延后不阻断回合，入池只保留名称、正负与权重',
)
const eventPoolProjectionStart = promptBuilder.indexOf('const eventCards = controlPlane.eventCards')
const eventPoolProjectionEnd = promptBuilder.indexOf('事件卡池: eventCards', eventPoolProjectionStart)
const eventPoolProjection = eventPoolProjectionStart >= 0 && eventPoolProjectionEnd > eventPoolProjectionStart
  ? promptBuilder.slice(eventPoolProjectionStart, eventPoolProjectionEnd)
  : ''
assertOk(
  eventPoolProjection.includes('.map((card) => nonEmpty(card.名称))')
    && eventPoolProjection.includes('.filter((name): name is string => Boolean(name))')
    && !/正负|权重|最低合龄|sourceFingerprint|card\.id/u.test(eventPoolProjection),
  '事件卡池只投影 2–8 字卡名，正负、权重、最低合龄、id 与来源指纹不得进入模型输入',
)
assertOk(
  orchestrator.includes('commitNarrativeControlPlaneOutcome(consumedEventNames?: readonly string[])')
    && orchestrator.includes('const consumed = new Set(')
    && orchestrator.includes('.filter((card) => consumed.has(card.名称))')
    && orchestrator.includes('.map((card) => card.id)')
    && orchestrator.includes('eventCardPool')
    && controlPlane.includes('const selectedEventIdSet = new Set(selectedEventIds)')
    && controlPlane.includes('!selectedEventIdSet.has(item.id)'),
  '主故事返回的事件卡名必须先在池内映射成 id 再扣除，池外卡名不扣也不采纳',
)
assertOk(
  narrativeServer.includes('一次最多返回 10 轮')
    && narrativeServer.includes('遇到命运分支、结局或人生阶段结束时停止')
    && promptContextRuntime.includes('narrativeBatchSize: 10')
    && promptBuilder.includes('最多${context.narrativeBatchSize}轮故事')
    && mainNarrativeCall.includes('const MAX_NARRATIVE_BATCH_ROUNDS = 10') && mainNarrativeCall.includes('export function splitNarrativeBatchResponse(')
    && mainNarrativeCall.includes('items.slice(0, limit)') && mainNarrativeCall.includes('批量故事包被截断且无法回收任何完整故事项')
    && read('src/core/ai-service/ai-call-deadline.ts').includes('batchRounds') && read('src/app/api/proxy/route/contracts.ts').includes('batchRounds')
    && campaign.includes('if (ctx._narrativeParsed.branch || ctx._narrativeParsed.endingTitle)')
    && campaign.includes('clearPendingNarrativeBatch()')
    && campaign.includes('consumePendingNarrativeBatch('),
  '批量上限必须为 10 轮：数组截断到 10、时限随 batchRounds 放大、截断回收完整前项，遇分支/结局/阶段结束立即停止',
)
assertOk(
  narrativeServer.includes('玩家行动是尝试，不是命令')
    && narrativeServer.includes('可以成功、失败、延迟、转化或产生意外')
    && narrativeServer.includes('未知不补')
    && narrativeServer.includes('自然寿命参考年龄只是背景，不是死亡线'),
  '自定义命运输入必须保留为尝试，由角色条件与世界规则自然裁决',
)

if (failed > 0) {
  console.error(`\n叙事接线验证失败: ${failed} 项`)
  process.exit(1)
}

console.log('[OK] 01 主故事与并行 02/03 接线验证通过')
