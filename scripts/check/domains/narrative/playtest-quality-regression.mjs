/**
 * @module playtest-quality-regression.mjs
 * @description 2026-07-10 测试反馈回归：预生成、解析、命格、历法、分叉与 UI。
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'

import { PreGenActivityState } from '../../../../src/mods/mod-engine/helpers/pre-gen-activity-state.ts'
import { parseNarrativeResponseEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import {
  buildCanonicalCalendarNarrativeHint,
  buildTimeScaleNarrativeHint,
  getTimeScaleNarrativeProfile,
  TIME_SCALE_NARRATIVE_PROFILES,
} from '../../../../src/mods/mod-engine/helpers/time-scale-narrative.ts'
import { normalizeNarrativeParagraphs } from '../../../../src/mods/mod-engine/helpers/normalize-narrative-paragraphs.ts'
import {
  DEFAULT_WORD_COUNT_TARGET,
  buildWordCountInstruction,
  computeNarrativeMaxTokens,
  resolveNarrativeWordCountRange,
} from '../../../../src/mods/mod-engine/constants/narrative-config.ts'
import { buildLifecycleNarrativeHint } from '../../../../src/mods/mod-engine/helpers/lifecycle-narrative.ts'
import { buildNarrativeCoherenceHeader } from '../../../../src/mods/mod-engine/helpers/subsystem-prompt-gate.ts'
import {
  NARRATIVE_WORD_COUNT_TARGETS,
  resolveNarrativeWordCountTarget,
} from '../../../../src/foundation/constants/narrative-word-count.ts'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
} from '../../../../src/core/ai-service/provider-config.ts'
import { AVAILABLE_TIME_STEPS, encodeTimeStepKey } from '../../../../src/foundation/constants/time-steps.ts'
import { COMPILED_NARRATIVE_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import {
  NarrativeAIBranchSchema,
  NarrativeAISettlementDataSchema,
  translateNarrativeAISettlement,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { NarrativeRoundMetadataSchema } from '../../../../src/mods/mod-engine/helpers/narrative-semantic-signals.ts'
import {
  rejectsFutureDestinyPatternContent,
} from '../../../../src/mods/mod-character/utils/destiny-pattern-content-quality.ts'
import { sanitizeCharacterStateSnapshot } from '../../../../src/mods/mod-character/utils/character-state-migration.ts'
import { mythicPatternOutputSchema } from '../../../../src/mods/mod-character/prompts/mythic-pattern-prompt.ts'
import { destinyPatternOutputSchema } from '../../../../src/mods/mod-character/prompts/destiny-pattern-prompt.ts'
import { findFestivalsOnDate } from '../../../../src/mods/mod-culture/utils/festival-calendar.ts'
import {
  formatWorldTagsText,
  WORLDVIEW_TAG_DEFAULTS,
} from '../../../../src/mods/mod-world/constants/world-tag-defaults.ts'
import { sanitizeWorldStateSnapshot } from '../../../../src/mods/mod-world/utils/world-state-migration.ts'

const root = getProjectRoot(import.meta.url)
let failed = 0
const narrativeQualitySrc = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-response-quality.ts'),
  'utf8',
)

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

function assertIncludes(actual, expected, message) {
  assertOk(actual.includes(expected), `${message} (missing=${expected})`)
}

function assertThrows(action, message) {
  try {
    action()
    assertOk(false, message)
  } catch {
    // Expected rejection.
  }
}

function isEligibleNarrativeBranch(candidate) {
  return NarrativeRoundMetadataSchema.safeParse({
    branch: candidate.branch,
    branchTitle: '命运抉择',
    branchOptions: candidate.branchOptions,
    importance: candidate.importance,
    arcStatus: 'ongoing',
    semanticSignals: {
      eventType: 'relationship',
      conflictIntensity: 20,
      tensionDelta: 2,
      actionScale: 'medium',
      impactScope: 'relationship',
      registerReason: '选择会改变长期轨迹。',
      arcType: 'relationship',
      relationshipUpdates: [],
      resolvedForeshadowingIds: [],
      ...candidate.semanticSignals,
    },
  }).success
}

function compactNarrative(text) {
  return text.replace(/\s+/g, '')
}

function loadPersistMigration(sourceText) {
  const sourceFile = ts.createSourceFile('settings-store.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let migrationExpression
  const visit = (node) => {
    if (
      !migrationExpression
      && ts.isPropertyAssignment(node)
      && node.name.getText(sourceFile) === 'migrate'
    ) {
      migrationExpression = node.initializer.getText(sourceFile)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (!migrationExpression) throw new Error('settings persist migration not found')

  const transpiled = ts.transpileModule(
    `module.exports = ${migrationExpression}`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const module = { exports: undefined }
  new Function(
    'module',
    'exports',
    'DEFAULT_WORD_COUNT_TARGET',
    'DEFAULT_AI_BASE_URL',
    'DEFAULT_AI_PROVIDER_ID',
    'DEFAULT_AI_MODEL',
    'normalizeReasoningEffort',
    'normalizeImportedModelSettings',
    transpiled,
  )(
    module,
    module.exports,
    DEFAULT_WORD_COUNT_TARGET,
    DEFAULT_AI_BASE_URL,
    DEFAULT_AI_PROVIDER_ID,
    DEFAULT_AI_MODEL,
    (value) => ({
      disabled: 'disabled',
      'level-1': 'auto',
      'level-2': 'auto',
      'level-3': 'high',
      'level-4': 'high',
      'level-5': 'high',
      'level-6': 'max',
      auto: 'auto',
      high: 'high',
      max: 'max',
    })[value] ?? 'disabled',
    (value) => {
      const provider = typeof value.provider === 'string' ? value.provider : DEFAULT_AI_PROVIDER_ID
      const customKey = typeof value.customKey === 'string' ? value.customKey.trim() : ''
      const customUrl = typeof value.customUrl === 'string' ? value.customUrl.trim() : ''
      const customModel = typeof value.customModel === 'string' ? value.customModel.trim() : ''
      const hasPlayerOwnedTarget = provider === 'custom' || Boolean(customKey || customUrl)
      return {
        provider: DEFAULT_AI_PROVIDER_ID,
        customKey: hasPlayerOwnedTarget ? customKey : '',
        customUrl: hasPlayerOwnedTarget && customUrl ? customUrl : DEFAULT_AI_BASE_URL,
        customModel: hasPlayerOwnedTarget && customModel ? customModel : DEFAULT_AI_MODEL,
      }
    },
  )
  return module.exports
}

function loadTalentPoolHelpers(sourceText) {
  const sourceFile = ts.createSourceFile('talent-draw-page.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const helperNames = new Set(['patternNameKey', 'uniquePatternsByIdentity', 'drawSlotsFromPool'])
  const declarations = []
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && helperNames.has(statement.name.text)) {
      declarations.push(statement.getText(sourceFile))
    }
  }
  assertSame(declarations.length, helperNames.size, 'talent draw pool helpers must remain executable regression targets')

  const transpiled = ts.transpileModule(
    `${declarations.join('\n')}\nmodule.exports = { uniquePatternsByIdentity, drawSlotsFromPool }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const module = { exports: undefined }
  new Function('module', 'exports', 'DESTINY_PATTERN_DISPLAY_COUNT', transpiled)(module, module.exports, 12)
  return module.exports
}

function assertParagraphsPreservingContent(input, expectedParagraphs, message) {
  const normalized = normalizeNarrativeParagraphs(input)
  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean)
  assertSame(paragraphs.length, expectedParagraphs, `${message}: must preserve natural paragraph count`)
  assertSame(
    compactNarrative(normalized),
    compactNarrative(input).replaceAll('晩', '晚'),
    `${message}: normalization must preserve the full narrative`,
  )
}

assertParagraphsPreservingContent(
  '第一句交代起点。第二句出现压力。第三句采取行动。第四句遇到阻力。第五句形成后果。第六句留下线索但没有句号',
  1,
  'single-paragraph narrative',
)
assertParagraphsPreservingContent(
  `第一段完整保留。

第二段也要保留未完成的尾句`,
  2,
  'two-paragraph narrative',
)
assertParagraphsPreservingContent(
  `第一段。

第二段。

第三段。

第四段。

第五段。`,
  5,
  'five-paragraph narrative',
)

const expectedTimeScaleKeys = AVAILABLE_TIME_STEPS.map(encodeTimeStepKey)
assertSame(TIME_SCALE_NARRATIVE_PROFILES.length, expectedTimeScaleKeys.length, 'every available time step must own one narrative profile')
assertSame(new Set(TIME_SCALE_NARRATIVE_PROFILES.map((profile) => profile.key)).size, expectedTimeScaleKeys.length, 'time-scale profile keys must be unique')
assertSame(new Set(TIME_SCALE_NARRATIVE_PROFILES.map((profile) => profile.id)).size, expectedTimeScaleKeys.length, 'time-scale profile IDs must be unique')
assertOk(
  expectedTimeScaleKeys.every((key, index) => TIME_SCALE_NARRATIVE_PROFILES[index]?.key === key),
  'time-scale profiles must follow the same semantic order as available time steps',
)
assertOk(
  TIME_SCALE_NARRATIVE_PROFILES.every((profile, index, profiles) => index === 0 || profile.macroLevel > profiles[index - 1].macroLevel),
  'time-scale macro levels must increase strictly from day to millennium',
)
for (const option of AVAILABLE_TIME_STEPS) {
  const profile = getTimeScaleNarrativeProfile(option)
  const hint = buildTimeScaleNarrativeHint(option)
  assertSame(profile.key, encodeTimeStepKey(option), `profile key must match ${encodeTimeStepKey(option)}`)
  assertIncludes(hint, profile.prompt, `${profile.id} prompt must enter the assembled time guidance`)
}

const oneYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 1 })
assertIncludes(oneYearHint, '年度全景视角', 'one-year hint must use an annual panorama')
assertIncludes(oneYearHint, '不得把年度压缩成一个现场', 'one-year hint must reject a single-scene annual result')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '日级可用一个可感知现场承载主线', 'fixed prompt must reserve single-scene focus for the daily scale')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '年级及以上依本轮时间尺度用多个阶段节点或时代断点承载同一因果主线', 'fixed prompt must require multi-stage long-span narration')
assertOk(!COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('若本轮按年或更长跨度推进，正文仍只选择一个代表性现场'), 'fixed prompt must not force annual or longer spans into one scene')
assertOk(!COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('先选择能在该区间内自然收束的单一事件'), 'word-count guidance must not override long-span narrative scale')
const tenYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 10 })
assertIncludes(tenYearHint, '十年转型视角', 'ten-year hint must use decade transformation')
const fiftyYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 50 })
assertIncludes(fiftyYearHint, '半世纪历史视角', 'fifty-year hint must use historical perspective')
assertIncludes(fiftyYearHint, '起点阶段、中段决定性转折和结束格局三个明确时期', 'fifty-year hint must require three explicit historical periods')
assertIncludes(fiftyYearHint, '大部分篇幅不得停留在结束节点当天或任何单一现场', 'fifty-year hint must not collapse into the ending-day scene')
const millenniumHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 1000 })
assertIncludes(millenniumHint, '千年时代与遗产视角', 'millennium hint must use civilizational legacy perspective')

const januaryCalendar = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'day', value: 1 },
  calendarYear: 2026,
  month: 1,
  day: 2,
})
assertIncludes(januaryCalendar, '3—5月春季、6—8月夏季、9—11月秋季、12—2月冬季', 'calendar hint must define canonical solar months')
assertIncludes(januaryCalendar, '结束节点属于冬季', 'January must resolve to winter')
assertIncludes(januaryCalendar, '1月必须称冬季', 'cold January weather must not be relabeled as another season')
assertIncludes(januaryCalendar, '不得把该月改称其他季节', 'calendar guidance must separate weather from season naming')

const crossYearDays = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'day', value: 3 },
  calendarYear: 2026,
  month: 1,
  day: 2,
})
assertIncludes(crossYearDays, '2025年12月31日至2026年1月2日，共3天', 'day span must cross the year canonically')

const crossSeasonMonths = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'month', value: 3 },
  calendarYear: 2026,
  month: 2,
  day: 1,
})
assertIncludes(crossSeasonMonths, '2025年12月至2026年2月，共3个月', 'month span must cross year and season')
assertIncludes(crossSeasonMonths, '结束节点属于冬季', 'February must resolve to winter')

const multiSeasonCalendar = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'season', value: 2 },
  calendarYear: 2026,
  month: 8,
  day: 1,
})
assertIncludes(multiSeasonCalendar, '连续推进2个季度（6个月）', 'season hint must respect requested amount')
assertIncludes(multiSeasonCalendar, '不得把跨季跨度写成单一季节', 'multi-season hint must require seasonal change')

const multiYearCalendar = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'year', value: 10 },
  calendarYear: 2035,
  month: 1,
  day: 1,
})
assertIncludes(multiYearCalendar, '2026年至2035年，共10年', 'year span must name its complete range')
assertIncludes(multiYearCalendar, '不能只描写目标年份', 'calendar hint must reject target-year-only output')

const oneYearCalendar = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'year', value: 1 },
  calendarYear: 2026,
  month: 1,
  day: 1,
})
assertIncludes(oneYearCalendar, '年度推进必须表现年初格局', 'single-year calendar guidance must require annual coverage')
assertIncludes(oneYearCalendar, '不得压成单一现场', 'single-year calendar guidance must reject a single-scene annual result')
assertOk(!oneYearCalendar.includes('多年推进必须'), 'single-year calendar guidance must not request a multi-year composition')

const coarseToFineWindow = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'month', value: 1 },
  calendarYear: 2026,
  month: 2,
  day: 1,
  previousNode: { calendarYear: 2026, month: 1, day: 1 },
  daysPassed: 31,
})
assertIncludes(coarseToFineWindow, '上一叙事节点为2026年1月1日', 'runtime calendar hint must name the previous narrative node')
assertIncludes(coarseToFineWindow, '当前结束节点为2026年2月1日', 'runtime calendar hint must name the current end node')
assertIncludes(coarseToFineWindow, '已推进31天（1月）', 'runtime calendar hint must use actual elapsed days after a coarse-to-fine switch')
assertIncludes(coarseToFineWindow, '不得重复上一节点之前已经完成的周期', 'runtime calendar hint must prohibit replaying completed periods')
assertOk(!coarseToFineWindow.includes('本轮覆盖2026年2月'), 'runtime month span must not mislabel the ended February node as the narrated month')

const alignedBridgeWindow = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'month', value: 1 },
  calendarYear: 1003,
  month: 1,
  day: 1,
  previousNode: { calendarYear: 1002, month: 1, day: 1 },
  daysPassed: 365,
  timeStepAlignment: { fromUnit: 'year', fromValue: 1 },
})
assertIncludes(alignedBridgeWindow, '边界对齐桥接', 'coarse-to-fine bridge must be explicit in the calendar prompt')
assertIncludes(alignedBridgeWindow, '不能把被跳过的跨度重新写成当前月的流水账', 'bridge prompt must prevent replaying the skipped coarse window')

// 预生成：失效只代表结果不可用，后台执行结束前仍占用单写者，
// 但主推进不能继续等待已经失效的结果。
const activity = new PreGenActivityState()
const generation = activity.begin()
assertOk(activity.isActive(), 'pre-gen begin must mark execution active')
activity.invalidate()
assertOk(!activity.isActive(), 'invalidating pre-gen result must release player-facing wait state')
assertOk(activity.isRunning(), 'invalidating pre-gen result must retain the background single-writer gate')
assertOk(!activity.isCurrent(generation), 'invalidated generation must be stale')
activity.finish(generation)
assertOk(!activity.isActive(), 'pre-gen finish must release the single-writer gate')
assertOk(!activity.isRunning(), 'pre-gen finish must release the background execution state')

const validEnvelope = parseNarrativeResponseEnvelope('⟦正文⟧第一段。\n\n第二段。')
assertSame(validEnvelope.narrative, '第一段。\n\n第二段。', 'valid tagged narrative body')
assertSame(
  parseNarrativeResponseEnvelope('正文。').narrative,
  '正文。',
  'a complete plain narrative must be usable without a format retry',
)

const minimumEnvelope = parseNarrativeResponseEnvelope(
  `⟦正文⟧完整正文第一段。\n\n完整正文第二段。\n\n⟦分支⟧${JSON.stringify({
    标题: '选择去向',
    选项: ['留下', '迁居'],
  })}`,
)
assertOk(
  minimumEnvelope.narrative.includes('完整正文第二段。')
    && minimumEnvelope.branch?.选项.length === 2,
  'first response must parse complete body plus an optional compact branch',
)
for (const invalidFirstResponse of [
  '⟦正文⟧',
  '⟦正文⟧正文。\n\n⟦摘要⟧旧摘要',
  '⟦正文⟧正文。\n\n⟦数据⟧{}',
  '⟦正文⟧正文。\n\n⟦结束⟧',
]) {
  assertThrows(
    () => parseNarrativeResponseEnvelope(invalidFirstResponse),
    `strict first response must reject legacy or malformed content: ${invalidFirstResponse}`,
  )
}

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

const validMythicCandidates = Array.from({ length: 3 }, (_, index) => ({
  name: `神话${index}`,
  concept: `概念${index}`,
  effect: '这是一条保留现实代价、玩家选择余地、外部对抗空间与结果不确定性的纯概念叙事规则。',
}))
assertOk(mythicPatternOutputSchema.safeParse(validMythicCandidates).success, 'mythic schema must accept exactly three valid concepts')
assertOk(!mythicPatternOutputSchema.safeParse(validMythicCandidates.slice(0, 2)).success, 'mythic schema must reject fewer than three concepts')

const migratedCharacter = sanitizeCharacterStateSnapshot({
  characterBase: {
    base: { physique: 1, mind: 2, talentAptitude: 3, charisma: 4, resources: 9 },
    current: { physique: 1, mind: 2, talentAptitude: 3, charisma: 4, resources: 9 },
    modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 2 },
    startingAge: 18,
  },
  destinyPatterns: {
    candidates: [],
    patterns: [{
      id: 'legacy-pattern',
      name: '旧命格',
      description: '旧命格描述',
      effect: '旧命格效果',
      rarity: 'rare',
      polarity: 'positive',
      attrBonus: { mind: 1, resources: 4 },
    }],
  },
  talents: [],
})
assertOk(!('resources' in migratedCharacter.characterBase.base), 'old character saves must remove resources from base attributes')
assertOk(!('resources' in migratedCharacter.destinyPatterns.patterns[0].attrBonus), 'old character saves must remove resources from destiny bonuses')
assertSame(migratedCharacter.equippedMythicPatterns.length, 0, 'old character saves must default equipped mythic slots to empty')

const legacyScpDescription = '基金会为收容物赋予SCP编号。休谟指数用于衡量现实强度，现实扭曲者能够改变规则。玩家追加：故事从2000年开始。'
let migratedScpWorld
for (const legacyPowerSystemTag of ['none', 'technology']) {
  migratedScpWorld = sanitizeWorldStateSnapshot({
    worldConfig: {
      name: 'SCP基金会',
      description: legacyScpDescription,
      essenceTag: 'modern',
      powerSystemTag: legacyPowerSystemTag,
      powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
      spatialForm: 'plane',
      civilizationStage: 'modern',
      difficulty: 'hard',
      worldType: 'idealist',
      _dimensionValues: {
        universeScale: '位面',
        worldviewEssence: '唯物主义',
        powerSystem: '科技体系',
        powerFramework: '无超常力量体系',
      },
    },
    calibration: {
      metadata: {
        essenceTag: 'modern',
        civilizationStage: 'modern',
        powerSystemTag: legacyPowerSystemTag,
        spatialForm: 'plane',
        difficulty: 'hard',
      },
      timeline: { eraStartYear: 2000 },
      formulas: { techProgressModifier: 1.4 },
    },
    worldTags: ['无超自然', '异常收容', '休谟指数'],
    entities: [{ id: 'site-19', name: 'Site-19' }],
    eraStartYear: 2000,
  })
  assertSame(migratedScpWorld.worldConfig.essenceTag, 'mixed', `old SCP ${legacyPowerSystemTag} saves must migrate to mixed essence`)
  assertSame(migratedScpWorld.worldConfig.powerSystemTag, 'mixed', `old SCP ${legacyPowerSystemTag} saves must migrate to mixed power system`)
  assertSame(migratedScpWorld.worldConfig.worldType, 'mixed', `old SCP ${legacyPowerSystemTag} saves must migrate to mixed world type`)
  assertSame(migratedScpWorld.worldConfig.description, legacyScpDescription, 'old SCP descriptions and player additions must be preserved')
  assertSame(migratedScpWorld.worldConfig.spatialForm, 'plane', 'old SCP spatial form must be preserved')
  assertSame(migratedScpWorld.worldConfig.difficulty, 'hard', 'old SCP difficulty must be preserved')
  assertSame(migratedScpWorld.eraStartYear, 2000, 'old SCP era must be preserved')
  assertSame(migratedScpWorld.calibration.metadata.essenceTag, 'mixed', 'old SCP calibration metadata must match migrated essence')
  assertSame(migratedScpWorld.calibration.metadata.powerSystemTag, 'mixed', 'old SCP calibration metadata must match migrated power system')
  assertSame(migratedScpWorld.calibration.formulas.techProgressModifier, 1.4, 'old SCP numeric calibration must be preserved')
  assertOk(
    migratedScpWorld.entities[0].id.endsWith(':entity:site-19'),
    'old SCP entities must receive the P0 global context namespace',
  )
  assertSame(migratedScpWorld.entities[0].localId, 'site-19', 'old SCP local entity IDs must remain available as migration metadata')
  assertSame(migratedScpWorld.worldTags.length, 2, 'only contradictory old SCP atmosphere tags must be invalidated')
  assertSame(migratedScpWorld.worldTags[0], '异常收容', 'valid old SCP atmosphere tags must be preserved')
  assertSame(migratedScpWorld.worldTags[1], '休谟指数', 'valid old SCP setting facts must remain available to the Prompt')
  assertSame(migratedScpWorld.worldConfig._dimensionValues.universeScale, '位面', 'unrelated dimension display values must be preserved')
  assertOk(!('worldviewEssence' in migratedScpWorld.worldConfig._dimensionValues), 'old SCP essence display overrides must be cleared')
  assertOk(!('powerSystem' in migratedScpWorld.worldConfig._dimensionValues), 'old SCP power display overrides must be cleared')
}

const migratedScpLedger = formatWorldTagsText(WORLDVIEW_TAG_DEFAULTS[migratedScpWorld.worldConfig.essenceTag])
assertIncludes(migratedScpLedger, '科技与超自然共存', 'migrated SCP ledger must state the mixed-world rule')
assertOk(!migratedScpLedger.includes('无超自然'), 'migrated SCP ledger must not claim there is no supernatural power')
assertOk(!migratedScpLedger.includes('严禁超自然'), 'migrated SCP ledger must not forbid supernatural power')
assertOk(!migratedScpLedger.includes('硬性禁止：超自然力量'), 'migrated SCP ledger must not retain the old hard prohibition')

const legacyScpWithoutTags = sanitizeWorldStateSnapshot({
  worldConfig: {
    name: 'SCP基金会',
    description: legacyScpDescription,
    essenceTag: 'modern',
    powerSystemTag: 'technology',
    powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
    spatialForm: 'plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
  },
})
assertOk(Array.isArray(legacyScpWithoutTags.worldTags), 'old SCP saves with missing derived tags must normalize to an empty list')
assertSame(legacyScpWithoutTags.worldTags.length, 0, 'missing old SCP tags must not break restored Prompt context')

const ordinaryModernWorld = {
  worldConfig: {
    name: '现代地球',
    description: '普通现代社会。',
    essenceTag: 'modern',
    powerSystemTag: 'none',
    powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
    spatialForm: 'plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
  },
}
const untouchedModernWorld = sanitizeWorldStateSnapshot(ordinaryModernWorld)
assertSame(untouchedModernWorld.worldConfig.essenceTag, 'modern', 'ordinary modern saves must not be migrated')
assertSame(untouchedModernWorld.worldConfig.powerSystemTag, 'none', 'ordinary modern power systems must remain unchanged')

const sameNameCustomWorld = sanitizeWorldStateSnapshot({
  worldConfig: {
    ...ordinaryModernWorld.worldConfig,
    name: 'SCP基金会',
    description: '同名但由玩家自定义的现实机构世界。',
  },
})
assertSame(sameNameCustomWorld.worldConfig.essenceTag, 'modern', 'same-name custom worlds must not be mistaken for the SCP preset')
assertSame(sameNameCustomWorld.worldConfig.powerSystemTag, 'none', 'same-name custom world power systems must remain unchanged')

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
  semanticSignals: { irreversible: true, narrativeRegister: 'fate' },
}), 'HIGH branch with two valid options must be eligible')
assertOk(!isEligibleNarrativeBranch({
  branch: true,
  importance: 'NORMAL',
  branchOptions: ['承担后果', '另寻出路'],
  semanticSignals: { irreversible: true, narrativeRegister: 'fate' },
}), 'non-HIGH branch must be suppressed')
assertOk(!isEligibleNarrativeBranch({
  branch: true,
  importance: 'HIGH',
  branchOptions: ['唯一选项', '   '],
  semanticSignals: { irreversible: true, narrativeRegister: 'fate' },
}), 'branch with fewer than two valid options must be suppressed')
assertOk(!isEligibleNarrativeBranch({
  branch: true,
  importance: 'HIGH',
  branchOptions: ['留在原处', '随照料者迁居'],
  semanticSignals: { irreversible: false, narrativeRegister: 'life' },
}), 'a daily life event must not become a destiny branch merely because it has options')

const constantsSrc = readRel('src/mods/mod-character/constants.ts')
const destinySystemSrc = readRel('src/mods/mod-character/subsystems/destiny-pattern-system.ts')
const destinyPromptSrc = readRel('src/mods/mod-character/prompts/destiny-pattern-prompt.ts')
const destinyPoolCacheSrc = readRel('src/mods/mod-character/utils/destiny-pattern-pool-cache.ts')
const characterStoreSrc = readRel('src/mods/mod-character/store.ts')
const characterMigrationSrc = readRel('src/mods/mod-character/utils/character-state-migration.ts')
const mythicPromptSrc = readRel('src/mods/mod-character/prompts/mythic-pattern-prompt.ts')
const mythicAccessSrc = readRel('src/mods/mod-character/mythic-pattern-access.ts')
const mythicLibrarySrc = readRel('src/mods/mod-character/mythic-library-store.ts')
const talentDrawPageSrc = readRel('src/mods/mod-pages/pages/talent-draw/page.tsx')
const talentDrawCssSrc = readRel('src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css')
const preGenSrc = readRel('src/mods/mod-engine/helpers/pre-gen-queue.ts')
const narrativeSignalsSrc = readRel('src/mods/mod-engine/helpers/narrative-semantic-signals.ts')
const hooksSrc = readRel('src/mods/mod-engine/hooks.ts')
const orchestratorSrc = readRel('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const timeScaleSrc = readRel('src/mods/mod-engine/helpers/time-scale-narrative.ts')
const narrativeResponseQualitySrc = readRel('src/mods/mod-engine/helpers/narrative-response-quality.ts')
const narrativeHintsSrc = readRel('src/mods/mod-engine/helpers/narrative-hints.ts')
const narrativeCalendarSrc = readRel('src/mods/mod-engine/helpers/narrative-calendar.ts')
const narrativePromptSrc = readRel('src/mods/mod-engine/prompts/narrative-prompt.ts')
const narrativePromptComponentsSrc = readRel('src/mods/mod-engine/server/narrative-system-prompt.ts')
const roundCommitBusSrc = readRel('src/mods/mod-engine/helpers/round-commit-bus.ts')
const powerContextSrc = readRel('src/mods/mod-world/utils/power-framework.ts')
const timelineCssSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.module.css')
const timelineTsxSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx')
const cultureIndexSrc = readRel('src/mods/mod-culture/index.ts')
const settingsStoreSrc = readRel('src/mods/mod-settings/store.ts')
const aiClientSrc = readRel('src/core/ai-service/ai-client.ts')
const proxyRouteSrc = readRel('src/app/api/proxy/route.ts')
const welcomePageSrc = readRel('src/mods/mod-pages/pages/welcome/page.tsx')
const worldConfirmSrc = readRel('src/mods/mod-pages/pages/world-select/useWorldConfirm.ts')
const gameOverPageSrc = readRel('src/mods/mod-pages/pages/game-over/page.tsx')

const talentPoolHelpers = loadTalentPoolHelpers(talentDrawPageSrc)
const normalizedDuplicatePool = [
  { id: 'a', name: '拖延症' },
  { id: 'b', name: ' 拖延症 ' },
  ...Array.from({ length: 3 }, (_, index) => ({ id: `unique-${index}`, name: `唯一命格${index}` })),
]
assertSame(
  talentPoolHelpers.uniquePatternsByIdentity(normalizedDuplicatePool).length,
  4,
  'display identity must collapse names that differ only by surrounding whitespace',
)
assertSame(
  talentPoolHelpers.drawSlotsFromPool(normalizedDuplicatePool).filter(Boolean).length,
  4,
  'a raw five-item pool with one normalized duplicate must not pretend to fill five slots',
)
assertSame(
  talentPoolHelpers.uniquePatternsByIdentity([
    ...normalizedDuplicatePool,
    { id: 'extra', name: '补足命格' },
  ]).length,
  5,
  'readiness must become possible once five display-unique candidates exist',
)

assertSame(DEFAULT_WORD_COUNT_TARGET, 200, 'new and reset games must default to about 200 narrative characters')
assertSame(
  NARRATIVE_WORD_COUNT_TARGETS.join(','),
  '50,100,150,200,250,300,400,500,600,700,800,1000,1200,1500,1800,2000',
  'narrative length must expose exactly the sixteen fixed player choices',
)
assertSame(resolveNarrativeWordCountTarget(777), 200, 'non-contract length values must not enter narrative runtime state')
assertSame(resolveNarrativeWordCountRange(200).preferredMin, 160, 'the 200-character option must expose a focused lower guidance bound')
assertSame(resolveNarrativeWordCountRange(200).preferredMax, 240, 'the 200-character option must expose a focused upper guidance bound')
assertSame(computeNarrativeMaxTokens(50), 512, 'the 50-character option must reserve a complete story and optional branch envelope')
assertSame(computeNarrativeMaxTokens(200), 640, 'the default option must use the first-call-only completion budget')
assertSame(
  computeNarrativeMaxTokens(200, { reasoningEffort: 'auto' }),
  1664,
  'automatic reasoning must include the startup reasoning allowance',
)
assertSame(
  computeNarrativeMaxTokens(200, { reasoningEffort: 'max' }),
  4736,
  'maximum reasoning must include the larger startup reasoning allowance',
)
assertOk(
  NARRATIVE_WORD_COUNT_TARGETS.every((target) => computeNarrativeMaxTokens(target, { reasoningEffort: 'high' }) % 64 === 0),
  'every narrative completion budget must be rounded up to a 64-token boundary',
)
assertOk(
  new Set(NARRATIVE_WORD_COUNT_TARGETS.map((target) => buildWordCountInstruction(target))).size === 16
    && buildWordCountInstruction(200).includes('2至3个短段、4至6个短句')
    && buildWordCountInstruction(200).endsWith('正文全部段落合计写成160-240字，中心约200字。'),
  'every length option must select distinct density guidance and define the whole-body target range',
)
assertOk(
  buildWordCountInstruction(200).includes('按本轮视角分配必要节点')
    && !buildWordCountInstruction(200).includes('一个感官锚点')
    && !buildWordCountInstruction(200).includes('一组关键行动或对话'),
  'word-count guidance must own density without forcing every time scale into one scene',
)
assertOk(
  buildLifecycleNarrativeHint(
    { ageDays: 730 },
    {
      displayName: '早期生命',
      description: '身体与心智仍在形成。',
      coefficients: { vitality: 0.6, learning: 1.4, social: 0.7 },
    },
  ).includes('场景、行为能力、认知和对话复杂度必须符合当前阶段事实'),
  'lifecycle guidance must bind cognition and behavior to the owning stage definition',
)
assertOk(
  buildNarrativeCoherenceHeader({ powerSystemTag: 'none' }, 2)?.includes('【世界设定】【命格天赋】或【当前状态】'),
  'a no-base-power world must still preserve supernatural facts explicitly established by world, talent, or state',
)
assertOk(
  !narrativeQualitySrc.includes('retryMin')
    && !narrativeQualitySrc.includes('retryMax')
    && narrativeQualitySrc.includes('lengthAdvisory'),
  'narrative length must not be implemented as a retry or rejection gate',
)
const chineseInstruction = {
  系统: '基础属性',
  目标对象: 'player:current',
  目标上下文: 'context:current',
  操作: '增量',
  说明: '你完成了心智训练。',
  变更: { 心智变化: 1 },
  依据事件: [],
}
const chineseMetadata = {
  摘要: '你在压力下完成了一次心智训练。',
  重要程度: '普通',
  关键事件: [{ 内容: '你完成了心智训练。', 重要度: 45, 涉及实体: ['你'] }],
  情节状态: '进行中',
  语义信号: {
    事件类型: '日常',
    冲突强度: 10,
    张力变化: 0,
    行动规模: '小',
    不可逆: false,
    影响范围: '个人',
    叙事语域: '生活',
    语域理由: '这是一次具体的日常训练。',
    情节类型: '无',
  },
}
assertOk(
  NarrativeAISettlementDataSchema.safeParse(chineseMetadata).success
    && translateNarrativeAISettlement(
      [chineseInstruction],
      chineseMetadata,
      { allowedEvidenceEventIds: [], allowedSubsystemIds: ['character-base'] },
    ).changes[0]?.changes.mindDelta === 1,
  'second-call Chinese system and field names must translate to the internal field contract',
)
assertOk(
  !NarrativeAISettlementDataSchema.safeParse({
    ...chineseMetadata,
    changes: [{ id: 'character-base', description: 'legacy', mindDelta: 1 }],
  }).success,
  'English legacy change fields must not be accepted alongside the Chinese protocol',
)
assertOk(
  !NarrativeAIBranchSchema.safeParse({
    标题: '去向未定',
    选项: [
      { 标题: '留下', 说明: '继续留在原地' },
      { 标题: '迁居', 说明: '随照料者离开' },
    ],
  }).success,
  'branch options must already be Chinese string choices; object compatibility must not enter the strict path',
)
const settingsPersistenceVersion = Number(
  settingsStoreSrc.match(/name:\s*'mod-settings:store'[\s\S]*?version:\s*(\d+)/)?.[1],
)
assertOk(settingsPersistenceVersion >= 12, 'settings persistence must include the player-owned API migration')
const migrateSettings = loadPersistMigration(settingsStoreSrc)
assertSame(
  migrateSettings({ wordCountTarget: 400, theme: 'minimal-white' }, 2).wordCountTarget,
  400,
  'a current fixed length option must remain unchanged by unrelated settings migrations',
)
assertSame(
  migrateSettings({ wordCountTarget: 300, theme: 'minimal-white' }, 2).wordCountTarget,
  300,
  'persisted explicit non-default word counts must be preserved',
)
const migratedManagedDefault = migrateSettings({
  provider: 'managed',
  customKey: '',
  customUrl: '',
  customModel: 'LongCat-2.0',
}, 11)
assertSame(migratedManagedDefault.provider, DEFAULT_AI_PROVIDER_ID, 'old managed defaults must migrate to the player API provider')
assertSame(migratedManagedDefault.customUrl, DEFAULT_AI_BASE_URL, 'old managed defaults must receive the DeepSeek preset URL')
assertSame(migratedManagedDefault.customModel, DEFAULT_AI_MODEL, 'old managed defaults must receive the DeepSeek preset model')
assertSame(migratedManagedDefault.customKey, '', 'old managed credentials must not enter browser state')
const migratedPreviousManagedTarget = migrateSettings({
  provider: 'managed',
  customKey: 'player-owned-key',
  customUrl: 'https://dasuapi.com/v1',
  customModel: 'grok-4.5',
}, 11)
assertSame(migratedPreviousManagedTarget.customKey, 'player-owned-key', 'managed target migration must preserve a player-owned key')
assertSame(migratedPreviousManagedTarget.provider, 'custom', 'older player-owned managed targets must become explicit custom configuration')
assertSame(migratedPreviousManagedTarget.customUrl, 'https://dasuapi.com/v1', 'older player-owned interface must survive migration')
assertSame(migratedPreviousManagedTarget.customModel, 'grok-4.5', 'older player-owned model must survive migration')
const migratedA6ManagedOverride = migrateSettings({
  provider: 'managed-a6',
  customKey: 'player-owned-a6-key',
  customUrl: 'https://player-old-provider.example/v1',
  customModel: 'gpt-5.6-luna',
}, 11)
assertSame(migratedA6ManagedOverride.customKey, 'player-owned-a6-key', 'a6api override migration must preserve the player-owned key')
assertSame(migratedA6ManagedOverride.provider, 'custom', 'every player-owned preset override must become custom configuration')
assertSame(migratedA6ManagedOverride.customUrl, 'https://player-old-provider.example/v1', 'player-owned legacy interface must survive migration')
assertSame(migratedA6ManagedOverride.customModel, 'gpt-5.6-luna', 'player-owned legacy model must survive migration')
const preservedCustomConfig = migrateSettings({
  provider: 'custom',
  customKey: 'player-key',
  customUrl: 'https://player.example/v1',
  customModel: 'player-model',
}, 4)
assertSame(preservedCustomConfig.provider, 'custom', 'explicit player provider must survive migration')
assertSame(preservedCustomConfig.customModel, 'player-model', 'explicit player model must survive migration')
const migratedReasoningModes = migrateSettings({
  reasoningEffort: 'level-4',
  talentThinkingIntensity: 'level-6',
}, 9)
assertSame(migratedReasoningModes.reasoningEffort, 'high', 'legacy level-4 reasoning must migrate to the deep mode')
assertSame(migratedReasoningModes.talentThinkingIntensity, 'max', 'legacy level-6 reasoning must migrate to the maximum mode')
const migratedLegacyStyle = migrateSettings({ narrativeStyle: 'poetic' }, 10)
assertSame(migratedLegacyStyle.narrativeStyle, 'default', 'legacy style buttons must migrate to the custom-text owner')
assertOk(
  migratedLegacyStyle.narrativeStyleText.includes('凝练')
    && migratedLegacyStyle.narrativeStyleVersion === 1,
  'legacy poetic style must migrate to a readable active custom style and version',
)
const exactCustomStyle = '第一行保持完整。\n第二行  保留空格。'
const migratedCustomStyle = migrateSettings({
  narrativeStyle: 'realistic',
  narrativeStyleText: exactCustomStyle,
  narrativeStyleVersion: 7,
}, 10)
assertSame(migratedCustomStyle.narrativeStyleText, exactCustomStyle, 'saved custom style text must survive migration byte-for-byte')
assertSame(migratedCustomStyle.narrativeStyleVersion, 7, 'saved custom style version must survive migration')
assertOk(
  /export async function hasAvailableApiConfiguration\(\)[\s\S]{0,180}return isApiConfigured\(\)/.test(settingsStoreSrc)
    && /providerId !== DEFAULT_AI_PROVIDER_ID[\s\S]{0,260}当前版本只支持玩家自己的 API Key/.test(proxyRouteSrc)
    && /await hasAvailableApiConfiguration\(\)/.test(welcomePageSrc)
    && /await hasAvailableApiConfiguration\(\)/.test(worldConfirmSrc),
  'entry gates and proxy routing must require a complete player-owned API configuration',
)

assertOk(/AI_DESTINY_PATTERN_BATCH_SIZE\s*=\s*10/.test(constantsSrc), 'destiny each AI batch must request 10 items')
assertOk(/AI_DESTINY_PATTERN_BATCH_COUNT\s*=\s*10/.test(constantsSrc), 'destiny background batches must keep an approximately 100-item full pool')
assertOk(/AI_DESTINY_PATTERN_FIRST_SCREEN_CONCURRENCY\s*=\s*3/.test(constantsSrc), 'destiny first screen must use three concurrent requests')
assertOk(!constantsSrc.includes('DESTINY_PATTERN_EARLY_READY_TIMEOUT_MS'), 'AI destiny readiness must not time out to presets')
assertOk(
  /const parallelSeeds = \[42, 137, 256\]/.test(destinySystemSrc)
    && /parallelPromises\.push\([\s\S]{0,260}runBatchWithRetry\(index, seed, true\)/.test(destinySystemSrc)
    && /Promise\.race\(\[earlyReadyPromise, allParallelSettled, terminalCredentialErrorPromise\]\)/.test(destinySystemSrc)
    && /Promise\.allSettled\(parallelPromises\)/.test(destinySystemSrc),
  'destiny first screen must race three streamed requests, credential termination, and background completion',
)
assertOk(
  /\.length\(AI_DESTINY_PATTERN_BATCH_SIZE\)/.test(destinyPromptSrc),
  'destiny output schema length must follow the ten-item batch authority',
)
assertOk(!destinyPromptSrc.includes('第一次踩上'), 'destiny prompt must not teach biographical event openings')
assertOk(/稳定|先天|固有/.test(destinyPromptSrc) && /禁止.*年份|严禁.*年份/.test(destinyPromptSrc), 'destiny prompt must require timeless traits')
assertOk(destinyPromptSrc.includes('JSON顶层数组') && !destinyPromptSrc.includes('{"patterns"'), 'destiny prompt must match the top-level array Zod contract')
assertOk(
  /DESTINY_PATTERN_PROMPT_VERSION\s*=\s*'3\.5\.0'/.test(destinyPromptSrc)
    && /version:\s*DESTINY_PATTERN_PROMPT_VERSION/.test(destinyPromptSrc),
  'destiny prompt and registered template must share version 3.5.0',
)
assertOk(
  destinyPromptSrc.includes('极性：正向/混合')
    && /polarity:\s*z\.enum\(\['positive', 'mixed'\]\)/.test(destinyPromptSrc),
  'destiny prompt Chinese values and internal polarity schema must remain aligned',
)
assertOk(
  /正好\$\{DESTINY_PATTERN_TARGET_POSITIVE_COUNT\}条“正向”/.test(destinyPromptSrc)
    && /不得为了“平衡”统一补写副作用/.test(destinyPromptSrc)
    && /positiveCount < DESTINY_PATTERN_MIN_POSITIVE_COUNT/.test(destinyPromptSrc),
  'destiny prompt and schema must share the current batch polarity contract',
)
const makeDestinyPattern = (index, polarity) => ({
  name: `命格${index}`,
  description: `稳定成立的命格特质${index}`,
  rarity: 'common',
  polarity,
  effect: `持续提供清楚可用的正向影响${index}`,
})
assertOk(
  destinyPatternOutputSchema.safeParse([
    ...Array.from({ length: 6 }, (_, index) => makeDestinyPattern(index, 'positive')),
    ...Array.from({ length: 4 }, (_, index) => makeDestinyPattern(index + 6, 'mixed')),
  ]).success,
  'destiny schema must accept a batch with the minimum positive majority',
)
assertOk(
  !destinyPatternOutputSchema.safeParse(
    Array.from({ length: 10 }, (_, index) => makeDestinyPattern(index, 'mixed')),
  ).success,
  'destiny schema must reject an all-mixed double-edged batch',
)
assertOk(
  /const polarity = this\.validatePolarity\(item\.polarity\)[\s\S]{0,100}if \(!rarity \|\| !polarity\) return/.test(destinySystemSrc)
    && !/polarity:\s*this\.validatePolarity\(item\.polarity\)\s*\?\?\s*'positive'/.test(destinySystemSrc),
  'streamed destiny ingestion must reject invalid or negative polarity instead of relabeling it as positive',
)
assertOk(!destinyPromptSrc.includes('resources:'), 'destiny output schema must reject the removed resources attribute')
assertOk(
  destinyPromptSrc.includes('只允许 体魄/心智/悟性/魅力')
    && /attrBonus:\s*z\.object\(\{[\s\S]*physique:[\s\S]*mind:[\s\S]*talentAptitude:[\s\S]*charisma:[\s\S]*\}\)\.strict\(\)/.test(destinyPromptSrc),
  'destiny prompt Chinese attribute names must map to the strict four-key internal schema',
)
assertOk(destinyPromptSrc.includes('systemModifiers: destinyPatternSystemModifiersSchema.optional()'), 'destiny schema must accept validated system modifiers')
assertOk(destinyPromptSrc.includes('传说允许轻度概念规则'), 'legendary destiny patterns must support the current conceptual-rule tier')
assertOk(
  destinyPromptSrc.includes('条件、概率、有限触发或可被对抗')
    && destinyPromptSrc.includes('混合还可以包含有限代价')
    && destinyPromptSrc.includes('正向必须是清楚可用的正向特质'),
  'conceptual rules and polarity semantics must match the current prompt contract',
)
assertOk(/效果写成叙事引擎可持续遵守的规则/.test(destinyPromptSrc), 'destiny effect must remain a narrative rule instead of only numeric modifiers')
assertOk(/validatePatternSystemModifiers\(input\.systemModifiers, rarity\)/.test(destinySystemSrc), 'external AI destiny injection must validate system modifiers')
assertOk(
  /version:\s*5/.test(characterStoreSrc)
    && ['health: _health', 'lifespan: _lifespan', 'lifecycle: _lifecycle'].every((field) => characterStoreSrc.includes(field)),
  'character persistence must retain identity and mythic migration while excluding owning-system runtime projections',
)
assertOk(
  ['mythicCandidates', 'equippedMythicPatterns', 'setEquippedMythicPatterns', 'sealedMythicPatternId'].every((field) => characterStoreSrc.includes(field)),
  'character store must persist current-life mythic candidates, two equipped slots, and sealed identity',
)
assertOk(
  /BASE_ATTRIBUTE_KEYS\s*=\s*\['physique', 'mind', 'talentAptitude', 'charisma'\]/.test(characterMigrationSrc)
    && !/BASE_ATTRIBUTE_KEYS[^\n]*resources/.test(characterMigrationSrc),
  'character migration must keep exactly four base attributes',
)
assertOk(
  /sanitizeDestinyPatternState/.test(characterMigrationSrc) && /sanitizeAttrBonus/.test(characterMigrationSrc),
  'old character saves and destiny pools must remove retired attribute bonuses',
)
assertOk(/\.length\(3\)/.test(mythicPromptSrc), 'mythic settlement schema must require exactly three candidates')
assertOk(
  /纯概念/.test(mythicPromptSrc) && /不得出现属性加成、概率百分比、模拟系数/.test(mythicPromptSrc),
  'mythic candidates must remain non-numeric conceptual rules',
)
assertOk(
  /generateMythicPatternCandidates/.test(mythicAccessSrc) && /setMythicPatternAIService/.test(mythicAccessSrc),
  'mod-character must expose a configurable mythic candidate generator',
)
assertOk(
  !/existingMythicPatterns:[\s\S]{0,220}effect:\s*pattern\.effect/.test(mythicAccessSrc),
  'the unbounded mythic library context must send only compact name/concept indexes instead of every stored effect',
)
assertOk(
  /finalState\?: Readonly<Record<string, unknown>>/.test(mythicAccessSrc)
    && /lifeDigests\?: readonly/.test(mythicAccessSrc)
    && /finalState: input\.finalState/.test(mythicAccessSrc)
    && /lifeDigests: input\.lifeDigests/.test(mythicAccessSrc)
    && /finalState: mythicFinalState/.test(gameOverPageSrc)
    && /lifeDigests: mythicLifeDigests/.test(gameOverPageSrc),
  'mythic settlement must include a compact structured final state and compressed life digests alongside narrative records',
)
assertOk(
  /mod-character:persist:mythic-library/.test(mythicLibrarySrc)
    && /patterns: MythicPattern\[\]/.test(mythicLibrarySrc)
    && /addPattern/.test(mythicLibrarySrc),
  'mythic library must use an independent cross-run persistent store',
)
assertOk(!talentDrawPageSrc.includes('buildTimeoutFallback'), 'AI destiny page must not build a preset timeout fallback')
assertOk(!talentDrawPageSrc.includes('fallbackTimer'), 'AI destiny page must keep waiting instead of starting a fallback timer')
assertSame(
  talentDrawPageSrc.match(/generateFromPresets\s*\(/g)?.length ?? 0,
  1,
  'preset generation must appear only in the explicit non-AI branch',
)
assertOk(
  /PRESET_DESTINY_PATTERNS\.filter\(\(pattern\) => pattern\.polarity !== 'negative'\)/.test(destinySystemSrc),
  'explicit non-AI generation must also exclude legacy purely negative preset entries',
)
assertOk(
  /if\s*\(!aiTalentGeneration\)\s*\{[\s\S]{0,260}generateFromPresets\s*\(/.test(talentDrawPageSrc),
  'preset generation must stay behind the disabled-AI branch',
)
assertOk(
  /while\s*\(\s*!earlyReadyFired\s*&&\s*!abortController\.signal\.aborted\s*\)/.test(destinySystemSrc),
  'AI destiny readiness must keep requesting until 5 valid items, cancellation, or terminal credential failure',
)
assertOk(
  /isAiCredentialError\(err\)[\s\S]{0,160}stopForCredentialError\(err\)[\s\S]{0,120}throw terminalCredentialError/.test(destinySystemSrc),
  '401/403 must abort the active destiny fill and escape before any later batch can start',
)
assertOk(
  /dedupePatterns\(options\?\.initialPatterns \?\? \[\]\)[\s\S]{0,100}filter\(\(pattern\) => this\.isAIGeneratedPattern\(pattern\)\)/.test(destinySystemSrc),
  'generateWithAI must reject preset entries even when a caller passes them as initial cache',
)
assertOk(
  /function destinyPatternNameKey[\s\S]{0,160}trim\(\)\.toLocaleLowerCase\(\)/.test(destinySystemSrc)
    && /existingNameKeys\.has\(nameKey\)/.test(destinySystemSrc)
    && /seenNames\.has\(nameKey\)/.test(destinySystemSrc),
  'the AI pool authority must dedupe normalized display names before declaring five candidates ready',
)
assertOk(
  !/!earlyReadyFired[\s\S]{0,180}nextBackgroundBatch\s*<\s*AI_DESTINY_PATTERN_BATCH_COUNT/.test(destinySystemSrc),
  'AI destiny readiness must not stop at the configured background batches',
)
assertOk(
  (talentDrawPageSrc.match(/abortPoolFill\(\)/g) ?? []).length >= 2
    && talentDrawPageSrc.includes("if (phase !== 'selecting') return"),
  'leaving the page must abort page-owned AI readiness and background refill loops',
)
assertOk(
  /function loadCachedPool[\s\S]{0,260}loadDestinyPatternPool[\s\S]{0,160}filter\(isAIGeneratedPattern\)/.test(talentDrawPageSrc),
  'AI cache restoration must exclude preset patterns',
)
assertOk(
  /getDestinyPatternPoolCacheKey[\s\S]{0,180}DESTINY_PATTERN_PROMPT_VERSION/.test(destinyPoolCacheSrc),
  'destiny cache keys must follow the prompt contract version so old double-edged pools are not reused',
)
assertOk(
  /const usableSaved = savedSlotsMatchMode \? saved : null/.test(talentDrawPageSrc),
  'an incompatible saved selection must not fall through into the selecting phase',
)
assertOk(
  /type PagePhase = 'idle' \| 'generating' \| 'ready' \| 'selecting'/.test(talentDrawPageSrc),
  'destiny draw must keep an explicit non-persisted handoff state after twelve candidates are ready',
)
assertOk(
  /const completeFullDraw = useCallback\(\(patterns: DestinyPattern\[\]\)/.test(talentDrawPageSrc)
    && /visiblePatterns\.length < DESTINY_PATTERN_DISPLAY_COUNT/.test(talentDrawPageSrc)
    && /setSlots\(revealSlotsInOrder\(visiblePatterns\)\)/.test(talentDrawPageSrc)
    && /completionTimerRef\.current = window\.setTimeout\([\s\S]{0,220}setPhase\('ready'\)/.test(talentDrawPageSrc),
  'AI destiny readiness must require twelve display-unique candidates before the completed handoff opens',
)
assertOk(
  /phase === 'ready'[\s\S]{0,1600}进入命格选择/.test(talentDrawPageSrc),
  'the completed destiny handoff must expose an explicit enter-selection action',
)
assertOk(
  /function uniquePatternsByIdentity[\s\S]{0,700}seenIds[\s\S]{0,300}seenNames[\s\S]{0,300}patternNameKey/.test(talentDrawPageSrc),
  'a twelve-slot destiny draw must remove duplicate IDs and duplicate display names',
)
assertOk(
  /const savedSlotsMatchMode[\s\S]{0,360}savedPatterns\.length >= DESTINY_PATTERN_DISPLAY_COUNT[\s\S]{0,260}uniquePatternsByIdentity\(savedPatterns\)\.length === savedPatterns\.length/.test(talentDrawPageSrc),
  'persisted selecting slots must not restore a normalized duplicate set',
)
assertOk(
  /\(_?count, patterns\) => \{[\s\S]{0,900}revealPatterns\(uniquePatterns\)/.test(talentDrawPageSrc),
  'AI progress must re-check display-unique readiness after the raw early-ready callback',
)
assertOk(
  /outputSchema\?: Parameters<typeof callAI>\[2\]\['outputSchema'\]/.test(talentDrawPageSrc)
    && /outputSchema:\s*opts\?\.outputSchema/.test(talentDrawPageSrc)
    && /strictSchema:\s*!useStream\s*&&\s*Boolean\(opts\?\.outputSchema\)/.test(talentDrawPageSrc),
  'the destiny page adapter must preserve the subsystem output schema and enforce it for non-streaming calls',
)
assertOk(
  /if \(isDeepSeekModel\)[\s\S]{0,220}reasoningEffort === 'disabled'[\s\S]{0,120}thinking = \{ type: 'disabled' \}/.test(aiClientSrc)
    && /proxyBody\.reasoning_effort = reasoningEffort/.test(aiClientSrc)
    && /reasoning_effort:\s*z\.enum\(\['high', 'max'\]\)/.test(proxyRouteSrc)
    && /type: z\.literal\('disabled'\)/.test(proxyRouteSrc),
  'DeepSeek reasoning must transmit an explicit enabled/disabled type and supported reasoning effort',
)
assertOk(
  /const usedNames = new Set<string>\(\)[\s\S]{0,700}!usedNames\.has\(patternNameKey\(p\)\)/.test(talentDrawPageSrc),
  'destiny redraw must not reintroduce duplicate display names into the visible slots',
)
assertOk(
  /\.aura\s*\{[^}]*width:\s*calc\(220 \* var\(--final-flow-density-px\)\)/s.test(talentDrawCssSrc)
    && /\.seals\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s.test(talentDrawCssSrc)
    && /\.drawStageComplete \.aura\s*\{[^}]*top:\s*calc\(224 \* var\(--final-flow-density-px\)\)/s.test(talentDrawCssSrc)
    && /\.drawStageComplete \.sealWrap\s*\{[^}]*opacity:\s*0/s.test(talentDrawCssSrc)
    && /aria-label="十二道命印"/.test(talentDrawPageSrc)
    && /Array\.from\(\{ length: MYTHIC_PATTERN_SELECT_COUNT \}/.test(talentDrawPageSrc)
    && /selectedUiSlots\.map\(/.test(talentDrawPageSrc)
    && !/TalentAstrolabe|astrolabe|fateNode/.test(talentDrawPageSrc)
    && !/progressTrack|progressFill/.test(talentDrawPageSrc),
  'the completed destiny handoff must keep the selected aura, twelve seals, two rebirth slots, and three ordinary slots',
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

assertOk(timeScaleSrc.includes('年度全景视角'), 'year step must use an annual panorama')
assertOk(
  timeScaleSrc.includes('首句不要使用“这一年”“这一月”“这一天”等泛指时间套语')
    && timeScaleSrc.includes('确需时间锚时使用“当前时间”中的具体纪年、季节、月日'),
  'time guidance must vary openings and use the explicit calendar label when a time anchor is needed',
)
assertOk(
  timeScaleSrc.includes('不得把年度压缩成一个现场')
    && timeScaleSrc.includes('同一时间跨度内的因果主线')
    && timeScaleSrc.includes('家庭、组织、社会与文明'),
  'year-scale guidance must expand its lens while retaining one causal arc',
)
assertOk(timeScaleSrc.includes('季度阶段视角'), 'season step must use quarterly stage perspective')
assertOk(timeScaleSrc.includes('月度变化视角'), 'month step must use monthly change perspective')
assertOk(timeScaleSrc.includes('单日现场视角'), 'day step must use daily scene perspective')
assertOk(/case 'year'[\s\S]{0,120}return eraLabel/.test(narrativeCalendarSrc), 'year label must contain only the year/era')
assertOk(
  /seasonName/.test(narrativeCalendarSrc)
    && /getSeasonForMonth\(round\.month\)/.test(narrativeCalendarSrc),
  'season label must derive the season from the solar month',
)
assertOk(/case 'month'[\s\S]{0,220}round\.month \+ 1/.test(narrativeCalendarSrc), 'month label must include year, season and month')
assertOk(/case 'day'[\s\S]{0,260}dayNum/.test(narrativeCalendarSrc), 'day label must include year, season, month and day')
assertOk(orchestratorSrc.includes('currentTime: narrativeTime.timeLabel'), 'AI currentTime must use the authoritative formatted time label')

// 2007年春季5月切到季推进：连续推进5/6/7月后应落在8月，即夏季，不回到本年冬季。
const mayIndex = 4
const monthAfterSeasonStep = (mayIndex + 3) % 12
assertSame(Math.floor(((monthAfterSeasonStep + 10) % 12) / 3), 1, 'month->season must land in the following solar season')
assertOk(narrativeSignalsSrc.includes("metadata.importance !== 'HIGH'"), 'branch metadata must require HIGH importance')
assertOk(narrativePromptComponentsSrc.includes('身份、核心关系、长期目标、关键资源、阵营、存亡等不可逆轨迹'), 'branch prompt must define fate-changing impact dimensions')
assertOk(/version:\s*'5\.8\.1'/.test(narrativePromptSrc), 'pure narrative contract must use version 5.8.1')
assertOk(
  narrativeSignalsSrc.includes('metadata.semanticSignals?.irreversible !== true')
    && narrativeSignalsSrc.includes("metadata.semanticSignals.narrativeRegister !== 'fate'"),
  'branch eligibility must require an irreversible fate or legacy semantic signal',
)
assertOk(
  narrativePromptComponentsSrc.includes('正文全程用第二人称“你”')
    && narrativePromptComponentsSrc.includes('用一个可感知现场承载主线')
    && narrativePromptComponentsSrc.includes('不写全知旁白、第三人称传记或编年报告'),
  'narrative prompt must preserve second-person viewpoint, scene-level immersion, and anti-biography constraints',
)
assertOk(
  timeScaleSrc.includes('首句不要使用“这一年”“这一月”“这一天”等泛指时间套语')
    && timeScaleSrc.includes('不要复用上一轮起句结构'),
  'the dynamic time-scale component must reject repetitive generic time openings',
)
assertOk(
  narrativePromptComponentsSrc.includes('专属、独有、唯一、血脉限定、异界来源或角色自创')
    && narrativePromptComponentsSrc.includes('遗迹发现、古人传承、秘境所得、他人遗留或他人同源能力')
    && narrativePromptComponentsSrc.includes('角色自创内容的后续发展必须来自角色自身')
    && narrativeResponseQualitySrc.includes('不得无因果跳过数周或数月')
    && narrativeResponseQualitySrc.includes('isOpeningRound'),
  'fixed ownership rules and the triggered first-round condition must remain independently live',
)
assertOk(
  !narrativeHintsSrc.includes('INFORMATION_PRIORITY_RULE')
    && !orchestratorSrc.includes('opening-information-priority'),
  'the retired attribute-over-background opening priority must not be injected',
)
assertOk(timeScaleSrc.includes('3—5月春季、6—8月夏季、9—11月秋季、12—2月冬季'), 'dynamic time guidance must define the canonical solar season mapping')
assertOk(!/commit\.changes\.slice\(/.test(roundCommitBusSrc), 'round commit must never partially truncate structured changes')
assertOk(roundCommitBusSrc.includes('narrative 预检失败，整包拒绝'), 'invalid narrative changes must be rejected as one complete package')
assertOk(timelineTsxSrc.includes('splitNarrativeParagraphs(entry.text)'), 'timeline must render every natural narrative paragraph')
assertOk(!timelineTsxSrc.includes('streamingText'), 'timeline must render only fully committed narrative entries')
assertOk(
  orchestratorSrc.includes('formatPowerFrameworkForPrompt')
    && orchestratorSrc.includes('config.powerFramework'),
  'narrative prompt must use the current world-owned power framework helper',
)
assertOk(!powerContextSrc.includes("split('。')[0]"), 'power context must preserve complete descriptions above the current ceiling')
assertOk(
  powerContextSrc.includes("if (!framework?.enabled || framework.ranks.length === 0) return undefined")
    && orchestratorSrc.includes('config.powerFramework'),
  'non-supernatural worlds must omit an irrelevant power framework from the narrative context',
)
assertOk(cultureIndexSrc.includes('buildCultureCalendarNarrativeContext'), 'mod-culture must expose the calendar adapter')

assertOk(!timelineCssSrc.includes('.entryLatest'), 'latest narrative must not have a special background rule')
assertOk(!timelineTsxSrc.includes('styles.entryLatest'), 'latest narrative must not receive a special style class')

if (failed === 0) {
  console.log('PASS: playtest-quality-regression')
  process.exit(0)
}

process.exit(1)
