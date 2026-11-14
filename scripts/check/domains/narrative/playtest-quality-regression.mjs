/** Purpose: Regress playtest feedback across parsing, destiny, calendar, branching, and UI.
 * Owner: quality:narrative
 * Responsibility: Cross-feature quality assertions only; each runtime system retains its business state. */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readDirectorySource, readModuleSource } from '../../lib/read-module-source.mjs'

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
  resolveNarrativeWordCountRange,
} from '../../../../src/mods/mod-engine/constants/narrative-config.ts'
import {
  createCharacterNarrativeStatus,
} from '../../../../src/mods/mod-character/subsystems/character-status-runtime.ts'
import {
  DESTINY_PATTERN_CATEGORY_CONFIG,
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
  DESTINY_PATTERN_DISPLAY_COUNT,
  RACE_LIFESPAN,
} from '../../../../src/mods/mod-character/constants.ts'
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
import { COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import { NarrativeAIBranchSchema } from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { NarrativeRoundMetadataSchema } from '../../../../src/mods/mod-engine/helpers/narrative-semantic-signals.ts'
import { sanitizeCharacterStateSnapshot } from '../../../../src/mods/mod-character/utils/character-state-migration.ts'
import { ReincarnationTalentSchema } from '../../../../src/core/account/account-contract.ts'
import { normalizeCustomModelProfiles } from '../../../../src/mods/mod-settings/custom-model-profiles.ts'
import { reincarnationPromotionOutputSchema } from '../../../../src/mods/mod-character/prompts/reincarnation-promotion-prompt.ts'
import {
  buildReincarnationPromotionUserPrompt,
  createPromotedReincarnationTalent,
  decideReincarnationPromotion,
  getReincarnationPromotionTargetAptitudeTier,
} from '../../../../src/mods/mod-character/reincarnation-talent-access.ts'
import {
  buildDestinyPatternSystemPrompt,
  destinyPatternOutputSchema,
} from '../../../../src/mods/mod-character/prompts/destiny-pattern-prompt.ts'
import { parseDestinyPatternAIResponse } from '../../../../src/mods/mod-character/subsystems/destiny-pattern-system/validation.ts'
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

const storyPromptSampleSrc = readRel('docs/prompt-samples/core-simulation/01-story-ai.md')

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
  const module = { exports: {} }
  new Function(
    'module',
    'exports',
    'DEFAULT_WORD_COUNT_TARGET',
    'DEFAULT_AI_BASE_URL',
    'DEFAULT_AI_PROVIDER_ID',
    'DEFAULT_AI_MODEL',
    'normalizeReasoningEffort',
    'normalizeNarrativeAddressing',
    'normalizeImportedModelSettings',
    'normalizeCustomModelProfiles',
    'normalizeImageApiPresets',
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
    (value) => (value === 'first-person' || value === 'character-name' ? value : 'second-person'),
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
    normalizeCustomModelProfiles,
    (value) => Array.isArray(value) ? value : [],
  )
  return module.exports
}

function loadTalentPoolHelpers(sourceText) {
  const sourceFile = ts.createSourceFile('talent-draw-page.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const helperNames = new Set(['uniquePatternsByIdentity', 'drawSlotsFromPool'])
  const declarations = []
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && helperNames.has(statement.name.text)) {
      declarations.push(statement.getText(sourceFile))
    }
  }
  assertSame(declarations.length, helperNames.size, 'talent draw pool helpers must remain executable regression targets')

  const transpiled = ts.transpileModule(
    `function canonicalizeDestinyPatternName(name) { return name.normalize('NFKC').trim().replace(/\\s+/gu, '').toLocaleLowerCase() }\n${declarations.join('\n')}\nmodule.exports = { uniquePatternsByIdentity, drawSlotsFromPool }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'DESTINY_PATTERN_DISPLAY_COUNT', transpiled)(module, module.exports, 6)
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
  'time-scale macro levels must increase strictly from fine calendar steps to decade',
)
for (const option of AVAILABLE_TIME_STEPS) {
  const profile = getTimeScaleNarrativeProfile(option)
  const hint = buildTimeScaleNarrativeHint(option)
  assertSame(profile.key, encodeTimeStepKey(option), `profile key must match ${encodeTimeStepKey(option)}`)
  assertIncludes(hint, profile.prompt, `${profile.id} prompt must enter the assembled time guidance`)
}

// Removed or malformed values must resolve to the canonical one-year default.
const fallbackYearStep = { unit: 'year', value: 7 }
const fallbackYearProfile = getTimeScaleNarrativeProfile(fallbackYearStep)
assertSame(fallbackYearProfile.key, 'year:1', 'unlisted year step must restore the one-year default')
assertIncludes(fallbackYearProfile.prompt, '覆盖一年', 'unlisted year step must restore the one-year span')
const fallbackInvalidStep = { unit: 'week', value: 7 }
const fallbackInvalidProfile = getTimeScaleNarrativeProfile(fallbackInvalidStep)
assertSame(fallbackInvalidProfile.key, 'year:1', 'invalid step must restore the one-year default')
assertIncludes(fallbackInvalidProfile.prompt, '覆盖一年', 'invalid step must restore the one-year span')

const oneYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 1 })
assertIncludes(oneYearHint, '覆盖1年', 'one-year hint must expose its time span')
assertOk(!oneYearHint.includes('事件链') && !oneYearHint.includes('宏观'), 'one-year hint must not add creative composition rules')
assertOk(
  storyPromptSampleSrc.includes('一条 `user` 消息')
    && storyPromptSampleSrc.includes('"世界"')
    && storyPromptSampleSrc.includes('"玩家信息"')
    && storyPromptSampleSrc.includes('"历史输出"')
    && storyPromptSampleSrc.includes('"玩家本次点属性"')
    && storyPromptSampleSrc.includes('"本次信息"')
    && storyPromptSampleSrc.includes('"篇幅偏好"')
    && storyPromptSampleSrc.includes('"财富"')
    && storyPromptSampleSrc.includes('"命运分支": false')
    && storyPromptSampleSrc.includes('"结局": false')
    && !storyPromptSampleSrc.includes('"历史事件"')
    && !storyPromptSampleSrc.includes('"当前状态"'),
  '01 sample must document the single-user five-element input and four-field output contract',
)
assertOk(!COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('年度故事弧线视角'), 'fixed prompt must not duplicate a scale-specific dynamic profile')
assertOk(!COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('若本轮按年或更长跨度推进，正文仍只选择一个代表性现场'), 'fixed prompt must not force annual or longer spans into one scene')
assertOk(!COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('先选择能在该区间内自然收束的单一事件'), 'word-count guidance must not override long-span narrative scale')
const tenYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 10 })
assertIncludes(tenYearHint, '覆盖10年', 'ten-year hint must expose the decade span')
const fiftyYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 50 })
assertIncludes(fiftyYearHint, '覆盖一年', 'removed fifty-year step must restore the one-year span')
assertOk(!fiftyYearHint.includes('事件链') && !fiftyYearHint.includes('单一人物线'), 'removed fifty-year step must not add a historical template')
const millenniumHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 1000 })
assertIncludes(millenniumHint, '覆盖一年', 'removed millennium step must restore the one-year span')

const januaryCalendar = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'month', value: 1 },
  calendarYear: 2026,
  month: 1,
  day: 2,
})
assertIncludes(januaryCalendar, '1月属于冬', 'calendar hint must retain the canonical January season')
assertIncludes(januaryCalendar, '日期和季节仅作为可用背景事实', 'calendar hint must keep calendar facts optional')
assertOk(!januaryCalendar.includes('天气、衣着、农事'), 'calendar guidance must not prescribe scene background details')
assertIncludes(januaryCalendar, '本轮覆盖1个月', 'month calendar guidance must expose its calendar span')

const crossMonthWindow = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'month', value: 1 },
  calendarYear: 2026,
  month: 2,
  day: 1,
  previousNode: { calendarYear: 2026, month: 1, day: 1 },
  daysPassed: 31,
})
assertIncludes(crossMonthWindow, '已推进31天（1月）', 'month span must expose the actual calendar delta')

const multiYearCalendar = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'year', value: 10 },
  calendarYear: 2035,
  month: 1,
  day: 1,
})
assertIncludes(multiYearCalendar, '2026年至2035年，共10年', 'year span must name its complete range')
assertOk(!multiYearCalendar.includes('代表性场景'), 'calendar hint must not duplicate the time-profile composition contract')

const oneYearCalendar = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'year', value: 1 },
  calendarYear: 2026,
  month: 1,
  day: 1,
})
assertIncludes(oneYearCalendar, '本轮覆盖2026年', 'single-year calendar guidance must name the complete annual window')
assertOk(!oneYearCalendar.includes('代表性场景'), 'single-year calendar guidance must leave composition to the annual time profile')
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
assertIncludes(coarseToFineWindow, '已推进31天（1月）', 'runtime calendar hint must use actual elapsed calendar days')
assertIncludes(coarseToFineWindow, '本轮实际时间窗口', 'runtime calendar hint must only preserve the actual time boundary')
assertOk(!coarseToFineWindow.includes('事件节点'), 'runtime calendar span must not retain event-node language')

const validPromotionOutput = {
  name: '照夜升阶',
  description: '因这一生的守望而凝结的轮回规则',
  effect: '这是一条保留现实代价、玩家选择余地、外部对抗空间与结果不确定性的纯概念叙事规则。',
  attrBonus: { mind: 3 },
}
assertOk(reincarnationPromotionOutputSchema.safeParse(validPromotionOutput).success, 'reincarnation promotion schema must accept a valid promoted entry')
assertOk(!reincarnationPromotionOutputSchema.safeParse({ ...validPromotionOutput, description: '' }).success, 'reincarnation promotion schema must reject an empty description')

const promotionTiers = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const promotionTargets = [2, 3, 4, 5, 6, 7, 8, 9, 9]
for (const [index, aptitudeTier] of promotionTiers.entries()) {
  const source = {
    lineageId: `lineage-${aptitudeTier}`,
    version: index + 1,
    name: `${aptitudeTier}-source`,
    description: '来源说明',
    effect: '来源效果',
    category: 'perception',
    aptitudeTier,
    developmentStage: 'complete',
    attrBonus: {},
    apexStrengthenLevel: aptitudeTier === 9 ? 3 : 0,
  }
  const target = getReincarnationPromotionTargetAptitudeTier(aptitudeTier)
  const promotionDecision = decideReincarnationPromotion(source, () => 0.99)
  assertSame(target, promotionTargets[index], `${aptitudeTier} settlement promotion target`)

  const promoted = createPromotedReincarnationTalent(source, {
    name: `${aptitudeTier}-promoted`,
    description: '升阶说明',
    effect: '升阶效果',
    attrBonus: { mind: 3 },
  }, promotionDecision, {
    worldName: '测试世界',
    characterName: '测试角色',
    runId: 'run-promotion',
  }, 100 + index)

  assertSame(promoted.aptitudeTier, promotionTargets[index], `${aptitudeTier} promoted aptitude`)
  assertSame(promoted.developmentStage, 'awakening', 'reincarnation must reset development')
  assertSame(promoted.apexStrengthenLevel, aptitudeTier === 9 ? 4 : 0, `${aptitudeTier} strengthen level`)
  assertSame(promoted.version, source.version + 1, `${aptitudeTier} promoted version`)
  assertOk(ReincarnationTalentSchema.safeParse(promoted).success, `${aptitudeTier} promotion must satisfy persistence schema`)

  const prompt = buildReincarnationPromotionUserPrompt({
    worldName: '测试世界',
    characterName: '测试角色',
    lifeSummary: '完成了一段可追溯的人生。',
    lifeRecords: ['第一轮：完成选择。'],
    selectedPattern: source,
    endingScore: 80,
    strengthTier: { id: 'deep', label: '深刻', guidance: '形成清晰且有用的概念倾向。' },
    promotionDecision,
  })
  assertSame(JSON.parse(prompt).selectedPattern.aptitudeTier, aptitudeTier, 'source aptitude must enter the promotion prompt')
  assertSame(JSON.parse(prompt).selectedPattern.targetAptitudeTier, target, 'target aptitude must enter the promotion prompt')
}

const invalidNonMythicReincarnation = {
  id: 'invalid-fine',
  lineageId: 'invalid-fine',
  version: 1,
  name: '错误精良',
  description: '说明',
  category: 'enhancement',
  aptitudeTier: 2,
  developmentStage: 'awakening',
  effect: '效果',
  attrBonus: {},
  apexStrengthenLevel: 1,
  acquiredAt: 1,
  source: { worldName: '测试世界', characterName: '测试角色' },
}
assertOk(!ReincarnationTalentSchema.safeParse(invalidNonMythicReincarnation).success, 'non-apex talents must have apexStrengthenLevel 0')
assertOk(ReincarnationTalentSchema.safeParse({ ...invalidNonMythicReincarnation, aptitudeTier: 9, apexStrengthenLevel: 0 }).success, 'new apex talents must allow apexStrengthenLevel 0')

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
      category: 'perception',
      rarity: 'rare',
      polarity: 'positive',
      attrBonus: { mind: 1, resources: 4 },
    }],
  },
  talents: [],
})
assertOk(!('resources' in migratedCharacter.characterBase.base), 'old character saves must remove resources from base attributes')
assertOk(!('talentAptitude' in migratedCharacter.characterBase.base), 'old character saves must remove the retired talent attribute')
assertSame(Object.keys(migratedCharacter.characterBase.base).join(','), 'mind,physique,charisma,familyBackground', 'migrated character saves must expose the four canonical base attributes in order')
assertSame(migratedCharacter.destinyPatterns.patterns.length, 0, 'old talent shapes must be discarded without conversion')
assertSame(migratedCharacter.equippedReincarnationTalents.length, 0, 'old character saves must default equipped reincarnation slots to empty')

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
const destinySystemSrc = readModuleSource('src/mods/mod-character/subsystems/destiny-pattern-system.ts', root)
const destinyPoolServiceSrc = readRel('src/mods/mod-character/subsystems/destiny-pattern-system/ai-pool-service.ts')
const destinyValidationSrc = readRel('src/mods/mod-character/subsystems/destiny-pattern-system/validation.ts')
const destinyPromptSrc = readRel('src/mods/mod-character/prompts/destiny-pattern-prompt.ts')
const destinyPoolCacheSrc = readRel('src/mods/mod-character/utils/destiny-pattern-pool-cache.ts')
const characterStoreSrc = readRel('src/mods/mod-character/store.ts')
const characterMigrationSrc = readRel('src/mods/mod-character/utils/character-state-migration.ts')
const reincarnationPromptSrc = readRel('src/mods/mod-character/prompts/reincarnation-promotion-prompt.ts')
const reincarnationAccessSrc = readRel('src/mods/mod-character/reincarnation-talent-access.ts')
const reincarnationLibrarySrc = readRel('src/mods/mod-character/reincarnation-library-store.ts')
const talentDrawPageSrc = readDirectorySource('src/mods/mod-pages/pages/talent-draw', root, ['.ts', '.tsx'])
const talentDrawCssSrc = readRel('src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css')
const narrativeSignalsSrc = readRel('src/mods/mod-engine/helpers/narrative-semantic-signals.ts')
const hooksSrc = readRel('src/mods/mod-engine/hooks.ts')
const orchestratorSrc = readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', root)
const timeScaleSrc = readRel('src/mods/mod-engine/helpers/time-scale-narrative.ts')
const narrativeResponseQualitySrc = readRel('src/mods/mod-engine/helpers/narrative-response-quality.ts')
const narrativeCalendarSrc = readRel('src/mods/mod-engine/helpers/narrative-calendar.ts')
const narrativePromptSrc = readRel('src/mods/mod-engine/prompts/narrative-prompt.ts')
const narrativePromptComponentsSrc = readRel('src/mods/mod-engine/server/narrative-system-prompt.ts')
const talentGrowthPromptSrc = readRel('src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts')
const promptBuilderSrc = readRel('src/core/ai-service/prompt-builder.ts')
const promptContextRuntimeSrc = readRel('src/mods/mod-engine/subsystems/orchestrator-system/prompt-context-runtime.ts')
const roundCommitBusSrc = readRel('src/mods/mod-engine/helpers/round-commit-bus.ts')
const timelineCssSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.module.css')
const timelineTsxSrc = readDirectorySource('src/mods/mod-ui/components/organisms', root, ['.ts', '.tsx'])
const settingsStoreSrc = readRel('src/mods/mod-settings/store.ts')
const aiClientSrc = readModuleSource('src/core/ai-service/ai-client.ts', root)
const proxyRouteSrc = readModuleSource('src/app/api/proxy/route.ts', root)
const welcomePageSrc = readRel('src/mods/mod-pages/pages/welcome/page.tsx')
const worldConfirmSrc = readRel('src/mods/mod-pages/pages/world-select/useWorldConfirm.ts')
const gameOverPageSrc = readDirectorySource('src/mods/mod-pages/pages/game-over', root, ['.ts', '.tsx'])

const talentPoolHelpers = loadTalentPoolHelpers(talentDrawPageSrc)
const sameNamePool = [
  { id: 'a', name: '拖延症' },
  { id: 'b', name: ' 拖延症 ' },
  ...Array.from({ length: 3 }, (_, index) => ({ id: `unique-${index}`, name: `唯一命格${index}` })),
]
assertSame(
  talentPoolHelpers.uniquePatternsByIdentity(sameNamePool).length,
  4,
  'display identity must retain only the first candidate for a canonicalized name',
)
assertSame(
  talentPoolHelpers.drawSlotsFromPool(sameNamePool).filter(Boolean).length,
  4,
  'a repeated-name pool must expose one candidate per canonicalized name',
)
assertSame(
  talentPoolHelpers.uniquePatternsByIdentity([
    ...sameNamePool,
    { id: 'extra', name: '补足命格' },
    { id: 'extra-2', name: '再补命格' },
  ]).length,
  6,
  'adding two new IDs must retain only one candidate per canonicalized name',
)

assertSame(DEFAULT_WORD_COUNT_TARGET, 300, 'new and reset preferences must default to about 300 narrative characters')
assertSame(
  NARRATIVE_WORD_COUNT_TARGETS.join(','),
  '50,100,150,200,250,300,400,500,600,700,800,1000,1200,1500,1800,2000',
  'narrative length must expose exactly the sixteen fixed player choices',
)
assertSame(resolveNarrativeWordCountTarget(777), 300, 'non-contract length values must fall back to the new default')
assertSame(resolveNarrativeWordCountTarget(200), 200, 'saved valid preferences must retain their chosen length')
assertSame(resolveNarrativeWordCountRange(200).preferredMin, 160, 'the 200-character option must expose a focused lower guidance bound')
assertSame(resolveNarrativeWordCountRange(200).preferredMax, 240, 'the 200-character option must expose a focused upper guidance bound')
assertOk(
  new Set(NARRATIVE_WORD_COUNT_TARGETS.map((target) => buildWordCountInstruction(target))).size === 16
    && buildWordCountInstruction(200) === '正文约200字。',
  'every length option must state only its configured approximate target',
)
assertOk(
  !buildWordCountInstruction(200).includes('短段')
    && !buildWordCountInstruction(200).includes('短句')
    && !buildWordCountInstruction(200).includes('场景'),
  'word-count guidance must not prescribe scene, paragraph, or sentence structure',
)
const lifecycleStatus = createCharacterNarrativeStatus({
  startingAgeYears: 2,
  totalDays: 0,
  lifespanDraft: {
    raceId: 'human',
    race: RACE_LIFESPAN.human,
    maximumLifespanYears: 100,
  },
  lifeStageTemplate: [{
    stageId: 'audit-early-life',
    displayName: '早期生命',
    description: '身体与心智仍在形成。',
    minAgeDays: 0,
    guidance: '场景、行为能力、认知和对话复杂度必须符合当前阶段事实',
  }],
})
assertOk(
  lifecycleStatus.guidance.includes('场景、行为能力、认知和对话复杂度必须符合当前阶段事实'),
  'character status guidance must bind cognition and behavior to the owning stage definition',
)
assertOk(
  !narrativeQualitySrc.includes('retryMin')
    && !narrativeQualitySrc.includes('retryMax')
    && narrativeQualitySrc.includes('lengthAdvisory'),
  'narrative length must not be implemented as a retry or rejection gate',
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
  migrateSettings({ wordCountTarget: 100, theme: 'minimal-white' }, 2).wordCountTarget,
  100,
  'an existing saved 100-character preference must not be replaced by the new default',
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
  /export async function hasAvailableApiConfiguration\(\)[\s\S]{0,320}return isApiConfigured\(\)/.test(settingsStoreSrc)
    && /providerId !== DEFAULT_AI_PROVIDER_ID[\s\S]{0,260}当前版本只支持玩家自己的 API Key/.test(proxyRouteSrc)
    && /await hasAvailableApiConfiguration\(\)/.test(welcomePageSrc)
    && !worldConfirmSrc.includes('hasAvailableApiConfiguration'),
  'the welcome entry gate and proxy must require a complete player-owned API configuration while world confirmation stays local',
)

assertOk(/DESTINY_PATTERN_DISPLAY_COUNT\s*=\s*20/.test(constantsSrc), 'destiny generation must publish twenty ordinary first-batch candidates')
assertOk(/AI_DESTINY_PATTERN_BATCH_SIZE\s*=\s*4/.test(constantsSrc), 'each destiny request must target four candidates')
assertOk(/DESTINY_PATTERN_CATEGORY_TARGET_COUNT\s*=\s*12/.test(constantsSrc), 'each destiny category must fill to twelve candidates')
assertSame(DESTINY_PATTERN_DISPLAY_COUNT, 20, 'destiny display count must expose five categories times four candidates')
assertSame(DESTINY_PATTERN_CATEGORY_TARGET_COUNT, 12, 'destiny background target must be twelve per category')
assertSame(DESTINY_PATTERN_CATEGORY_ORDER.join(','), 'enhancement,control,perception,summoning,creation', 'destiny category order must remain stable')
assertOk(
  DESTINY_PATTERN_CATEGORY_CONFIG.enhancement.label === '灵躯蜕变'
    && DESTINY_PATTERN_CATEGORY_CONFIG.control.label === '万象听令'
    && DESTINY_PATTERN_CATEGORY_CONFIG.perception.label === '洞察天机'
    && DESTINY_PATTERN_CATEGORY_CONFIG.summoning.label === '万灵随行'
    && DESTINY_PATTERN_CATEGORY_CONFIG.creation.label === '造化成形'
    && Object.values(DESTINY_PATTERN_CATEGORY_CONFIG).every((entry) => entry.guidance.includes('不限制其他能力类型')),
  'destiny categories must describe primary mechanisms without restricting other ability types',
)
for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
  const prompt = buildDestinyPatternSystemPrompt(category)
  assertOk(
    prompt.includes(DESTINY_PATTERN_CATEGORY_CONFIG[category].label)
      && prompt.includes(DESTINY_PATTERN_CATEGORY_CONFIG[category].guidance)
      && prompt.includes('只评估机制复杂度')
      && prompt.includes('不能只写成普通技能'),
    `${category} destiny prompt must carry its own primary-mechanism guidance`,
  )
  assertOk(
    prompt.includes('约30至45字')
      && prompt.includes('供故事与成长长期遵守'),
    `${category} destiny prompt must request a vivid hook and a separate complete effect`,
  )
}
assertOk(
  /AI_DESTINY_PATTERN_THREAD_ASSIGNMENTS[\s\S]{0,260}\['enhancement'\][\s\S]{0,120}\['control'\][\s\S]{0,120}\['perception'\][\s\S]{0,120}\['summoning'\][\s\S]{0,120}\['creation'\]/.test(constantsSrc),
  'destiny generation must keep five independent category tasks',
)
assertOk(!constantsSrc.includes('DESTINY_PATTERN_EARLY_READY_TIMEOUT_MS'), 'AI destiny readiness must not time out to presets')
assertOk(
  /Promise\.allSettled\(/.test(destinyPoolServiceSrc)
    && /startBackgroundFill/.test(destinyPoolServiceSrc)
    && /fillCategory/.test(destinyPoolServiceSrc),
  'destiny generation must run five independent initial calls and category-scoped background filling',
)
assertOk(!destinyPromptSrc.includes('第一次踩上'), 'destiny prompt must not teach biographical event openings')
assertOk(
    destinyPromptSrc.includes('有辨识度的能力钩子')
    && destinyPromptSrc.includes('清楚的触发动作或条件')
    && destinyPromptSrc.includes('身体素质、性格标签、训练履历或身份设定')
    && destinyPromptSrc.includes('能力来源、形成过程、过去经历和既定身份必须留白'),
  'destiny prompt must require skill-like present abilities while leaving biography open',
)
assertOk(destinyPromptSrc.includes('顶层只含“天赋”'), 'destiny prompt must match the Chinese object contract')
assertOk(
  /DESTINY_PATTERN_PROMPT_VERSION\s*=\s*'12\.3\.0'/.test(destinyPromptSrc)
    && /DESTINY_PATTERN_PROMPT_VERSION/.test(destinyPromptSrc)
    && /buildDestinyPatternSystemPrompt/.test(destinyPromptSrc),
  'destiny prompt builder and cache version must share version 12.3.0',
)
assertOk(
  destinyPromptSrc.includes('每条能力必须提供明确、可实际生效的正向收益')
    && destinyPromptSrc.includes('边界内仍提供的实际收益')
    && destinyPromptSrc.includes('禁止只有损失、惩罚或负属性的纯负面天赋'),
  'destiny prompt must require a real benefit and explicit compensation for every negative effect',
)
assertOk(
  destinyPromptSrc.includes('首句直接落到能力机制、触发条件、动作、可观察现象或世界反馈')
    && destinyPromptSrc.includes('此人')
    && destinyPromptSrc.includes('该角色')
    && destinyPromptSrc.includes('这位人物')
    && destinyPromptSrc.includes('此天赋')
    && destinyPromptSrc.includes('拥有……'),
  'destiny prompt must vary direct openings and replace fixed person/talent templates',
)
assertOk(
  destinyPromptSrc.includes('全池已经被占用的天赋名称')
    && destinyPromptSrc.includes('更换近义字后仍指向同一名称'),
  'destiny system Prompt must explain existingNames as a normalized no-repeat constraint',
)
assertOk(
  destinyPromptSrc.includes('existingPatterns')
    && destinyPromptSrc.includes('触发条件、核心动作与实际结果')
    && destinyPromptSrc.includes('不得用改名、同义表达、场景替换或限制条件换写同一能力')
    && destinyPromptSrc.includes('必须持续重写同名、同义或换写候选')
    && destinyPromptSrc.includes('不得因避免重复而少输出')
    && destinyPoolServiceSrc.includes('existingPatterns: this.currentPatterns')
    && !destinyPoolServiceSrc.includes('isSimilarDestinyPattern'),
  'destiny supplements must provide same-category summaries and delegate semantic uniqueness to the Prompt',
)
assertOk(
  destinyPromptSrc.includes('二至六个汉字')
    && destinyPromptSrc.includes('保留幻想质感')
    && destinyPromptSrc.includes('比喻最多一处')
     && destinyPromptSrc.includes('主机制族只用于候选浏览和生成分配')
    && destinyPromptSrc.includes('不是能力类型白名单')
    && destinyPromptSrc.includes('种族与背景不得扩写为出生、成长、职业、师承、关系或过去事件')
    && destinyPromptSrc.includes('开发阶段只表示当前掌握程度，与资质分轴')
    && destinyPromptSrc.includes('本次开局抽取只生成资质 1 至 3 阶')
    && destinyPromptSrc.includes('按每条能力的实际机制独立评定')
    && !destinyPromptSrc.includes('凡俗尺度')
     && destinyPromptSrc.includes('不把候选收窄为单一题材'),
  'destiny prompt must separate aptitude complexity from development and strength',
)
assertOk(
  destinyPromptSrc.includes('跨题材能力也始终可能')
    && destinyPromptSrc.includes('不因能力抽取而把模拟世界改造成全民觉醒社会')
    && destinyPromptSrc.includes('金手指可以自带自身成立所需的局部机制')
    && !destinyPromptSrc.includes('只沿用其中已经明确的规则'),
  'destiny prompt must allow cross-genre cheats without inventing a shared world power system or biography',
)
assertOk(
  destinyPromptSrc.includes('能力应实质改变行动选择或局面')
    && destinyPromptSrc.includes('信息型能力须说明线索如何转成行动优势')
    && destinyPromptSrc.includes('它打开的新机会或风险')
    && destinyPromptSrc.includes('约30至45字的短句'),
  'destiny prompt must connect a vivid scene hook to a concrete player-facing outcome',
)
const makeDestinyPattern = (index, category) => ({
  类别: category,
  名称: `命格${index}`,
  简介: `稳定成立且适应当前世界的命格特质${index}`,
  资质阶位: 1,
  开发阶段: '初醒',
  效果: `持续提供清楚可用的影响${index}`,
  属性加成: { 心智: 1 },
})
const diverseDestinyCandidates = parseDestinyPatternAIResponse(JSON.stringify({ 天赋: [
  ['画地为牢', '画出的边界产生真实阻隔。'],
  ['体能强化', '主动增强身体力量。'],
  ['机械亲和', '触碰机械时感应其运转状态。'],
  ['元素掌控', '直接引导近处元素。'],
  ['矢量操纵', '改变接触物体的运动方向。'],
  ['无限进化', '经历促成身体或能力的适应性变化。'],
].map(([名称, 效果]) => ({ 类别: 'creation', 名称, 简介: 效果, 资质阶位: 1, 开发阶段: '初醒', 效果, 属性加成: {} })) }))
assertOk(
  diverseDestinyCandidates.length === 6
    && diverseDestinyCandidates.every((candidate) => candidate.category === 'creation' && candidate.effect),
  'destiny parser must accept varied real ability mechanisms without a type whitelist',
)
assertOk(destinyPatternOutputSchema.safeParse({ 命格: [makeDestinyPattern(0, '行动')] }).success, 'destiny transport schema must stay permissive')
const compatibleResponse = parseDestinyPatternAIResponse(JSON.stringify({ 命格: [
  { 类别: '感知与信息', 名称: '踏野寻踪', 设定描述: '可识别痕迹。', 效果: '追踪更稳。', 属性加成: '心智+1，财富+1，魅力-1' },
  { 类别: '感知与信息', 名称: '过目不忘', 设定描述: '记忆清晰。', 效果: '回忆细节更准。', 属性加成: '心智+2' },
] }))
assertSame(compatibleResponse.length, 0, 'destiny parser must reject the retired talent shape')
const partialResponse = parseDestinyPatternAIResponse(JSON.stringify({ 天赋: [
  { 类别: 'enhancement', 名称: '铁壁磐石', 简介: '筋骨强健。', 资质阶位: 1, 开发阶段: '初醒', 效果: '承压更稳。', 属性加成: { 体魄: 2 } },
  { 类别: '强化与变身', 名称: '坏项', 设定描述: '', 效果: '', 属性加成: '体魄+1' },
] }))
assertOk(partialResponse.length === 1 && partialResponse[0].name === '铁壁磐石', 'destiny parser must keep valid siblings when one item is unusable')
const completeDestinyDescription = '触碰物件后能够读取它留下的局部信息，描述长度由生成 Prompt 负责，解析保留完整内容。'
const completeDestinyEffect = '触碰普通物件时能读取最近留下的局部痕迹，效果保留实际发动方式、可观察结果与信息边界。'
const completeDestinyResponse = parseDestinyPatternAIResponse(JSON.stringify({ 天赋: [
  { 类别: 'perception', 名称: '触物读痕', 简介: completeDestinyDescription, 资质阶位: 3, 开发阶段: '初醒', 效果: completeDestinyEffect, 属性加成: {} },
] }))
assertOk(
  completeDestinyResponse.length === 1
    && completeDestinyResponse[0].description === completeDestinyDescription
    && completeDestinyResponse[0].effect === completeDestinyEffect,
  'destiny summary length must remain a generation instruction, not runtime rejection or truncation',
)
const numberedResponse = parseDestinyPatternAIResponse(JSON.stringify({
  第一条: { effect: '交流更稳。', attributes: '魅力+2，心智-1', title: '言简意明', type: 'control', detail: '能迅速说清重点。' },
  第二条: { 属性加成: { 魅力: '1' }, 效果: '关系更易维持。', 名称: '守信重诺', 描述: '答应的事会认真完成。' },
}))
assertOk(
  numberedResponse.length === 0,
  'destiny parser must not convert retired field shapes or category aliases',
)
assertOk(
  !destinyValidationSrc.includes('isSimilarDestinyPattern')
    && !destinyValidationSrc.includes('isOrdinaryDestinyPatternText')
    && !destinyPoolServiceSrc.includes('isSimilarDestinyPattern')
    && !destinyPoolServiceSrc.includes('isOrdinaryDestinyPatternText')
    && !destinySystemSrc.includes('isSimilarDestinyPattern')
    && !destinySystemSrc.includes('isOrdinaryDestinyPatternText')
    && !destinyPoolCacheSrc.includes('isOrdinaryDestinyPatternText')
    && !characterMigrationSrc.includes('isOrdinaryDestinyPatternText'),
  'destiny ingestion must not apply local semantic-similarity or high-tier text filters',
)
assertOk(
  /const category = validateDestinyPatternCategory\(item\.category\)[\s\S]{0,180}const name = item\.name/.test(destinySystemSrc)
    && /category !== expectedCategory/.test(destinySystemSrc)
    && /aptitudeTier > 3/.test(destinySystemSrc)
    && /item\.developmentStage !== 'awakening'/.test(destinySystemSrc),
  'destiny response parsing must enforce assigned category, tiers 1-3, and awakening development',
)
assertOk(
  destinyPromptSrc.includes('按每条能力的实际机制独立评定') && destinyPromptSrc.includes('不设概率、数量配额或强度配额'),
  'AI must assess aptitude from mechanisms without quotas or probability',
)
assertOk(
  !destinyPromptSrc.includes('极性') && !destinySystemSrc.includes('polarity'),
  'destiny generation must not retain the retired polarity contract',
)
assertOk(!destinyPromptSrc.includes('resources:'), 'destiny output schema must reject the removed resources attribute')
assertOk(
  destinyPromptSrc.includes('心智、体魄、魅力、财富或较少出现的气运')
    && destinyPromptSrc.includes('Transport-only schema'),
  'destiny prompt must keep the shared attribute semantics without strict whole-response gating',
)
assertOk(
  !destinyPromptSrc.includes('systemModifiers')
    && !destinySystemSrc.includes('systemModifiers'),
  'destiny generation must not retain retired system modifiers',
)
assertOk(
  destinyPromptSrc.includes('完整效果按')
    && destinyPromptSrc.includes('没有额外代价时不强行添加')
    && destinyPromptSrc.includes('触发条件、动作或机制、实际结果、边界及真实代价')
    && destinyPromptSrc.includes('不得生成无条件的全局结果、绝对控制、必然命运、无限持续'),
  'conceptual rules and ordinary-tier semantics must match the current prompt contract',
)
assertOk(/供故事与成长长期遵守/.test(destinyPromptSrc), 'destiny effect must remain a narrative skill rule instead of only numeric modifiers')
assertOk(
  ['骨鸣换力', '残音寻踪', '灯下替身', '旧物复新', '影墨成形'].every((name) => constantsSrc.includes(`name: '${name}'`))
    && !['负重耐行', '观微知著', '守诺如山', '洁身有序', '零碎灵感'].some((name) => constantsSrc.includes(`name: '${name}'`)),
  'explicit preset candidates must use skill-like entries while keeping the existing preset path',
)
assertOk(
  /version:\s*12/.test(characterStoreSrc)
    && ['characterBase', 'destinyPatterns', 'lifespanDraft'].every((field) => characterStoreSrc.includes(field))
    && !['health: _health', 'lifespan: _lifespan', 'lifecycle: _lifecycle'].some((field) => characterStoreSrc.includes(field)),
  'character persistence must retain identity and unified status while excluding retired runtime projections',
)
assertOk(
  ['equippedReincarnationTalents', 'setEquippedReincarnationTalents'].every((field) => characterStoreSrc.includes(field))
    && !characterStoreSrc.includes('mythicCandidates')
    && !characterStoreSrc.includes('sealedMythicPatternId'),
  'character store must persist equipped reincarnation talents without retired candidates or sealed identity',
)
assertOk(
  /BASE_ATTRIBUTE_KEYS\s*=\s*\['mind', 'physique', 'charisma', 'familyBackground'\]/.test(characterMigrationSrc)
    && !/BASE_ATTRIBUTE_KEYS[^\n]*resources/.test(characterMigrationSrc),
  'character migration must keep exactly four base attributes',
)
assertOk(
  /sanitizeDestinyPatternState/.test(characterMigrationSrc) && /sanitizeAttrBonus/.test(characterMigrationSrc),
  'old character saves and destiny pools must remove retired attribute bonuses',
)
assertOk(
  /z\.object\(\{[\s\S]*name:[\s\S]*description:[\s\S]*effect:/.test(reincarnationPromptSrc)
    && /version:\s*'3\.0\.0'/.test(reincarnationPromptSrc)
    && reincarnationPromptSrc.includes('模板化起句'),
  'reincarnation promotion must keep its schema and vary direct openings',
)
assertOk(
  /非数值规则/.test(reincarnationPromptSrc) && /完整保留既有能力/.test(reincarnationPromptSrc),
  'reincarnation promotion must retain established abilities and may add narrative rules',
)
assertOk(
  /promoteReincarnationTalent/.test(reincarnationAccessSrc) && /setReincarnationPromotionAIService/.test(reincarnationAccessSrc),
  'mod-character must expose a configurable reincarnation promotion entry',
)
assertOk(
  /selectedPattern:\s*\{[\s\S]{0,650}apexStrengthenLevel:\s*input\.selectedPattern\.apexStrengthenLevel/.test(reincarnationAccessSrc),
  'reincarnation promotion must send only a compact selected-pattern projection instead of every stored talent effect',
)
assertOk(
  /lifeDigests\?: readonly/.test(reincarnationAccessSrc)
    && /lifeSummary:\s*string/.test(reincarnationAccessSrc)
    && /lifeDigests: promotionLifeDigests/.test(gameOverPageSrc)
    && /lifeRecords: promotionLifeRecords/.test(gameOverPageSrc)
    && /selectedPattern: candidate/.test(gameOverPageSrc)
    && /endingScore: overallScore/.test(gameOverPageSrc)
    && /strengthTier: reincarnationStrength/.test(gameOverPageSrc),
  'reincarnation settlement must include compact life digests and records alongside the selected pattern',
)
assertOk(
  /mod-character:persist:reincarnation-library/.test(reincarnationLibrarySrc)
    && /talents: ReincarnationTalent\[\]/.test(reincarnationLibrarySrc)
    && /addReincarnationTalent/.test(reincarnationLibrarySrc),
  'reincarnation library must use an independent cross-run persistent store',
)
assertOk(!talentDrawPageSrc.includes('buildTimeoutFallback'), 'AI destiny page must not build a preset timeout fallback')
assertOk(!talentDrawPageSrc.includes('fallbackTimer'), 'AI destiny page must keep waiting instead of starting a fallback timer')
assertSame(
  talentDrawPageSrc.match(/generateFromPresets\s*\(/g)?.length ?? 0,
  1,
  'preset generation must appear only in the explicit non-AI branch',
)
assertOk(
  /PRESET_DESTINY_PATTERN_CATEGORY_BY_NAME\[pattern\.name\] === category/.test(destinySystemSrc)
    && !destinySystemSrc.includes('pattern.polarity'),
  'explicit non-AI generation must enforce only the local category assignment',
)
assertOk(
  /if\s*\(!aiTalentGeneration\)\s*\{[\s\S]{0,260}generateFromPresets\s*\(/.test(talentDrawPageSrc),
  'preset generation must stay behind the disabled-AI branch',
)
assertOk(
  /startBackgroundFill/.test(destinyPoolServiceSrc)
    && /DESTINY_PATTERN_CATEGORY_TARGET_COUNT/.test(destinyPoolServiceSrc),
  'AI destiny generation must retain the explicit category fill lifecycle',
)
assertOk(
  /Promise\.allSettled\([\s\S]{0,700}failCategory/.test(destinyPoolServiceSrc)
    && !/this\.setCandidates\(\[\]\)/.test(destinyPoolServiceSrc),
  'destiny category failures must preserve valid sibling candidates',
)
assertOk(
  /existingNames:\s*this\.currentPatterns\.map/.test(destinyPoolServiceSrc)
    && /existingPatterns:\s*this\.currentPatterns/.test(destinyPoolServiceSrc)
    && !/assignedCategory:\s*category/.test(destinyPoolServiceSrc)
    && /outputSchema:\s*undefined/.test(destinyPoolServiceSrc)
    && !/DestinyPatternAIGenerateOptions/.test(destinyPoolServiceSrc),
  'destiny category calls must build category-scoped prompts without strict schema validation or the retired generation contract',
)
assertOk(
  /function canonicalizeDestinyPatternName/.test(destinyValidationSrc)
    && /function dedupeDestinyPatterns/.test(destinyValidationSrc)
    && /seenNames\.has\(nameKey\)/.test(destinyValidationSrc)
    && /seenNames\.add\(nameKey\)/.test(destinyValidationSrc)
    && /this\.currentPatterns = dedupeDestinyPatterns/.test(destinyPoolServiceSrc)
    && /countCategory\(category\)/.test(destinyPoolServiceSrc),
  'the AI authority must dedupe canonicalized names and repeated IDs while tracking each category independently',
)
assertOk(
  /getPoolFillStatus\(\)\.phase === 'initial'[\s\S]{0,80}abortPoolFill\(\)/.test(talentDrawPageSrc),
  'leaving the page must only abort the unfinished initial draw, not a silent background fill',
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
  /const usableSaved = savedSlotsAreValid && saved\?\.aiTalentGeneration === aiTalentGeneration/.test(talentDrawPageSrc),
  'an incompatible saved selection must not fall through into the selecting phase',
)
assertOk(
  /type TalentDrawPhase = 'idle' \| 'generating' \| 'ready' \| 'selecting'/.test(talentDrawPageSrc),
  'destiny draw must keep an explicit non-persisted handoff state after the five-category first batch is ready',
)
assertOk(
  /const completeFullDraw = useCallback\(\(patterns: DestinyPattern\[\]\)/.test(talentDrawPageSrc)
    && /DESTINY_PATTERN_CATEGORY_ORDER\.every/.test(talentDrawPageSrc)
    && /setSlots\(slotsFromInitialPool\(acceptedPatterns\)\)/.test(talentDrawPageSrc)
    && /setPhase\('ready'\)/.test(talentDrawPageSrc)
    && !/completionTimerRef|revealSlotsInOrder/.test(talentDrawPageSrc),
  'AI destiny readiness must require usable candidates from all five categories before the handoff opens',
)
assertOk(
  /phase === 'ready'[\s\S]{0,1600}进入命格选择/.test(talentDrawPageSrc),
  'the completed destiny handoff must expose an explicit enter-selection action',
)
assertOk(
  /function uniquePatternsByIdentity/.test(talentDrawPageSrc)
    && /seenIds\.has\(pattern\.id\)/.test(talentDrawPageSrc)
    && /seenNames\.has\(nameKey\)/.test(talentDrawPageSrc),
  'the destiny draw must dedupe both repeated IDs and canonicalized names',
)
assertOk(
  /const savedSlotsAreValid[\s\S]{0,360}savedPatterns\.length >= DESTINY_PATTERN_DISPLAY_COUNT[\s\S]{0,260}uniquePatternsByIdentity\(savedPatterns\)\.length === savedPatterns\.length/.test(talentDrawPageSrc),
  'persisted selecting slots must not restore a repeated-ID set',
)
assertOk(
  /cached\.length >= DESTINY_PATTERN_DISPLAY_COUNT[\s\S]{0,500}phase: 'selecting'/.test(talentDrawPageSrc)
    && /initial\.phase !== 'selecting'/.test(talentDrawPageSrc),
  'a current complete cache must enter selection on the first render without replaying the draw handoff',
)
assertOk(
  /startBackgroundFill[\s\S]{0,1800}catch\(\(error\)[\s\S]{0,500}setErrorMsg/.test(talentDrawPageSrc)
    && talentDrawPageSrc.includes('再次进入选择页时会继续补充缺失命格'),
  'background destiny fill failures must remain visible and explain the next-entry refill behavior',
)
assertOk(
  /const patterns = await destinySystem\.generateWithAI\(context\)[\s\S]{0,500}completeFullDraw\(complete\)/.test(talentDrawPageSrc)
    && /startBackgroundFill\(\)/.test(talentDrawPageSrc),
  'the page must hand off the five-category first batch before starting background filling',
)
assertOk(
  /outputSchema\?: Parameters<typeof callAI>\[2\]\['outputSchema'\]/.test(talentDrawPageSrc)
    && /outputSchema:\s*opts\?\.outputSchema/.test(talentDrawPageSrc)
    && !/strictSchema:\s*!useStream\s*&&\s*Boolean\(opts\?\.outputSchema\)/.test(talentDrawPageSrc),
  'the destiny page adapter must preserve the subsystem output schema and enforce it for non-streaming calls',
)
assertOk(
  /if \(isDeepSeekModel\)[\s\S]{0,220}reasoningEffort === 'disabled'[\s\S]{0,120}thinking = \{ type: 'disabled' \}/.test(aiClientSrc)
    && /proxyBody\.reasoning_effort = reasoningEffort/.test(aiClientSrc)
    && /reasoning_effort:\s*z\.enum\(\['high', 'max'\]\)/.test(proxyRouteSrc)
    && /thinking:\s*z\.object\(\{ type: z\.enum\(\['disabled', 'enabled'\]\) \}\)\.strict\(\)\.optional\(\)/.test(proxyRouteSrc),
  'DeepSeek reasoning must transmit an explicit enabled/disabled type and supported reasoning effort',
)
assertOk(
  /const visibleIds = new Set/.test(talentDrawPageSrc)
    && /const visibleNames = new Set/.test(talentDrawPageSrc)
    && /visibleNames\.has\(nameKey\)/.test(talentDrawPageSrc),
  'destiny redraw must reject repeated IDs and canonicalized names',
)
assertOk(
  /\.categoryProgressList\s*\{/.test(talentDrawCssSrc)
    && /\.categorySlots\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s.test(talentDrawCssSrc)
    && !/\.aura|@keyframes|animation:/.test(talentDrawCssSrc)
    && /aria-label="五类首批命印进度"/.test(talentDrawPageSrc)
    && /DESTINY_PATTERN_CATEGORY_ORDER\.map/.test(talentDrawPageSrc)
    && /DESTINY_PATTERN_CATEGORY_CONFIG\[id\]\.label/.test(talentDrawPageSrc)
    && /\{ id: 'mythic', label: '轮回天赋' \}/.test(talentDrawPageSrc)
    && /resolvedLoadoutSlots\.map\(/.test(talentDrawPageSrc)
    && !/selectedData\.length !== PATTERN_LOADOUT_SLOT_COUNT/.test(talentDrawPageSrc)
    && talentDrawPageSrc.includes('未选择命格 · 进入属性分配')
    && !/role="dialog"|TalentDrawMythicLibrary|useTalentDrawMythicLibrary/.test(talentDrawPageSrc)
    && !/TalentAstrolabe|astrolabe|fateNode/.test(talentDrawPageSrc)
    && !/progressTrack|progressFill/.test(talentDrawPageSrc),
  'destiny draw must show static five-category progress, six tabs, and four shared slots without ritual animation',
)

assertOk(
  !orchestratorSrc.includes('capturePreviewSnapshot')
    && !orchestratorSrc.includes('restorePreviewSnapshot')
    && !hooksSrc.includes('roundSnapshot')
    && !hooksSrc.includes('rollbackError'),
  'failed real rounds must never restore an earlier runtime snapshot',
)

assertOk(
  !timeScaleSrc.includes('根据当前事实自然展开')
    && timeScaleSrc.includes('历史和本轮事实供合理叙事参考'),
  'time-scale guidance must only provide time facts alongside the single reasonable-narrative rule',
)
assertOk(
    timeScaleSrc.includes('本轮实际时间窗口')
    && !timeScaleSrc.includes('进入场景')
    && !narrativePromptComponentsSrc.includes('日期、年龄与阶段名称'),
  'time guidance must own only time-boundary facts',
)
assertOk(
  !timeScaleSrc.includes('至少完整呈现一条事件链')
    && !timeScaleSrc.includes('不能用单一现场代替整段跨度')
    && !promptBuilderSrc.includes('context.eventInjectionText'),
  'time guidance must stay factual and the data layer must not carry injected events',
)
assertOk(
  timeScaleSrc.includes("day: '日'")
    && timeScaleSrc.includes("month: '月'")
    && timeScaleSrc.includes("season: '季'")
    && timeScaleSrc.includes("year: '年'"),
  'calendar step labels must retain day/month/season/year timing',
)
assertOk(/case 'year'[\s\S]{0,120}return eraLabel/.test(narrativeCalendarSrc), 'year label must contain only the year/era')
assertOk(
  /seasonName/.test(narrativeCalendarSrc)
    && /getSeasonForMonth\(round\.month\)/.test(narrativeCalendarSrc)
    && /getSeasonForMonth/.test(timeScaleSrc),
  'season label must derive the season from the solar month',
)
assertOk(/case 'month'[\s\S]{0,180}round\.month/.test(narrativeCalendarSrc), 'month label must include the calendar month')
assertOk(orchestratorSrc.includes('currentTime: narrativeTime.timeLabel'), 'AI currentTime must use the authoritative formatted time label')

assertOk(!timeScaleSrc.includes('事件节点'), 'time-scale guidance must not retain the event-node clock')
assertOk(narrativeSignalsSrc.includes("metadata.importance !== 'HIGH'"), 'branch metadata must require HIGH importance')
assertOk(
  narrativeSignalsSrc.includes('命运分支的重要程度必须为高')
    && narrativeSignalsSrc.includes('命运分支必须是不可逆变化')
    && narrativeSignalsSrc.includes('命运分支必须使用命运或传承语域'),
  'branch eligibility must remain owned by the local semantic contract',
)
assertOk(/version:\s*'10\.0\.0'/.test(narrativePromptSrc), 'narrative contract must use version 10.0.0')
assertOk(
  DEFAULT_WORD_COUNT_TARGET === 300
    && resolveNarrativeWordCountTarget(250) === 250
    && resolveNarrativeWordCountTarget(400) === 400,
  'the new default must not overwrite saved valid narrative length preferences',
)
assertOk(
  narrativeSignalsSrc.includes('metadata.semanticSignals?.irreversible !== true')
    && narrativeSignalsSrc.includes("metadata.semanticSignals.narrativeRegister !== 'fate'"),
  'branch eligibility must require an irreversible fate or legacy semantic signal',
)
assertOk(
  COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('你是人生模拟器')
     && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('角色是中心')
     && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('历史是已经发生的人生')
     && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('正文像人生小说的一章，不是因果报告')
     && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('允许概括、跳跃、留白')
     && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('事件卡池只提供卡名')
     && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('按本次信息.篇幅偏好')
     && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('按本次信息.叙事称呼和文风偏好')
    && promptBuilderSrc.includes('本次信息')
    && promptBuilderSrc.includes('叙事称呼: formatNarrativeAddressing')
    && promptBuilderSrc.includes('文风偏好')
    && promptBuilderSrc.includes('命运分支'),
  'fixed Prompt must own character-first prose rules while dynamic assembly owns current information',
)
assertOk(
  !timeScaleSrc.includes('根据当前事实自然展开')
    && timeScaleSrc.includes('历史和本轮事实供合理叙事参考')
    && !promptBuilderSrc.includes('叙述风格：')
    && !promptBuilderSrc.includes('DEFAULT_NARRATIVE_STYLE')
    && promptBuilderSrc.includes('文风偏好: nonEmpty(context.narrativeStyle)')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('不要写成提纲、规则解释、设定说明或事件清单'),
  'time-scale entry must remain live while custom style stays a subordinate preference',
)
assertOk(
  promptBuilderSrc.includes('context.timelineMemory ?? []')
    && promptBuilderSrc.includes('context.recentStories ?? []')
    && promptBuilderSrc.includes('historicalEvents')
    && !promptBuilderSrc.includes('currentNarrativeState')
    && timeScaleSrc.includes('历史和本轮事实供合理叙事参考')
    && !timeScaleSrc.includes('上一节点的既成结果'),
  '01 must project existing timeline and recent stories into 历史输出 without a separate current-state field',
)
assertOk(
  talentGrowthPromptSrc.includes('程序筛选')
    && talentGrowthPromptSrc.includes('多天赋'),
  '03 must prefer other eligible talents without inventing growth evidence',
)
assertOk(
  promptBuilderSrc.includes('{ 世界: world }')
    && promptBuilderSrc.includes("名称: nonEmpty(rawWorld.名称) ?? ''")
    && promptBuilderSrc.includes('描述: buildWorldDescription(context, rawWorld.描述)')
    && promptBuilderSrc.includes('subsystemSummaries')
    && promptBuilderSrc.includes('{ 玩家信息: character }')
    && promptBuilderSrc.includes('{ 历史输出: { 事件: historicalEvents } }')
    && promptBuilderSrc.includes('玩家本次点属性: buildNarrativeAttributes')
    && promptBuilderSrc.includes('本次信息: {')
     && promptBuilderSrc.includes('时间节点: `当前年龄=${currentAgeValue}；内部阶段索引=${currentAgeValue}；只用于合龄裁决，不转写为正文`')
    && promptBuilderSrc.includes('时间窗口: buildNarrativeWindowProjection(context)')
    && promptBuilderSrc.includes('篇幅偏好: nonEmpty(context.wordCountInstruction)')
    && promptBuilderSrc.includes("财富: '0'")
    && !promptBuilderSrc.includes('当前到期事件')
    && promptBuilderSrc.includes('const segments = [dataLayerSegment]')
    && promptBuilderSrc.includes('recentStories')
    && promptBuilderSrc.includes('timelineMemory')
    && !promptBuilderSrc.includes('当前人生状态')
    && !/(空间形态|世界观本质|力量体系|成立规则|文明阶段|当前区域|当前可叙述状态)/u.test(promptBuilderSrc),
  '01 dynamic assembly must keep the approved five-field whitelist before server composition',
)
assertOk(
  !readRel('src/mods/mod-character/prompts/destiny-pattern-context.ts').includes('姓名=')
    && !readRel('src/mods/mod-pages/pages/talent-draw/talent-draw-ai-service.ts').includes('name: useCharacterStore'),
  'destiny-pattern AI context must not include the player name',
)
assertOk(
  readRel('src/mods/mod-character/subsystems/destiny-pattern-system/validation.ts').includes("typeof value === 'string'")
    && readRel('src/mods/mod-engine/helpers/narrative-response-quality.ts').includes('boundedText'),
  'AI parsers must recover string attributes and bounded local fields instead of rejecting whole responses',
)
assertOk(
  !orchestratorSrc.includes('opening-information-priority'),
  'the retired attribute-over-background opening priority must not be injected',
)
assertOk(timeScaleSrc.includes('getSeasonForMonth') && timeScaleSrc.includes('SEASON_NAMES'), 'dynamic time guidance must derive the season from the canonical calendar mapping')
assertOk(!/commit\.changes\.slice\(/.test(roundCommitBusSrc), 'round commit must never partially truncate structured changes')
assertOk(
  roundCommitBusSrc.includes("export type RoundCommitSource = 'manual'")
    && !roundCommitBusSrc.includes("'background'"),
  'round commit must expose only local manual writes after AI state writers are removed',
)
assertOk(timelineTsxSrc.includes('splitNarrativeParagraphs(entry.text)'), 'timeline must render every natural narrative paragraph')
assertOk(!timelineTsxSrc.includes('streamingText'), 'timeline must render only fully committed narrative entries')
assertOk(
  !promptContextRuntimeSrc.includes('projectPowerFramework')
    && !promptContextRuntimeSrc.includes('powerFramework:')
    && !promptContextRuntimeSrc.includes('buildConfiguredWorldRules')
    && !promptContextRuntimeSrc.includes('modWorldRules:'),
  '01 world projection must keep world dimensions and power-framework rules out of the main-story context',
)
assertOk(!timelineCssSrc.includes('.entryLatest'), 'latest narrative must not have a special background rule')
assertOk(!timelineTsxSrc.includes('styles.entryLatest'), 'latest narrative must not receive a special style class')

if (failed === 0) {
  console.log('PASS: playtest-quality-regression')
  process.exit(0)
}

process.exit(1)
