/**
 * Purpose: Verify the canonical calendar time-step wiring.
 * Owner: quality:narrative
 * Responsibility: Runtime boundary and calendar projection contract only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed += 1
  }
}

function assertSame(actual, expected, message) {
  assertOk(actual === expected, `${message} (expected=${expected}, actual=${actual})`)
}

const resolver = read('src/mods/mod-engine/utils/time-step-resolver.ts')
const engineConstants = read('src/mods/mod-engine/constants.ts')
const timeSystem = read('src/mods/mod-engine/subsystems/time-system.ts')
const foundationTypes = read('src/foundation/types/subsystem.types.ts')
const timeSteps = read('src/foundation/constants/time-steps.ts')
const orchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const store = read('src/mods/mod-engine/store.ts')
const roundCommitBus = read('src/mods/mod-engine/helpers/round-commit-bus.ts')
const causalDelay = read('src/mods/mod-engine/subsystems/causal-delay-system.ts')

assertOk(/unit:\s*TimeStepUnit/.test(foundationTypes), 'TimeStep must use the canonical unit type')
assertOk(/export type TimeStepUnit = 'day' \| 'month' \| 'season' \| 'year'/.test(foundationTypes), 'TimeStep units must be calendar units')
assertOk(/basePointsPassed:\s*number/.test(foundationTypes), 'RoundContext must expose basePointsPassed')
assertOk(/totalBasePoints:\s*number/.test(foundationTypes), 'RoundContext must expose totalBasePoints')
assertOk(/unit:\s*'day'/.test(timeSteps) && /unit:\s*'month'/.test(timeSteps) && /unit:\s*'season'/.test(timeSteps), 'UI time-step options must expose day/month/season')
assertOk(!/unit:\s*'event'/.test(timeSteps), 'UI time-step options must remove event nodes')
assertOk(/normalizeCanonicalTimeStep/.test(resolver), 'resolver must use the canonical step normalizer')
assertOk(/return \{ calendarAdvance: normalizeCanonicalTimeStep\(step\) \}/.test(resolver), 'resolver must normalize every runtime step at one boundary')
assertOk(/timeStep:\s*\{\s*unit:\s*'year',\s*value:\s*1\s*\}/.test(engineConstants), 'new-engine default time step must be year:1')
assertOk(/daysForStep/.test(timeSystem), 'TimeSystem must calculate calendar deltas')
assertOk(!/advanceAnnualEvent|eventNodeCount|eventNodeIndex|unit === 'event'/.test(timeSystem), 'TimeSystem must not use the event-node clock')
assertOk(/getBasePointsPassed/.test(orchestrator) && /basePointsPassed:/.test(orchestrator), 'orchestrator must inject base-point deltas')
assertOk(/totalBasePoints:/.test(store) && /totalDays:/.test(store), 'store must initialize and migrate the calendar clock')
assertOk(/contextIdentity[\s\S]*totalBasePoints/.test(roundCommitBus), 'round commit identity must freeze totalBasePoints')
assertOk(!/readonly\s+totalDays\s*:\s*number/.test(roundCommitBus), 'round commit identity must not expose totalDays')
assertOk(!/identity\.totalDays/.test(roundCommitBus), 'round commit validation must not compare identity.totalDays')
assertOk(
  /createdBasePoints:\s*createdBasePoints\s*!==\s*undefined[\s\S]{0,320}context\.totalBasePoints/.test(causalDelay)
    && !/createdTotalDays\s*\?\?\s*context\.totalDays/.test(causalDelay),
  'causal registration must default to context.totalBasePoints and never reinterpret context.totalDays as business time',
)
if (failed === 0) {
  console.log('PASS: time-step-resolver-smoke')
  process.exit(0)
}
process.exit(1)
