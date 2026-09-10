/**
 * Purpose: Verify the narrative time-bridge prompt wiring contract.
 * Owner: quality:narrative
 * Responsibility: Static time-step projection and prompt-context wiring only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

const bridge = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/time-bridge-summary.ts'),
  'utf8',
)
const builder = fs.readFileSync(
  path.join(root, 'src/core/ai-service/prompt-builder.ts'),
  'utf8',
)
const orchestrator = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  'utf8',
)
const promptContextRuntime = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system/prompt-context-runtime.ts'),
  'utf8',
)

if (!bridge.includes('buildTimeBridgeSummary')) {
  console.error('FAIL: buildTimeBridgeSummary missing')
  failed++
}
if (
  !builder.includes("const currentTime = nonEmpty(context.currentTime) ?? '当前时间'")
  || !builder.includes('时间: `${currentAgeValue}岁-${currentTime}`')
  || builder.includes('context.timeBridgeSummary')
) {
  console.error('FAIL: prompt-builder must project current time into 当前信息 without a standalone timeBridgeSummary field')
  failed++
}
if (!promptContextRuntime.includes('buildTimeBridgeSummary')) {
  console.error('FAIL: orchestrator not wired to time bridge')
  failed++
}
if (!orchestrator.includes('prevRoundYear')) {
  console.error('FAIL: prevRoundYear tracking missing')
  failed++
}

if (failed === 0) {
  console.log('PASS: time-bridge-smoke')
  process.exit(0)
}
process.exit(1)
