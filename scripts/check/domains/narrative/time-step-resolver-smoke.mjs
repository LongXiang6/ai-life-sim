/**
 * Stage A：时间步长与 RoundContext 日粒度契约冒烟。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

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
const orchestratorSrc = readRel('src/mods/mod-engine/subsystems/orchestrator-system.ts')
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

function specAlignAfterNarratedPeriod(prevUnit, round) {
  const next = { ...round }
  switch (prevUnit) {
    case 'year':
      next.totalDays += 365
      next.year += 1
      next.season = 0
      next.month = 0
      next.day = 0
      next.dayOfYear = 1
      break
    case 'season': {
      const startMonth = next.season * 3
      const days = MONTH_DAYS.slice(startMonth, startMonth + 3).reduce((sum, d) => sum + d, 0)
      next.totalDays += days
      next.season = (next.season + 1) % 4
      if (next.season === 0) next.year += 1
      next.month = next.season * 3
      next.day = 0
      next.dayOfYear = dayOfYearForMonth(next.month)
      break
    }
    case 'month':
      next.totalDays += MONTH_DAYS[next.month]
      next.month += 1
      if (next.month >= 12) {
        next.month = 0
        next.year += 1
      }
      next.day = 0
      next.season = Math.floor(next.month / 3)
      next.dayOfYear = dayOfYearForMonth(next.month)
      break
  }
  return next
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
  /alignRoundToNextPeriod\(prevUnit,\s*newUnit,\s*this\.round\)/.test(alignmentBody),
  'TimeSystem.alignToNextPeriod must use the pure boundary alignment helper',
)
assertOk(
  /this\.lastDaysPassed\s*=\s*aligned\.totalDays\s*-\s*beforeTotalDays/.test(alignmentBody),
  'TimeSystem.alignToNextPeriod must derive daysPassed from alignment totalDays delta',
)
assertOk(
  /shouldAlignTimeStepTransition/.test(timeSystemSrc),
  'time-system must expose coarse-to-fine transition detection',
)

const orchestratorAdvanceBody = extractBlock(orchestratorSrc, 'advanceTimeForCurrentStep(): RoundInfo')
assertOk(
  /this\.state\.narrativeHistory\.length\s*>\s*0/.test(orchestratorAdvanceBody),
  'orchestrator must only align switched time steps after at least one completed narrative',
)
assertOk(
  /shouldAlignTimeStepTransition\(this\.lastNarratedTimeStep\.unit,\s*this\.state\.timeStep\.unit\)/.test(orchestratorAdvanceBody),
  'orchestrator must detect coarse-to-fine time-step transitions from the last narrated step',
)
assertOk(
  /timeSystem\.alignToNextPeriod\(this\.lastNarratedTimeStep\.unit,\s*this\.state\.timeStep\.unit\)/.test(orchestratorAdvanceBody),
  'orchestrator must align the next round instead of re-entering the already narrated period',
)
assertOk(
  !/totalRounds\s*===\s*0/.test(orchestratorCode),
  'opening-round prompt logic must not rely on totalRounds === 0 after advanceTime increments it',
)

const yearToSeason = specAlignAfterNarratedPeriod('year', {
  year: 2010,
  season: 0,
  month: 0,
  day: 0,
  dayOfYear: 1,
  totalDays: 2010 * 365,
})
assertSame(yearToSeason.year, 2011, 'year->season must start at next year')
assertSame(yearToSeason.season, 0, 'year->season must start in spring')
assertSame(yearToSeason.month, 0, 'year->season must start in January')
assertSame(yearToSeason.totalDays, 2011 * 365, 'year->season must advance exactly one narrated year')

const seasonToMonth = specAlignAfterNarratedPeriod('season', {
  year: 2010,
  season: 1,
  month: 3,
  day: 0,
  dayOfYear: 91,
  totalDays: 2010 * 365 + 90,
})
assertSame(seasonToMonth.year, 2010, 'season->month summer must stay in the same year')
assertSame(seasonToMonth.season, 2, 'season->month summer must move to autumn quarter')
assertSame(seasonToMonth.month, 6, 'season->month summer must move to July')
assertSame(seasonToMonth.dayOfYear, 182, 'season->month summer must move to July 1')

const monthToDay = specAlignAfterNarratedPeriod('month', {
  year: 2010,
  season: 1,
  month: 5,
  day: 0,
  dayOfYear: 152,
  totalDays: 2010 * 365 + 151,
})
assertSame(monthToDay.month, 6, 'month->day June must move to July')
assertSame(monthToDay.day, 0, 'month->day must land on the first day of next month')
assertSame(monthToDay.dayOfYear, 182, 'month->day June must move to July 1')

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

assertOk(
  orchestratorSrc.includes('mapSubsystemStatesToDetectionStates'),
  'orchestrator must stay wired to detection-state-mapper',
)
assertOk(mapperSrc.includes('marketState'), 'detection-state-mapper missing marketState')
assertOk(campaignSrc.includes('orchestrator.advanceTime()'), 'campaign must advance time through orchestrator')
assertOk(
  !campaignSrc.includes('if (ctx._eventInjectionText)'),
  'campaign cross-domain must not be guarded by eventInjectionText',
)

assertOk(
  /runPreviewRound\(\s*\(\)\s*=>\s*orchestrator\.executeRoundV2/.test(preGenCode),
  'pre-gen must execute through orchestrator preview mode',
)
assertOk(
  /isPreviewExecution\(\)/.test(orchestratorCode) && /previewExecutionDepth/.test(orchestratorCode),
  'orchestrator must expose preview execution isolation',
)
assertOk(
  /if\s*\(!this\.isPreviewExecution\(\)\)\s*\{[\s\S]*subsystemRelevance\.recordState/.test(orchestratorCode),
  'preview execution must not record subsystem relevance state',
)
assertOk(
  /if\s*\(!this\.isPreviewExecution\(\)\)\s*\{[\s\S]*useCharacterStore\.setState/.test(orchestratorCode),
  'preview execution must not write character age to the character store',
)
assertOk(
  campaignCode.includes('orchestrator.isPreviewExecution()')
    && campaignCode.includes('orchestrator.advanceAllSubsystems()')
    && campaignCode.includes('orchestrator.executeCrossDomainLinkage()')
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
