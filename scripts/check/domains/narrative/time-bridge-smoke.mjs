/**
 * Purpose: Verify the main narrative data layer carries the canonical narrative time window.
 * Owner: quality:narrative
 * Responsibility: Project time facts without adding a second time source or creative event text.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

const builder = fs.readFileSync(
  path.join(root, 'src/core/ai-service/prompt-builder.ts'),
  'utf8',
)
const promptContextRuntime = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system/prompt-context-runtime.ts'),
  'utf8',
)
const narrativeCalendar = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-calendar.ts'),
  'utf8',
)

if (
  !builder.includes('function buildNarrativeWindowProjection(context: PromptContext): string')
  || !builder.includes('时间节点: `当前年龄=${currentAgeValue}；内部阶段索引=${currentAgeValue}；只用于合龄裁决，不转写为正文`')
  || !builder.includes('时间窗口: buildNarrativeWindowProjection(context)')
  || promptContextRuntime.includes('elapsedYears:')
) {
  console.error('FAIL: prompt-builder must project the canonical time window into 本次信息')
  failed++
}
if (
  builder.includes('context.timeBridgeSummary')
  || builder.includes('context.timeGuideText')
  || builder.includes('context.eventInjectionText')
  || builder.includes('context.eventLibraryText')
  || builder.includes('context.currentDueEvents')
) {
  console.error('FAIL: the data layer must not carry bridge, time-guide, or injected-event fields')
  failed++
}
if (
  promptContextRuntime.includes('buildTimeBridgeSummary')
  || promptContextRuntime.includes('timeGuideText')
  || promptContextRuntime.includes('buildNarrativeTimeGuide')
) {
  console.error('FAIL: the main narrative prompt context must not assemble a second time bridge or creative time guide')
  failed++
}
if (
  !narrativeCalendar.includes('formatNarrativePromptTimeLabel')
  || !narrativeCalendar.includes('case \'month\'')
  || !narrativeCalendar.includes('const timeLabel = formatNarrativePromptTimeLabel(timeStep, eraLabel, context.round)')
  || !narrativeCalendar.includes('buildNarrativeWindow')
  || !narrativeCalendar.includes('context.daysPassed')
) {
  console.error('FAIL: the main narrative time context must use the calendar label and canonical window')
  failed++
}

if (failed === 0) {
  console.log('PASS: time-bridge-smoke')
  process.exit(0)
}
process.exit(1)
