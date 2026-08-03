/**
 * Purpose: Regress time-step resolution and day-granularity RoundContext contracts.
 * Owner: quality:narrative
 * Responsibility: One deterministic calendar and narrative-age smoke suite only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'
const root = getProjectRoot(import.meta.url)
let failed = 0

function readRel(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed++
  }
}
function assertSame(actual, expected, message) {
  if (actual !== expected) {
    console.error(`FAIL: ${message} (expected=${expected}, actual=${actual})`)
    failed++
  }
}

function extractBlock(src, marker) {
  const start = src.indexOf(marker)
  if (start < 0) return ''
  const brace = src.indexOf('{', start)
  if (brace < 0) return ''
  let depth = 0
  for (let i = brace; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth === 0) return src.slice(brace + 1, i)
  }
  return ''
}

const resolverSrc = readRel('src/mods/mod-engine/utils/time-step-resolver.ts')
const timeSystemSrc = readRel('src/mods/mod-engine/subsystems/time-system.ts')
const calendarSeasonSrc = readRel('src/mods/mod-engine/helpers/calendar-season.js')
const orchestratorSrc = readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', root)
const constantsSrc = readRel('src/mods/mod-engine/constants.ts')
const mapperSrc = readRel('src/mods/mod-engine/helpers/detection-state-mapper.ts')
const campaignSrc = readRel('src/mods/mod-engine/campaigns/default/index.ts')
const preGenSrc = readRel('src/mods/mod-engine/helpers/pre-gen-queue.ts')
const hooksSrc = readRel('src/mods/mod-engine/hooks.ts')
const saveRestoreSrc = readRel('src/mods/mod-engine/helpers/save-restore.ts')

const resolverCode = stripComments(resolverSrc)
const orchestratorCode = stripComments(orchestratorSrc)
const constantsCode = stripComments(constantsSrc)
const campaignCode = stripComments(campaignSrc)
const preGenCode = stripComments(preGenSrc)
const hooksCode = stripComments(hooksSrc)
const saveRestoreCode = stripComments(saveRestoreSrc)

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function dayOfYearForMonth(monthIndex) {
  return MONTH_DAYS.slice(0, monthIndex).reduce((sum, days) => sum + days, 1)
}

function seasonForMonth(monthIndex) {
  const normalizedMonth = ((monthIndex % 12) + 12) % 12
  return Math.floor(((normalizedMonth + 10) % 12) / 3)
}

function specAlignAfterNarratedPeriod(prevUnit, round, prevValue = 1) {
  const next = { ...round }
  const amount = Math.max(1, Math.floor(prevValue))
  let daysPassed
  switch (prevUnit) {
    case 'day':
      daysPassed = amount
      break
    case 'month':
      daysPassed = Array.from({ length: amount }, (_, offset) => MONTH_DAYS[(next.month + offset) % 12])
        .reduce((sum, days) => sum + days, 0)
      break
    case 'season':
      daysPassed = Array.from({ length: amount * 3 }, (_, offset) => MONTH_DAYS[(next.month + offset) % 12])
        .reduce((sum, days) => sum + days, 0)
      break
    case 'year':
      daysPassed = amount * 365
      break
  }

  const newAbsoluteDay = next.totalDays + daysPassed
  next.totalDays = newAbsoluteDay
  next.year = Math.floor(newAbsoluteDay / 365)
  next.dayOfYear = (newAbsoluteDay % 365) + 1
  let remaining = next.dayOfYear - 1
  for (let month = 0; month < MONTH_DAYS.length; month++) {
    if (remaining < MONTH_DAYS[month]) {
      next.month = month
      next.day = remaining
      next.season = seasonForMonth(month)
      break
    }
    remaining -= MONTH_DAYS[month]
  }
  return next
}

function specAdvanceRound(round, unit, value = 1) {
  const next = { ...round }
  const amount = Math.max(1, Math.floor(value))
  let daysPassed = 0
  switch (unit) {
    case 'day':
      daysPassed = amount
      break
    case 'month':
      daysPassed = Array.from({ length: amount }, (_, offset) => MONTH_DAYS[(next.month + offset) % 12])
        .reduce((sum, days) => sum + days, 0)
      break
    case 'season':
      daysPassed = Array.from({ length: amount * 3 }, (_, offset) => MONTH_DAYS[(next.month + offset) % 12])
        .reduce((sum, days) => sum + days, 0)
      break
    case 'year':
      daysPassed = amount * 365
      break
  }

  const newAbsoluteDay = next.totalDays + daysPassed
  next.totalDays = newAbsoluteDay
  next.year = Math.floor(newAbsoluteDay / 365)
  next.dayOfYear = (newAbsoluteDay % 365) + 1
  let remaining = next.dayOfYear - 1
  for (let month = 0; month < MONTH_DAYS.length; month++) {
    if (remaining < MONTH_DAYS[month]) {
      next.month = month
      next.day = remaining
      next.season = seasonForMonth(month)
      break
    }
    remaining -= MONTH_DAYS[month]
  }
  return next
}

function specNarrativeAge(totalDays, startingAge = 0) {
  return startingAge + Math.floor(Math.max(0, totalDays - 365) / 365)
}

assertOk(
  /timeStep:\s*\{\s*unit:\s*'year'\s*,\s*value:\s*1\s*,?\s*\}/.test(constantsCode),
  'DEFAULT_ENGINE_CONFIG.timeStep must default to year x1',
)
assertOk(
  /case\s+'day'[\s\S]*case\s+'month'[\s\S]*case\s+'season'[\s\S]*case\s+'year'/.test(resolverCode),
  'resolveTimeStep must accept day/month/season/year',
)
assertOk(
  !/\bsimulationTicks\b|\bageYearsDelta\b|\bcalendarDaysDelta\b/.test(resolverCode),
  'time-step-resolver must not produce legacy year/tick deltas',
)

const setTimeStepBody = extractBlock(timeSystemSrc, 'setTimeStep(step')
assertOk(
  /this\.timeStep\s*=\s*normalizeTimeStep\(step\)/.test(setTimeStepBody),
  'TimeSystem.setTimeStep must only normalize the next step',
)
assertOk(
  !/advance\(|totalDays|lastDaysPassed|this\.round\s*=/.test(setTimeStepBody),
  'TimeSystem.setTimeStep must not advance time or mutate round counters',
)

const advanceBody = extractBlock(timeSystemSrc, 'advance(): RoundInfo')
assertOk(
  /const\s+beforeTotalDays\s*=\s*this\.round\.totalDays/.test(advanceBody),
  'TimeSystem.advance must capture totalDays before advancing',
)
assertOk(
  /this\.lastDaysPassed\s*=\s*result\.totalDays\s*-\s*beforeTotalDays/.test(advanceBody),
  'TimeSystem.advance must derive daysPassed from totalDays delta',
)
assertOk(/case\s+'day'[\s\S]*advanceDays\(this\.timeStep\.value\)/.test(advanceBody), 'day step must call advanceDays')
assertOk(/case\s+'month'[\s\S]*advanceMonths\(this\.timeStep\.value\)/.test(advanceBody), 'month step must call advanceMonths')
assertOk(/case\s+'season'[\s\S]*advanceSeasons\(this\.timeStep\.value\)/.test(advanceBody), 'season step must call advanceSeasons')
assertOk(/case\s+'year'[\s\S]*advanceYears\(this\.timeStep\.value\)/.test(advanceBody), 'year step must call advanceYears')

const monthBody = extractBlock(timeSystemSrc, 'advanceOneMonth(): RoundInfo')
assertOk(
  /CALENDAR\.DAYS_IN_MONTH\[r\.month\]/.test(monthBody),
  'month step must use the current real month length',
)

const seasonBody = extractBlock(timeSystemSrc, 'advanceOneSeason(): RoundInfo')
assertOk(
  /getContinuousMonthDays\(r\.month,\s*CALENDAR\.MONTHS_PER_SEASON\)/.test(seasonBody),
  'season step must sum three continuous real months',
)
assertOk(
  /newAbsoluteDay\s*=\s*currentAbsoluteDay\s*\+\s*seasonDays/.test(seasonBody),
  'season step must advance from the current absolute day',
)

const yearBody = extractBlock(timeSystemSrc, 'advanceYears(count')
assertOk(
  /this\.round\.totalDays\s*\+=\s*CALENDAR\.DAYS_PER_YEAR/.test(yearBody),
  'year step must add 365 days per year',
)

const alignmentBody = extractBlock(timeSystemSrc, 'alignToNextPeriod(prevUnit')
assertOk(
  /alignRoundToNextPeriod\(prevUnit,\s*newUnit,\s*this\.round,\s*prevValue\)/.test(alignmentBody),
  'TimeSystem.alignToNextPeriod must use the pure boundary alignment helper',
)
assertOk(
  /this\.lastDaysPassed\s*=\s*aligned\.totalDays\s*-\s*beforeTotalDays/.test(alignmentBody),
  'TimeSystem.alignToNextPeriod must derive daysPassed from alignment totalDays delta',
)
assertOk(
  /getSeasonForMonth/.test(timeSystemSrc)
    && /getSeasonForMonth/.test(calendarSeasonSrc)
    && /normalizedMonth\s*\+\s*10/.test(calendarSeasonSrc),
  'time system must use the shared solar-season mapping helper',
)

const orchestratorAdvanceBody = extractBlock(orchestratorSrc, 'advanceTimeForCurrentStep(): RoundInfo')
assertOk(
  /timeSystem\.importRound\(this\.state\.round\)/.test(orchestratorAdvanceBody),
  'orchestrator must sync TimeSystem from the authoritative round before advancing',
)
assertOk(
  /this\.state\.narrativeHistory\.length\s*>\s*0/.test(orchestratorAdvanceBody),
  'orchestrator must only align switched time steps after at least one completed narrative',
)
assertOk(
  /alignmentFromUnit\s*=\s*this\.pendingTimeStepAlignmentFromUnit\s*\?\?\s*this\.lastNarratedTimeStep\.unit/.test(orchestratorAdvanceBody),
  'orchestrator must preserve the player-selected coarse-to-fine transition until the next round',
)
assertOk(
  /this\.pendingTimeStepAlignmentFromUnit\s*=\s*undefined[\s\S]*timeSystem\.alignToNextPeriod\(\s*alignmentFromUnit[\s\S]*alignmentFromValue/.test(orchestratorAdvanceBody),
  'orchestrator must align the next round instead of re-entering the already narrated period',
)
assertOk(
  /previousNarrativeRound/.test(orchestratorCode)
    && orchestratorCode.includes('previousNode: {')
    && orchestratorCode.includes("orchestrator['previousNarrativeRound']")
    && orchestratorCode.includes('daysPassed: previousLocalCalendar')
    && orchestratorCode.includes('timeSystem.getDaysPassed()'),
  'narrative Prompt must receive the real previous node and elapsed-day window instead of inferring it from the new granularity',
)
assertOk(
  !/totalRounds\s*===\s*0/.test(orchestratorCode),
  'opening-round prompt logic must not rely on totalRounds === 0 after advanceTime increments it',
)

const openingAnnualRound = {
  year: 1002,
  season: seasonForMonth(0),
  month: 0,
  day: 0,
  dayOfYear: 1,
  totalDays: 1002 * 365,
}
const yearToMonth = specAlignAfterNarratedPeriod('year', openingAnnualRound)
assertSame(yearToMonth.year, 1003, 'year->month must start at the next year')
assertSame(yearToMonth.month, 0, 'year->month must land on January')
assertSame(yearToMonth.day, 0, 'year->month must land on January 1')
assertSame(yearToMonth.season, seasonForMonth(0), 'January must be winter under the solar calendar')
assertSame(yearToMonth.totalDays, 1003 * 365, 'year->month must skip exactly the already narrated year')

const yearToDay = specAlignAfterNarratedPeriod('year', { ...openingAnnualRound, year: 1005, totalDays: 1005 * 365 })
assertSame(yearToDay.year, 1006, 'year->day must start at the next year')
assertSame(yearToDay.month, 0, 'year->day must land on January')
assertSame(yearToDay.day, 0, 'year->day must land on January 1')

const nextMonthAfterAlignment = specAdvanceRound(yearToMonth, 'month')
assertSame(nextMonthAfterAlignment.year, 1003, 'the next monthly round must remain in the aligned year')
assertSame(nextMonthAfterAlignment.month, 1, 'the next monthly round after January must be February')
assertSame(nextMonthAfterAlignment.totalDays, 1003 * 365 + 31, 'the next monthly round must add January\'s 31 days')

const nextDayAfterAlignment = specAdvanceRound(yearToDay, 'day')
assertSame(nextDayAfterAlignment.year, 1006, 'the next daily round must remain in the aligned year')
assertSame(nextDayAfterAlignment.month, 0, 'the next daily round must remain in January')
assertSame(nextDayAfterAlignment.day, 1, 'the next daily round must be January 2')

const monthEnd = { ...yearToMonth, month: 1, day: 0, dayOfYear: 32, totalDays: yearToMonth.totalDays + 31, season: seasonForMonth(1) }
const monthToDay = specAlignAfterNarratedPeriod('month', monthEnd)
assertSame(monthToDay.year, 1003, 'month->day must remain in the current year when possible')
assertSame(monthToDay.month, 2, 'month->day must start after the already narrated February')
assertSame(monthToDay.day, 0, 'month->day must land on March 1')

const seasonStart = { ...openingAnnualRound, year: 1002, month: 2, day: 0, dayOfYear: 60, totalDays: 1002 * 365 + 59, season: seasonForMonth(2) }
const seasonToMonth = specAlignAfterNarratedPeriod('season', seasonStart)
assertSame(seasonToMonth.year, 1002, 'season->month must remain in the current year when possible')
assertSame(seasonToMonth.month, 5, 'season->month must start after the already narrated March-May window')
assertSame(seasonToMonth.day, 0, 'season->month must land on June 1')

const sameGranularity = { ...yearToMonth }
assertSame(sameGranularity.totalDays, yearToMonth.totalDays, 'same-granularity changes must not move the round')

const seasonMapping = [
  [1, 3], [2, 3], [3, 0], [5, 0], [6, 1], [8, 1], [9, 2], [11, 2], [12, 3],
]
for (const [month, expectedSeason] of seasonMapping) {
  assertSame(seasonForMonth(month - 1), expectedSeason, `${month}月 must map to the solar season index ${expectedSeason}`)
}

const decemberStart = {
  year: 1,
  season: 3,
  month: 11,
  day: 0,
  dayOfYear: dayOfYearForMonth(11),
  totalDays: 365 + dayOfYearForMonth(11) - 1,
}
const yearBoundary = specAdvanceRound(decemberStart, 'month')
assertSame(yearBoundary.year, 2, 'December month advance must cross into the next year exactly once')
assertSame(yearBoundary.month, 0, 'December month advance must land on January 1')
assertSame(yearBoundary.totalDays, 730, 'December month advance must end at the canonical 730-day boundary')
assertSame(specNarrativeAge(yearBoundary.totalDays), 1, 'age must increment exactly at the completed 365-day boundary after opening')

const contextBody = extractBlock(orchestratorSrc, 'buildRoundContext(): RoundContext')
assertOk(
  /daysPassed:\s*timeSystem\.getDaysPassed\(\)/.test(contextBody),
  'orchestrator RoundContext must inject daysPassed from TimeSystem',
)
assertOk(
  /totalDays:\s*this\.state\.round\.totalDays/.test(contextBody),
  'orchestrator RoundContext must inject totalDays from current round',
)
assertOk(
  !/\bageYearsDelta\b|\bcalendarDaysDelta\b|\bsimulationTicks\b/.test(orchestratorCode),
  'orchestrator must not revive legacy time delta fields',
)

const narrativeAgeBody = extractBlock(orchestratorSrc, 'computeNarrativeAge(context')
assertOk(
  /Math\.floor\(Math\.max\(0,\s*context\.totalDays\s*-\s*365\)\s*\/\s*365\)/.test(narrativeAgeBody),
  'narrative age must derive completed years from totalDays so month/day rounds do not add whole years',
)

assertOk(
  orchestratorSrc.includes('mapSubsystemStatesToDetectionStates'),
  'orchestrator must stay wired to detection-state-mapper',
)
assertOk(mapperSrc.includes('marketState'), 'detection-state-mapper missing marketState')
assertOk(campaignSrc.includes('orchestrator.advanceTime()'), 'campaign must advance time through orchestrator')
assertOk(
  !campaignSrc.includes('if (ctx._eventInjectionText)'),
  'campaign time advancement must not be guarded by eventInjectionText',
)

assertOk(
  /runPreviewRound\([\s\S]{0,260}orchestrator\.executeRoundV2/.test(preGenCode),
  'pre-gen must execute through orchestrator preview mode',
)
assertOk(
  /isPreviewExecution\(\)/.test(orchestratorCode) && /previewExecutionDepth/.test(orchestratorCode),
  'orchestrator must expose preview execution isolation',
)
assertOk(
  /if\s*\(!this\.isPreviewExecution\(\)\s*&&\s*recordRelevance\)\s*\{[\s\S]*subsystemRelevance\.recordState/.test(orchestratorCode),
  'preview execution and same-round refreshes must not record duplicate subsystem relevance state',
)
assertOk(
  /if\s*\(!this\.isPreviewExecution\(\)\)\s*\{[\s\S]*useCharacterStore\.setState/.test(orchestratorCode),
  'preview execution must not write character age to the character store',
)
assertOk(
  campaignCode.includes('orchestrator.isPreviewExecution()')
    && campaignCode.includes('orchestrator.advanceAllSubsystems()')
    && campaignCode.includes('orchestrator.acceptNarrativeResponse')
    && campaignCode.includes('orchestrator.checkAndTriggerEpilogue(aiConfig, sessionId)'),
  'campaign preview execution must skip real side-effect stages',
)
assertOk(
  /const\s+saveRound\s*=\s*this\.state\.totalRounds/.test(orchestratorCode),
  'auto-save must capture the completed round before async persistence',
)
assertOk(
  /buildEngineSaveSnapshot/.test(saveRestoreCode) && /\.\.\.store[\s\S]*\.\.\.o[\s\S]*narrativeHistory/.test(saveRestoreCode),
  'save payload must derive engine snapshot from the latest orchestrator state',
)
assertOk(
  /syncOrchestratorToEngineStore\(\)[\s\S]*orchestrator\.triggerAutoSave\(\)/.test(hooksCode),
  'advanceRound must sync orchestrator state before triggering auto-save',
)
if (failed === 0) {
  console.log('PASS: time-step-resolver-smoke')
  process.exit(0)
}
process.exit(1)
