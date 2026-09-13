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

assertOk(
  promptBuilder.includes('userSegments: string[]')
    && promptBuilder.includes('const dataLayerSegment = JSON.stringify(input)')
    && promptBuilder.includes("名称: nonEmpty(rawWorld.名称) ?? ''")
    && promptBuilder.includes("描述: nonEmpty(rawWorld.描述) ?? ''")
    && promptBuilder.includes('玩家信息')
    && promptBuilder.includes('历史事件上下文')
    && promptBuilder.includes('节点事件')
    && promptBuilder.includes('玩家本节点属性')
    && promptBuilder.includes('本节点信息')
    && promptBuilder.includes('时间节点')
    && promptBuilder.includes('玩家本节点属性: attributes')
    && promptBuilder.includes("家境: '0'")
    && !promptBuilder.includes('recentDetailedStories')
    && !promptBuilder.includes('当前到期事件'),
  '01 必须按当前数据层示例组装世界、玩家信息、历史事件上下文、玩家本节点属性和本节点信息',
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
  narrativePrompt.includes("version: '7.32.0'")
    && narrativePrompt.includes('mod-engine:narrative:7.32.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.1.1')
    && continuityPrompt.includes("version: '3.0.0'")
    && talentPrompt.includes("version: '3.5.0'")
    && talentPrompt.includes('mod-engine:narrative-talent-growth:3.5.0')
    && [narrativePrompt, continuityPrompt, talentPrompt].every((source) => (
      source.includes("systemPrompt: ''") && source.includes('serverPromptAssetId:')
    )),
  '01/02/03 客户端契约必须绑定当前三个受保护资产版本',
)
assertOk(
  worldCatalog.includes('霍格沃茨是欧洲最著名的魔法学校，接收适龄巫师入学')
    && !worldCatalog.includes('你收到了一封来自霍格沃茨魔法学校的录取通知书'),
  '世界预设不得把后续年龄事件写成当前既成事实',
)
assertOk(
  narrativeServer.includes('身份核心：')
    && narrativeServer.includes('你是一个离散化人生模拟器')
    && narrativeServer.includes('时间由程序控制，你只处理当前节点，不推进、跳过或改变时间。')
    && narrativeServer.includes('从当前节点可能发生的变化中重新抽取一件新的、具有实际意义的事件。')
    && narrativeServer.includes('状态连续，事件离散；每个节点都是独立的事件单元，而不是上一节点的下一幕。')
    && narrativeServer.includes('不得拆分同一事件、延续同一场景或逐步推进同一行动。')
    && narrativeServer.includes('事件应体现玩家人生、现实处境或所处世界的明显变化')
    && narrativeServer.includes('世界独立运行，玩家只是其中一员')
    && narrativeServer.includes('历史用于维持人物和世界状态的一致性，不用于规定下一事件。')
    && narrativeServer.includes('先确定本节点发生的事件及其结果，再进行离散化叙述。')
    && narrativeServer.includes('以事件和结果为主，压缩过程')
    && narrativeServer.includes('心智、体魄、魅力、家境只在事件产生真实且持续的影响时改变。')
    && narrativeServer.includes('重大事件±1，扭转人生走向±2，改写命运±3。')
    && narrativeServer.includes('只有当前事件自然构成重大人生转折时才生成三个互斥的命运走向，否则为null。')
    && narrativeServer.includes('死亡、永久失去意识或其他不可逆的生命终止状态触发结局并停止模拟。')
    && narrativeServer.includes('输出格式：')
    && narrativeServer.includes('"正文"')
    && narrativeServer.includes('"命运分支": null或者["选项一", "选项二", "选项三"],')
    && narrativeServer.includes('"结局": null或者["四字评语", "一句最终总结"]')
    && narrativeServer.includes('以高信息密度的事件叙述呈现本次结果。')
    && narrativeServer.includes('不使用明确年份、轮次等时间锚点')
    && !narrativeServer.includes('人生重开模拟器体例')
    && !narrativeServer.includes('每轮状态变化必须要大')
    && !narrativeServer.includes('年龄边界')
    && !narrativeServer.includes('你是一个“人生重开模拟器”系统')
    && !narrativeServer.includes('事件必须完整：事件→直接结果→外部回响→状态改变→收束')
    && !narrativeServer.includes('通过状态改变体现时间流逝')
    && !narrativeServer.includes('前轮未决事件最多一句话交代')
    && !narrativeServer.includes('【具体性】')
    && !narrativeServer.includes('输出契约')
    && !narrativeServer.includes('正文规则')
    && continuityServer.includes('你是人生模拟器的故事连续性提取器。')
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
    && talentServer.includes('转变强化改变作用方式，不额外扩大影响总量')
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
  fetchExecutor.includes('maxAttempts: 1')
    && fetchExecutor.includes('willRetry: false')
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
