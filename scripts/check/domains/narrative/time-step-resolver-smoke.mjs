/**
 * Phase 12：time-step-resolver 语义冒烟
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

const resolverSrc = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/utils/time-step-resolver.ts'),
  'utf8',
)
const orchestratorSrc = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  'utf8',
)
const mapperSrc = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/detection-state-mapper.ts'),
  'utf8',
)
const campaignSrc = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/campaigns/default/index.ts'),
  'utf8',
)

const DAYS_PER_YEAR = 365
const AVG_MONTH_DAYS = DAYS_PER_YEAR / 12

function resolveTimeStep(step) {
  function integerYearTicks(years) {
    if (years <= 0) return 0
    return Math.round(years)
  }
  switch (step.unit) {
    case 'day': {
      const simulationYears = step.value / DAYS_PER_YEAR
      return { simulationTicks: simulationYears >= 1 ? integerYearTicks(simulationYears) : 0, simulationYears }
    }
    case 'month': {
      const simulationYears = (step.value * AVG_MONTH_DAYS) / DAYS_PER_YEAR
      return { simulationTicks: integerYearTicks(simulationYears), simulationYears }
    }
    case 'year': {
      return { simulationTicks: integerYearTicks(step.value), simulationYears: step.value }
    }
    default:
      return null
  }
}

const day1 = resolveTimeStep({ unit: 'day', value: 1 })
if (day1.simulationTicks !== 0) {
  console.error(`FAIL: day simulationTicks expected 0, got ${day1.simulationTicks}`)
  failed++
}
if (Math.abs(day1.simulationYears - 1 / 365) > 1e-6) {
  console.error(`FAIL: day simulationYears expected ~${1 / 365}`)
  failed++
}

const month1 = resolveTimeStep({ unit: 'month', value: 1 })
if (month1.simulationTicks !== 0) {
  console.error(`FAIL: month simulationTicks expected 0, got ${month1.simulationTicks} (was incorrectly 1 year)`)
  failed++
}
if (Math.abs(month1.simulationYears - AVG_MONTH_DAYS / DAYS_PER_YEAR) > 0.01) {
  console.error(`FAIL: month simulationYears expected ~${AVG_MONTH_DAYS / DAYS_PER_YEAR}`)
  failed++
}

const year1 = resolveTimeStep({ unit: 'year', value: 1 })
if (year1.simulationTicks !== 1) {
  console.error(`FAIL: year simulationTicks expected 1, got ${year1.simulationTicks}`)
  failed++
}

if (resolverSrc.includes('simulationYears')) {
  // ok
} else {
  console.error('FAIL: time-step-resolver missing simulationYears')
  failed++
}

if (!orchestratorSrc.includes('ageYearsDelta')) {
  console.error('FAIL: orchestrator missing ageYearsDelta in buildRoundContext')
  failed++
}

if (!orchestratorSrc.includes('mapSubsystemStatesToDetectionStates')) {
  console.error('FAIL: orchestrator not wired to detection-state-mapper')
  failed++
}

if (!mapperSrc.includes('marketState')) {
  console.error('FAIL: detection-state-mapper missing marketState')
  failed++
}

if (campaignSrc.includes('if (ctx._eventInjectionText)')) {
  console.error('FAIL: campaign cross-domain still guarded by eventInjectionText')
  failed++
}

if (failed === 0) {
  console.log('PASS: time-step-resolver-smoke')
  process.exit(0)
}
process.exit(1)
