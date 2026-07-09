/**
 * Phase 6：叙事 Prompt 接线审计（纯逻辑，不依赖 TS 编译）
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)

const promptBuilder = fs.readFileSync(
  path.join(root, 'src/core/ai-service/prompt-builder.ts'),
  'utf8',
)
const narrativePrompt = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/narrative-prompt.ts'),
  'utf8',
)
const campaign = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/campaigns/default/index.ts'),
  'utf8',
)
const orchestrator = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  'utf8',
)
const memoryLifecycle = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'),
  'utf8',
)
const summaryCompressor = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/summary-compressor-system.ts'),
  'utf8',
)
const summaryPrompt = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/summary-prompt.ts'),
  'utf8',
)
const promptContract = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/bootstrap/prompt-context-contract.generated.ts'),
  'utf8',
)

let failed = 0

const requiredContextFields = [
  'calibrationSummary',
  'memorySummary',
  'eventInjectionText',
  'timeBridgeSummary',
  'narrativeToneHint',
  'subsystemSummaries',
  'character',
  'worldSetting',
]

for (const key of requiredContextFields) {
  if (!promptBuilder.includes(`context.${key}`)) {
    console.error(`FAIL: prompt-builder missing context field ${key}`)
    failed++
  }
}

if (!promptBuilder.includes('buildNarrativeUserJson')) {
  console.error('FAIL: buildNarrativeUserJson not found')
  failed++
}

if (!promptBuilder.includes('getNarrativeUserSegments')) {
  console.error('FAIL: getNarrativeUserSegments not found')
  failed++
}

if (campaign.includes('segments.stablePrefix, segments.variableSuffix')) {
  console.error('FAIL: campaign still uses legacy broken userSegments')
  failed++
}

if (!campaign.includes('getNarrativeUserSegments')) {
  console.error('FAIL: campaign not using getNarrativeUserSegments')
  failed++
}

if (!orchestrator.includes('generateCompressedSummaries')) {
  console.error('FAIL: orchestrator not wired to generateCompressedSummaries')
  failed++
}

const buildYearEventsStart = orchestrator.indexOf('private buildYearEvents')
const buildYearEventsEnd = orchestrator.indexOf('/** Phase 6', buildYearEventsStart)
const buildYearEvents = buildYearEventsStart >= 0 && buildYearEventsEnd > buildYearEventsStart
  ? orchestrator.slice(buildYearEventsStart, buildYearEventsEnd)
  : ''
if (!buildYearEvents.includes('n.displayAge') || !buildYearEvents.includes('n.displayTimeLabel')) {
  console.error('FAIL: buildYearEvents must use per-entry displayAge/displayTimeLabel')
  failed++
}

if (!orchestrator.includes('decision.shouldCompress && result.didCompress')) {
  console.error('FAIL: compression cleanup must wait for a real compression result')
  failed++
}

if (
  !memoryLifecycle.includes('existingIndex') ||
  !memoryLifecycle.includes('e.level === level && e.startRound === startRound && e.endRound === endRound')
) {
  console.error('FAIL: memory lifecycle index must dedupe by level/startRound/endRound')
  failed++
}

if (
  !summaryCompressor.includes('didCompress: boolean') ||
  !summaryCompressor.includes('if (didCompress)') ||
  !summaryCompressor.includes('didCompress: false')
) {
  console.error('FAIL: summary compressor must report real compression and guard lastCompressionAt')
  failed++
}

if (
  !summaryPrompt.includes('只总结 eventRecords.narrative') ||
  !summaryPrompt.includes('模拟系统可能延后')
) {
  console.error('FAIL: summary prompt must forbid inferred deferred simulation states')
  failed++
}

const runtimeNarrativeVars = [
  'narrativeToneHint',
  'timeBridgeSummary',
  'causalChainHint',
  'timeGuideText',
  'narrativeGuidanceText',
]
for (const variable of runtimeNarrativeVars) {
  if (!narrativePrompt.includes(`'${variable}'`)) {
    console.error(`FAIL: narrative prompt variables missing ${variable}`)
    failed++
  }
  if (!promptContract.includes(`"${variable}"`)) {
    console.error(`FAIL: prompt context contract missing narrative variable ${variable}`)
    failed++
  }
}

if (!promptBuilder.includes('buildConversationMessages')) {
  console.error('FAIL: buildConversationMessages / S3 not wired')
  failed++
}

if (!promptBuilder.includes('KV_MESSAGE_STRATEGY')) {
  console.error('FAIL: KV_MESSAGE_STRATEGY not used')
  failed++
}

if (!orchestrator.includes('buildTimeBridgeSummary')) {
  console.error('FAIL: TS-5 time bridge not wired in orchestrator')
  failed++
}

if (!orchestrator.includes('lastNarrativeText')) {
  console.error('FAIL: lifespan lastNarrativeText not wired')
  failed++
}

// eventInjection before currentState in prompt-builder FAST_JSON_KEYS
const fastMatch = promptBuilder.match(/const FAST_JSON_KEYS = \[([\s\S]*?)\] as const/)
if (fastMatch) {
  const fastBlock = fastMatch[1]
  const eventIdx = fastBlock.indexOf("'事件注入'")
  const stateIdx = fastBlock.indexOf("'当前状态'")
  const directorIdx = fastBlock.indexOf("'本轮导演提示'")
  if (eventIdx < 0 || stateIdx < 0 || eventIdx > stateIdx) {
    console.error('FAIL: FAST_JSON_KEYS order — eventInjection must precede currentState')
    failed++
  }
  if (directorIdx < 0 || !fastBlock.trim().endsWith("'本轮导演提示',")) {
    console.error('FAIL: FAST_JSON_KEYS order — round director hint must be the final dynamic key')
    failed++
  }
} else {
  console.error('FAIL: FAST_JSON_KEYS not found')
  failed++
}

if (!promptBuilder.includes('buildRoundDirectorHint')) {
  console.error('FAIL: round director hint builder missing')
  failed++
}

const wordCountStart = orchestrator.indexOf('wordCountInstruction:')
const wordCountEnd = orchestrator.indexOf('calibrationSummary:', wordCountStart)
const wordCountBlock = wordCountStart >= 0 && wordCountEnd > wordCountStart
  ? orchestrator.slice(wordCountStart, wordCountEnd)
  : ''
if (wordCountBlock.includes('buildTimeScaleNarrativeHint')) {
  console.error('FAIL: time-scale hint must not be embedded in stable wordCountInstruction')
  failed++
}

if (failed === 0) {
  console.log('PASS: kv-prompt-audit (wiring + compression + field order)')
  process.exit(0)
}
process.exit(1)
