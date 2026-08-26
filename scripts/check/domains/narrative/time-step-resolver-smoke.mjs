/**
 * Purpose: Verify the canonical year/event time-step wiring.
 * Owner: quality:narrative
 * Responsibility: Runtime boundary and annual base-point contract only.
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
const annualClock = read('src/foundation/utils/annual-clock.ts')
const orchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const store = read('src/mods/mod-engine/store.ts')
const roundCommitBus = read('src/mods/mod-engine/helpers/round-commit-bus.ts')
const causalDelay = read('src/mods/mod-engine/subsystems/causal-delay-system.ts')

assertOk(/BASE_POINTS_PER_YEAR\s*=\s*1_000/.test(annualClock), 'annual clock must define 1000 base points per year')
assertOk(/eventRoundDeltaPoints/.test(annualClock), 'annual clock must expose event round delta helper')
assertOk(/calendarDaysFromBasePoints/.test(annualClock), 'annual clock must derive display days from base points')
assertOk(/unit:\s*TimeStepUnit/.test(foundationTypes), 'TimeStep must use the canonical unit type')
assertOk(/export type TimeStepUnit = 'year' \| 'event'/.test(foundationTypes), 'TimeStep units must be year/event only')
assertOk(/basePointsPassed:\s*number/.test(foundationTypes), 'RoundContext must expose basePointsPassed')
assertOk(/totalBasePoints:\s*number/.test(foundationTypes), 'RoundContext must expose totalBasePoints')
assertOk(!/unit:\s*'day'/.test(timeSteps) && !/unit:\s*'month'/.test(timeSteps) && !/unit:\s*'season'/.test(timeSteps), 'UI time-step options must remove day/month/season')
assertOk(/DEFAULT_ANNUAL_EVENT_COUNT/.test(timeSteps), 'time-step options must expose the default annual event budget')
assertOk(/unit === 'year'/.test(resolver) && /unit === 'event'/.test(resolver), 'resolver must accept year/event')
assertOk(/DEFAULT_ANNUAL_EVENT_COUNT/.test(resolver), 'resolver must map legacy values to the default event budget')
assertOk(/timeStep:\s*\{\s*unit:\s*'year',\s*value:\s*1\s*\}/.test(engineConstants), 'new-engine default time step must be year:1')
assertOk(/advanceAnnualEvent/.test(timeSystem), 'TimeSystem must use the annual event allocator')
assertOk(!/DAYS_PER_YEAR\)\/nodes|nodesPerYear\).*DAYS_PER_YEAR/.test(timeSystem), 'event advancement must not allocate nodes by 365-day division')
assertOk(/getBasePointsPassed/.test(orchestrator) && /basePointsPassed:/.test(orchestrator), 'orchestrator must inject base-point deltas')
assertOk(/totalBasePoints:/.test(store) && /ENGINE_STORE_SCHEMA_VERSION\s*=\s*8/.test(store), 'store must initialize and migrate the base-point clock')
assertOk(/contextIdentity[\s\S]*totalBasePoints/.test(roundCommitBus), 'round commit identity must freeze totalBasePoints')
assertOk(!/readonly\s+totalDays\s*:\s*number/.test(roundCommitBus), 'round commit identity must not expose totalDays')
assertOk(!/identity\.totalDays/.test(roundCommitBus), 'round commit validation must not compare identity.totalDays')
assertOk(
  /createdBasePoints:\s*createdBasePoints\s*!==\s*undefined[\s\S]{0,320}context\.totalBasePoints/.test(causalDelay)
    && !/createdTotalDays\s*\?\?\s*context\.totalDays/.test(causalDelay),
  'causal registration must default to context.totalBasePoints and never reinterpret context.totalDays as business time',
)

function cumulative(index, count) {
  return Math.floor(index * 1000 / count)
}

const n3 = [1, 2, 3].map((index) => cumulative(index, 3) - cumulative(index - 1, 3))
assertSame(n3.reduce((sum, value) => sum + value, 0), 1000, 'three events must consume exactly one year')
assertOk(n3.join(',') === '333,333,334', 'three-event allocation must distribute the remainder deterministically')
const n24 = Array.from({ length: 24 }, (_, index) => cumulative(index + 1, 24) - cumulative(index, 24))
assertSame(n24.reduce((sum, value) => sum + value, 0), 1000, '24 events must consume exactly one year')
assertOk(n24.every((value) => value === 41 || value === 42), '24-event deltas must stay within the expected integer allocation')

if (failed === 0) {
  console.log('PASS: time-step-resolver-smoke')
  process.exit(0)
}
process.exit(1)
