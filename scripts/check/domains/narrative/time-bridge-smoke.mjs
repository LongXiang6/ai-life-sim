/**
 * Purpose: Verify the main narrative data layer carries no time-bridge or time-guide text.
 * Owner: quality:narrative
 * Responsibility: Keep 当前信息.时间 the only time coordinate in the story Prompt.
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

if (
  !builder.includes("const currentTime = nonEmpty(context.currentTime) ?? '当前时间'")
  || !builder.includes('时间: `${currentAgeValue}岁-${currentTime}`')
) {
  console.error('FAIL: prompt-builder must project current time into 当前信息')
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
  console.error('FAIL: the main narrative prompt context must not assemble time-bridge or time-guide text')
  failed++
}

if (failed === 0) {
  console.log('PASS: time-bridge-smoke')
  process.exit(0)
}
process.exit(1)
