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
  promptBuilder.includes('userSegments: [string, string, string]')
    && promptBuilder.includes('JSON.stringify({ 世界: input.世界 ?? {} })')
    && promptBuilder.indexOf('历史剧情: input.历史剧情') < promptBuilder.indexOf('最近两轮详细剧情: input.最近两轮详细剧情')
    && promptBuilder.indexOf('最近两轮详细剧情: input.最近两轮详细剧情') < promptBuilder.indexOf('角色: input.角色')
    && promptBuilder.includes('天赋: context.talents ?? []')
    && promptBuilder.includes('本轮引导: input.本轮引导 ?? []')
    && promptBuilder.includes('当前到期事件')
    && !promptBuilder.includes('当前区域')
    && !promptBuilder.includes('文明阶段')
    && !promptBuilder.includes('当前可叙述状态'),
  '01 必须只组装世界、历史与角色、本轮引导三条标准 JSON，且不接入样品外状态字段',
)
assertOk(
  mainNarrativeCall.includes('prepareMainNarrativeRequest')
    && mainNarrativeCall.includes('executeMainNarrativeRequest')
    && mainNarrativeCall.includes("name: 'submit_story_turn'")
    && mainNarrativeCall.includes('toolChoice')
    && mainNarrativeCall.includes('responseToolName')
    && preGeneration.length === 0,
  '正式回合不得存在下一轮预生成旁路调用',
)
assertOk(
  !mainNarrativeCall.includes('strict: true')
    && !mainNarrativeCall.includes('strictSchema: true')
    && mainNarrativeCall.includes('正文、分支、结局都必须是字符串')
    && mainNarrativeCall.includes('分支和结局未使用时填写 null 四个字符')
    && mainNarrativeCall.includes('2 到 4 个第二人称可执行行动')
    && mainNarrativeCall.includes('永久失去意识、感知、决定、行动和任何新经历')
    && /toolArguments\?\.trim\(\)\s*\?\s*toolArguments\s*:\s*message\?\.content/u.test(httpTransport),
  '01 必须保留唯一工具输出和同响应正文的宽容解析，不启用额外严格请求',
)
assertOk(
  narrativePrompt.includes("version: '7.3.0'")
    && narrativePrompt.includes('mod-engine:narrative:7.3.0')
    && !narrativePrompt.includes('mod-engine:narrative:7.1.1')
    && continuityPrompt.includes("version: '2.6.0'")
    && talentPrompt.includes("version: '3.2.0'")
    && [narrativePrompt, continuityPrompt, talentPrompt].every((source) => (
      source.includes("systemPrompt: ''") && source.includes('serverPromptAssetId:')
    )),
  '01/02/03 客户端契约必须绑定当前三个受保护资产版本',
)
assertOk(
  narrativeServer.includes('你是人生模拟器的故事生成器。')
    && continuityServer.includes('你是故事连续性提取器。')
    && talentServer.includes('你是天赋成长判定与路线生成器。')
    && continuityServer.includes('本轮记忆')
    && continuityServer.includes('未来事件')
    && talentServer.includes('深度强化、广度强化、转变强化')
    && talentServer.includes('转变强化只改变作用方式，不额外扩大影响总量')
    && talentServer.includes('长期积累')
    && talentServer.includes('时间沉淀')
    && talentServer.includes('明确契机')
    && talentServer.includes('三项必须同时成立')
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
  'Campaign 必须恰好包含 01 主故事和 02/03 两个 AI 阶段',
)
assertOk(
  campaign.includes("name: 'prepare-narrative'")
    && campaign.includes("name: 'commit-round'")
    && campaign.includes("name: 'finalize-round'")
    && /name: 'ai-story-continuity'[\s\S]{0,220}dependsOn: \['prepare-narrative'\][\s\S]{0,120}parallelGroup: SPECIALIST_PARALLEL_GROUP/u.test(campaign)
    && /name: 'ai-talent-growth'[\s\S]{0,220}dependsOn: \['prepare-narrative'\][\s\S]{0,120}parallelGroup: SPECIALIST_PARALLEL_GROUP/u.test(campaign)
    && campaign.includes("ctx._talentInput.eligiblePatterns.length === 0")
    && campaign.includes('getRoundContextSnapshot')
    && campaign.includes('totalDays: roundContext.totalDays')
    && /name: 'commit-round'[\s\S]{0,180}dependsOn: \[\s*'ai-story-continuity',\s*'ai-talent-growth',?\s*\]/u.test(campaign),
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
  ])
    && JSON.stringify(serverContracts) === JSON.stringify([
      'narrative-story-continuity-system-prompt.ts',
      'narrative-system-prompt.ts',
      'narrative-talent-growth-system-prompt.ts',
    ]),
  '运行时叙事 Prompt 资产文件必须只剩 01/02/03',
)
assertOk(
  protocol.includes('NarrativeAIStoryContinuityDataSchema')
    && protocol.includes('NarrativeAITalentGrowthDataSchema')
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
