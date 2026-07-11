/**
 * @module playtest-quality-regression.mjs
 * @description 2026-07-10 测试反馈回归：预生成、解析、命格、历法、分叉与 UI。
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

import { PreGenActivityState } from '../../../../src/mods/mod-engine/helpers/pre-gen-activity-state.ts'
import { isEligibleNarrativeBranch } from '../../../../src/mods/mod-engine/helpers/narrative-branch-policy.ts'
import { extractTaggedMetaEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import {
  rejectsFutureDestinyPatternContent,
} from '../../../../src/mods/mod-character/utils/destiny-pattern-content-quality.ts'
import { findFestivalsOnDate } from '../../../../src/mods/mod-culture/utils/festival-calendar.ts'

const root = getProjectRoot(import.meta.url)
let failed = 0

function readRel(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
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

// 预生成：失效只代表结果不可用，后台执行结束前仍必须保持 active，阻止主推进并发写单例。
const activity = new PreGenActivityState()
const generation = activity.begin()
assertOk(activity.isActive(), 'pre-gen begin must mark execution active')
activity.invalidate()
assertOk(activity.isActive(), 'invalidating pre-gen result must not pretend execution already stopped')
assertOk(!activity.isCurrent(generation), 'invalidated generation must be stale')
activity.finish(generation)
assertOk(!activity.isActive(), 'pre-gen finish must release the single-writer gate')

const validEnvelope = extractTaggedMetaEnvelope(
  '[NARRATIVE]第一段。\n\n第二段。[/NARRATIVE]\n[META]{"changes":[]}[/META]',
)
assertSame(validEnvelope?.narrative, '第一段。\n\n第二段。', 'valid tagged envelope narrative')
assertSame(validEnvelope?.metaJson, '{"changes":[]}', 'valid tagged envelope meta')

const duplicatedNarrativeTag = extractTaggedMetaEnvelope(
  '[NARRATIVE]完整正文第一段。\n\n完整正文第二段。[NARRATIVE]\n[META]{"changes":[],"digest":"含有{括号}的字符串"}[/META]',
)
assertOk(
  duplicatedNarrativeTag?.narrative.includes('完整正文第二段。'),
  'duplicated [NARRATIVE] must be tolerated as a mistaken closing marker',
)

const missingClosers = extractTaggedMetaEnvelope(
  '[NARRATIVE]没有正文结束标签，但内容完整。\n[META]{"changes":[],"digest":"仍应恢复"}',
)
assertSame(
  missingClosers?.narrative,
  '没有正文结束标签，但内容完整。',
  'META opening must terminate narrative when [/NARRATIVE] is missing',
)
assertSame(
  missingClosers?.metaJson,
  '{"changes":[],"digest":"仍应恢复"}',
  'balanced META JSON must recover without [/META]',
)

assertOk(
  rejectsFutureDestinyPatternContent({ description: '1999年深秋，你路过一间旧书店。' }),
  'destiny quality gate must reject absolute-year biography',
)
assertOk(
  rejectsFutureDestinyPatternContent({ description: '你曾在一次争执中发现自己不会退让。' }),
  'destiny quality gate must reject past biographical events',
)
assertOk(
  !rejectsFutureDestinyPatternContent({ description: '你天生擅长从细微声响中识别机械结构与异常。' }),
  'destiny quality gate must allow timeless inherent traits',
)

const festivals = [
  { name: '星潮纪念日', date: '3-15', description: '纪念星潮归来', importance: 4 },
  { name: '仙盟大会', date: '3-15', description: '五年一度', importance: 5, frequencyYears: 5 },
  { name: '丰收礼', date: '9-15', description: '庆祝收获', importance: 3 },
]
assertSame(findFestivalsOnDate(festivals, 3, 15).length, 1, 'festival adapter must match exact month/day')
assertSame(findFestivalsOnDate(festivals, 3, 16).length, 0, 'festival adapter must not match by month only')
assertSame(findFestivalsOnDate(festivals, 3, 15)[0]?.name, '星潮纪念日', 'festival adapter must suppress multi-year festivals without a year anchor')

assertOk(isEligibleNarrativeBranch({
  branch: true,
  importance: 'HIGH',
  branchOptions: ['承担后果', '另寻出路'],
}), 'HIGH branch with two valid options must be eligible')
assertOk(!isEligibleNarrativeBranch({
  branch: true,
  importance: 'NORMAL',
  branchOptions: ['承担后果', '另寻出路'],
}), 'non-HIGH branch must be suppressed')
assertOk(!isEligibleNarrativeBranch({
  branch: true,
  importance: 'HIGH',
  branchOptions: ['唯一选项', '   '],
}), 'branch with fewer than two valid options must be suppressed')

const constantsSrc = readRel('src/mods/mod-character/constants.ts')
const destinySystemSrc = readRel('src/mods/mod-character/subsystems/destiny-pattern-system.ts')
const destinyPromptSrc = readRel('src/mods/mod-character/prompts/destiny-pattern-prompt.ts')
const talentDrawPageSrc = readRel('src/mods/mod-pages/pages/talent-draw/page.tsx')
const preGenSrc = readRel('src/mods/mod-engine/helpers/pre-gen-queue.ts')
const branchPolicySrc = readRel('src/mods/mod-engine/helpers/narrative-branch-policy.ts')
const hooksSrc = readRel('src/mods/mod-engine/hooks.ts')
const orchestratorSrc = readRel('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const timeScaleSrc = readRel('src/mods/mod-engine/helpers/time-scale-narrative.ts')
const narrativeCalendarSrc = readRel('src/mods/mod-engine/helpers/narrative-calendar.ts')
const narrativePromptSrc = readRel('src/mods/mod-engine/prompts/narrative-prompt.ts')
const timelineCssSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.module.css')
const timelineTsxSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx')
const cultureIndexSrc = readRel('src/mods/mod-culture/index.ts')

assertOk(/AI_DESTINY_PATTERN_BATCH_SIZE\s*=\s*12/.test(constantsSrc), 'destiny first batch must request 12 items')
assertOk(/AI_DESTINY_PATTERN_BATCH_COUNT\s*=\s*8/.test(constantsSrc), 'destiny background batches must keep a 96-item full pool')
assertOk(!constantsSrc.includes('DESTINY_PATTERN_EARLY_READY_TIMEOUT_MS'), 'AI destiny readiness must not time out to presets')
assertOk(!destinySystemSrc.includes('PARALLEL_SEEDS'), 'destiny initial generation must not launch three large parallel calls')
assertOk(!destinyPromptSrc.includes('第一次踩上'), 'destiny prompt must not teach biographical event openings')
assertOk(/稳定|先天|固有/.test(destinyPromptSrc) && /禁止.*年份|严禁.*年份/.test(destinyPromptSrc), 'destiny prompt must require timeless traits')
assertOk(destinyPromptSrc.includes('JSON顶层数组') && !destinyPromptSrc.includes('{"patterns"'), 'destiny prompt must match the top-level array Zod contract')
assertOk(/version:\s*'2\.8\.0'/.test(destinyPromptSrc), 'destiny prompt contract change must bump its version')
assertOk(destinyPromptSrc.includes('systemModifiers: destinyPatternSystemModifiersSchema.optional()'), 'destiny schema must accept validated system modifiers')
assertOk(/legendary允许轻度概念规则/.test(destinyPromptSrc), 'legendary destiny patterns must support bounded conceptual rules')
assertOk(/不得自动获胜/.test(destinyPromptSrc) && /条件、概率、代价、有限触发/.test(destinyPromptSrc), 'legendary conceptual rules must preserve cost and agency')
assertOk(/effect写成叙事引擎可持续遵守的规则/.test(destinyPromptSrc), 'destiny effect must remain a narrative rule instead of only numeric modifiers')
assertOk(/validatePatternSystemModifiers\(input\.systemModifiers, rarity\)/.test(destinySystemSrc), 'external AI destiny injection must validate system modifiers')
assertOk(!talentDrawPageSrc.includes('buildTimeoutFallback'), 'AI destiny page must not build a preset timeout fallback')
assertOk(!talentDrawPageSrc.includes('fallbackTimer'), 'AI destiny page must keep waiting instead of starting a fallback timer')
assertSame(
  talentDrawPageSrc.match(/generateFromPresets\s*\(/g)?.length ?? 0,
  1,
  'preset generation must appear only in the explicit non-AI branch',
)
assertOk(
  /if\s*\(!aiTalentGeneration\)\s*\{[\s\S]{0,260}generateFromPresets\s*\(/.test(talentDrawPageSrc),
  'preset generation must stay behind the disabled-AI branch',
)
assertOk(
  /while\s*\(\s*!earlyReadyFired\s*&&\s*!abortController\.signal\.aborted\s*\)/.test(destinySystemSrc),
  'AI destiny readiness must keep requesting until 12 valid items or cancellation',
)
assertOk(
  /dedupePatterns\(options\?\.initialPatterns \?\? \[\]\)[\s\S]{0,100}filter\(\(pattern\) => this\.isAIGeneratedPattern\(pattern\)\)/.test(destinySystemSrc),
  'generateWithAI must reject preset entries even when a caller passes them as initial cache',
)
assertOk(
  !/!earlyReadyFired[\s\S]{0,180}nextBackgroundBatch\s*<\s*AI_DESTINY_PATTERN_BATCH_COUNT/.test(destinySystemSrc),
  'AI destiny readiness must not stop at the eight background batches',
)
assertOk(
  /getPoolFillStatus\(\)[\s\S]{0,180}status\.inProgress[\s\S]{0,120}status\.count\s*<\s*DEFAULT_DESTINY_PATTERN_COUNT[\s\S]{0,120}abortPoolFill\(\)/.test(talentDrawPageSrc),
  'leaving the page must abort an unfinished under-12 AI readiness loop',
)
assertOk(
  /isAIGeneratedPattern[\s\S]{0,500}loadDestinyPatternPool[\s\S]{0,160}filter\(isAIGeneratedPattern\)/.test(talentDrawPageSrc),
  'AI cache restoration must exclude preset patterns',
)
assertOk(
  /const usableSaved = savedSlotsMatchMode \? saved : null/.test(talentDrawPageSrc),
  'an incompatible saved selection must not fall through into the selecting phase',
)

assertOk(/preGenActivity\.invalidate\(\)/.test(preGenSrc), 'clearPreGenQueue must invalidate through activity state')
assertOk(!/clearPreGenQueue\(\)[\s\S]{0,220}isPreGenActive\s*=\s*false/.test(preGenSrc), 'queue clear must not release an active preview early')
const waitIndex = hooksSrc.indexOf('waitForPreGenQueueItem')
const syncStepIndex = hooksSrc.indexOf('orchestrator.setTimeStep', waitIndex)
assertOk(waitIndex >= 0 && syncStepIndex > waitIndex, 'main round must wait for preview before mutating orchestrator time step')
assertOk(orchestratorSrc.includes('pendingTimeStepAlignmentFromUnit'), 'orchestrator snapshot/hydration must preserve pending alignment')
assertOk(orchestratorSrc.includes('capturePreviewSnapshot'), 'pre-gen snapshots must include runtime-only pending alignment')
assertOk(/hydrateFromEngineStore\(previousTimeStep\?/.test(orchestratorSrc), 'stale preview hydration must accept the previous time step')
assertOk(orchestratorSrc.includes('reconcilePreviewSnapshotWithEngineStore'), 'stale preview must reconcile non-store state before hydrating authoritative store state')

assertOk(timeScaleSrc.includes('年度宏观视角'), 'year step must use annual macro perspective')
assertOk(timeScaleSrc.includes('季度中景视角'), 'season step must use quarterly medium perspective')
assertOk(timeScaleSrc.includes('月度近景视角'), 'month step must use monthly close perspective')
assertOk(timeScaleSrc.includes('单日生活视角'), 'day step must use daily-life perspective')
assertOk(/case 'year'[\s\S]{0,120}return eraLabel/.test(narrativeCalendarSrc), 'year label must contain only the year/era')
assertOk(/case 'season'[\s\S]{0,160}SEASON_NAMES/.test(narrativeCalendarSrc), 'season label must include year and season')
assertOk(/case 'month'[\s\S]{0,220}round\.month \+ 1/.test(narrativeCalendarSrc), 'month label must include year, season and month')
assertOk(/case 'day'[\s\S]{0,260}dayNum/.test(narrativeCalendarSrc), 'day label must include year, season, month and day')
assertOk(orchestratorSrc.includes('currentTime: narrativeTime.timeLabel'), 'AI currentTime must use the authoritative formatted time label')

// 2007年夏季5月切到季推进：连续推进5/6/7月后应落在8月，即秋季，不回到本年春季。
const mayIndex = 4
const monthAfterSeasonStep = (mayIndex + 3) % 12
assertSame(Math.floor(monthAfterSeasonStep / 3), 2, 'month->season must land in the following season')
assertOk(/candidate\.importance\s*===\s*'HIGH'/.test(branchPolicySrc), 'ordinary branch points must require HIGH importance')
assertOk(narrativePromptSrc.includes('身份、核心关系、长期目标、关键资源、阵营、存亡或不可逆轨迹'), 'branch prompt must define fate-changing impact dimensions')
assertOk(orchestratorSrc.includes('buildPowerCeilingPresetsForNarrative'), 'narrative prompt must use the compact power context helper')
assertOk(/powerSystemTag[\s\S]{0,180}none/.test(orchestratorSrc), 'non-supernatural worlds must omit irrelevant power presets')
assertOk(cultureIndexSrc.includes('buildCultureCalendarNarrativeContext'), 'mod-culture must expose the calendar adapter')

assertOk(!timelineCssSrc.includes('.entryLatest'), 'latest narrative must not have a special background rule')
assertOk(!timelineTsxSrc.includes('styles.entryLatest'), 'latest narrative must not receive a special style class')

if (failed === 0) {
  console.log('PASS: playtest-quality-regression')
  process.exit(0)
}

process.exit(1)
