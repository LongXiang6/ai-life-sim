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

let failed = 0

const requiredKeys = [
  'worldCalibrationSummary',
  'memorySummary',
  'eventInjection',
  'timeBridgeSummary',
  'narrativeToneHint',
  'currentState',
  'character',
  'worldSetting',
]

for (const key of requiredKeys) {
  if (!promptBuilder.includes(`'${key}'`)) {
    console.error(`FAIL: prompt-builder missing JSON key ${key}`)
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
  const eventIdx = fastBlock.indexOf("'eventInjection'")
  const stateIdx = fastBlock.indexOf("'currentState'")
  if (eventIdx < 0 || stateIdx < 0 || eventIdx > stateIdx) {
    console.error('FAIL: FAST_JSON_KEYS order — eventInjection must precede currentState')
    failed++
  }
} else {
  console.error('FAIL: FAST_JSON_KEYS not found')
  failed++
}

if (failed === 0) {
  console.log('PASS: kv-prompt-audit (wiring + compression + field order)')
  process.exit(0)
}
process.exit(1)
