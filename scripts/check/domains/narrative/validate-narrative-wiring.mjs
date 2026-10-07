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
const manifest = read('src/mods/mod-engine/manifest.ts')
const fetchExecutor = read('src/core/ai-service/ai-client/fetch-executor.ts')
const schemaValidation = read('src/core/ai-service/ai-client/schema-validation.ts')
const envelope = read('src/mods/mod-engine/helpers/tagged-meta-envelope.ts')
const protocol = read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts')
const quality = read('src/mods/mod-engine/helpers/narrative-response-quality.ts')
const mainNarrativeCall = read('src/mods/mod-engine/helpers/main-narrative-call.ts')
const httpTransport = read('src/core/ai-service/ai-client/http-transport.ts')
const preGenerationPath = path.join(ROOT, 'src/mods/mod-engine/helpers/narrative-pre-generation.ts')
const preGeneration = fs.existsSync(preGenerationPath) ? fs.readFileSync(preGenerationPath, 'utf8') : ''
const cachePool = read('src/core/ai-service/cache-pool.ts')
const promptContextRuntime = read('src/mods/mod-engine/subsystems/orchestrator-system/prompt-context-runtime.ts')
const timelineProjectionRuntime = read('src/mods/mod-engine/subsystems/orchestrator-system/timeline-projection-runtime.ts')
const timelineMemory = read('src/mods/mod-engine/helpers/timeline-memory.ts')

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
    && !mainNarrativeCall.includes("name: 'submit_story_turn'")
    && !mainNarrativeCall.includes('toolChoice')
    && !mainNarrativeCall.includes('responseToolName')
    && mainNarrativeCall.includes("'real' | 'preview'")
    && preGeneration.includes('createNarrativeProjection()')
    && preGeneration.includes("executeMainNarrativeRequest(request, 'preview'")
    && preGeneration.includes('candidate.fingerprint !== request.fingerprint')
    && !preGeneration.includes('executeRoundV2('),
  '01 必须由正式回合或隔离的下一轮正文预生成复用同一请求契约，且不得恢复整轮预览旁路',
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
  narrativePrompt.includes("version: '9.26.0'")
    && narrativePrompt.includes('mod-engine:narrative:9.26.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.79.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.56.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.55.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.1.1')
    && continuityPrompt.includes("version: '3.1.0'")
    && talentPrompt.includes("version: '3.7.0'")
    && talentPrompt.includes('mod-engine:narrative-talent-growth:3.7.0')
    && [narrativePrompt, continuityPrompt, talentPrompt].every((source) => (
      source.includes("systemPrompt: ''") && source.includes('serverPromptAssetId:')
    )),
  '01/02/03 客户端契约必须绑定当前三个受保护资产版本',
)
assertOk(
  narrativeServer.includes('composeNarrativeUserMessage')
    && narrativeServer.includes('COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE')
    && narrativeServer.includes("生成一段新的、已经发生并留下结果的人生记录")
    && narrativeServer.includes("正文是广角人生记录，不是连续小说、事项清单、家庭影响报告或单一现场的动作回放")
    && narrativeServer.includes("历史只提供已经成立的事实、来源、关系、身份、资源和后果，不提供本轮主题、续写顺序、段落结构或文风")
    && narrativeServer.includes("你是以玩家人生与世界交互为主体的文字游戏式人生重开模拟器")
    && narrativeServer.includes("面对非标准世界观")
    && narrativeServer.includes("陌生表达不套用现实默认规则")
    && narrativeServer.includes("世界按自己的规则、资源边界、相关者行动和开放可能性变化")
    && narrativeServer.includes("家庭只能作为玩家的背景、资源、关系或处境，不能把家庭成员的工作、搬迁、收入、手续或家庭存续写成替代玩家人生的主线")
    && narrativeServer.includes("玩家是事件身份、因果主线和正文重心的归属者")
    && narrativeServer.includes("即使玩家处于幼年或依赖阶段，也要通过合龄的感知、移动、学习、游戏、依恋、恐惧、社交、观察或选择进入因果")
    && narrativeServer.includes("先形成会作用于玩家的新外部局面")
    && narrativeServer.includes("事件结果是正文唯一的事实底稿")
    && narrativeServer.includes("正文使用第二人称“你/你的”")
    && narrativeServer.includes("细节必须服务玩家的行动、位置、关系、结果或代价")
    && narrativeServer.includes("空间、环境、光线、声音、触感、气味、物件位置或人物反应")
    && narrativeServer.includes("本次调用内依次完成")
    && narrativeServer.includes("每项“事件结果”只含“事件”“成因”“结果”“影响”四个字符串")
    && narrativeServer.includes('dynamic[0].世界')
    && narrativeServer.includes('dynamic[1].玩家信息')
    && narrativeServer.includes('dynamic[2].历史输出')
    && narrativeServer.includes('dynamic[3].玩家本次点属性')
    && narrativeServer.includes('dynamic[4].本次信息')
    && narrativeServer.includes("篇幅偏好: '正文约100字。'")
    && narrativeServer.includes('时间窗口')
    && narrativeServer.includes('"正文": ""')
    && narrativeServer.includes('"命运分支": false')
    && narrativeServer.includes('"属性": {')
    && narrativeServer.includes('"时间定位": ""')
    && narrativeServer.includes('"事件结果": [')
    && narrativeServer.includes('"财富": 0')
    && narrativeServer.includes('"结局": false')
    && narrativeServer.includes("每项“事件结果”只含“事件”“成因”“结果”“影响”四个字符串")
    && narrativeServer.includes("正文选择最能证明玩家经历、位置或关系改变且最有故事张力的结果作为重心，其他独立结果自然并置、反衬或改变代价。"),
  '01 必须按 prompt.txt 单向流程合成五段动态数据和六字段输出契约',
)
assertOk(
  promptContextRuntime.includes('projectNarrativeResultForPrompt')
    && promptContextRuntime.includes('displayAge: entry.displayAge')
    && promptContextRuntime.includes('buildWorldStateSummaries')
    && timelineMemory.includes('formatAgePrefixedStory')
    && timelineMemory.includes('已成立事实')
    && timelineProjectionRuntime.includes('displayAge: time?.displayAge')
    && timelineProjectionRuntime.includes("orchestrator['resolveNarrativeRoundTime'](entry.sortRound)?.displayAge")
    && !promptContextRuntime.includes('return `${ageLabel}·${timeLabel}·第${round}轮：${text}`')
    && !timelineMemory.includes('已结算现实结果：')
    && !timelineMemory.includes('已结算事实：')
    && timelineMemory.includes('已结束事件身份：'),
  '01 历史读取投影必须使用发生年龄前缀，且不附加结算标签或轮次标题',
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
  worldCatalog.includes('霍格沃茨是欧洲最著名的魔法学校，接收适龄巫师入学')
    && !worldCatalog.includes('你收到了一封来自霍格沃茨魔法学校的录取通知书'),
  '世界预设不得把后续年龄事件写成当前既成事实',
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
    && talentServer.includes('你是天赋成长的推演者。')
    && continuityServer.includes('未来事件')
    && talentServer.includes('深度强化、广度强化、转变强化')
    && talentServer.includes('转变强化依据玩家本局已成立经历和突破契机重新塑造能力')
    && talentServer.includes('新天赋可以与最初天赋毫不相干')
    && talentServer.includes('不默认叠加历代能力')
    && !talentServer.includes('每条路线保留同一命格的核心来源')
    && !talentServer.includes('不额外扩大影响总量')
    && talentServer.includes('首句直接落到能力机制、触发条件、动作、可观察结果或世界反馈')
    && talentServer.includes('模板化起句')
    && talentServer.includes('长期积累')
    && talentServer.includes('时间沉淀')
    && talentServer.includes('明确契机')
    && talentServer.includes('证据链最完整')
    && talentServer.includes('突破契机最明确')
    && talentServer.includes('直接证据三要素')
    && talentServer.includes('统一使用第二人称“你”')
    && talentServer.includes('二至六个汉字')
    && talentServer.includes('三项共同成立')
    && !talentServer.includes('不得转为直接')
    && !talentServer.includes('禁止直接操控'),
  '三个固定 Prompt 必须分别承担故事、连续性和成长职责，且 03 不增加转变路线替代限制',
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
    && /name: 'finalize-round'[\s\S]{0,260}dependsOn: \['commit-round'\][\s\S]{0,500}startNarrativePreGeneration\(/u.test(campaign),
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

if (failed > 0) {
  console.error(`\n叙事接线验证失败: ${failed} 项`)
  process.exit(1)
}

console.log('[OK] 01 主故事与并行 02/03 接线验证通过')

