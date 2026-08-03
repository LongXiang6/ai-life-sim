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
  !builder.includes('context.timeBridgeSummary') ||
  !builder.includes("'时间跨度摘要'")
) {
  console.error('FAIL: prompt-builder missing timeBridgeSummary key')
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
