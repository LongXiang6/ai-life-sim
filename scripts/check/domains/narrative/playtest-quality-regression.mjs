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
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
  DESTINY_PATTERN_DISPLAY_COUNT,
  RACE_LIFESPAN,
} from '../../../../src/mods/mod-character/constants.ts'
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
  getReincarnationPromotionTargetRarity,
} from '../../../../src/mods/mod-character/reincarnation-talent-access.ts'
import { destinyPatternOutputSchema } from '../../../../src/mods/mod-character/prompts/destiny-pattern-prompt.ts'
import { parseDestinyPatternAIResponse } from '../../../../src/mods/mod-character/subsystems/destiny-pattern-system/validation.ts'
import { buildFestivalNarrativeHint } from '../../../../src/mods/mod-engine/subsystems/time-system/festival-calendar.ts'
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
    `${declarations.join('\n')}\nmodule.exports = { uniquePatternsByIdentity, drawSlotsFromPool }`,
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
  'time-scale macro levels must increase strictly from day to millennium',
)
for (const option of AVAILABLE_TIME_STEPS) {
  const profile = getTimeScaleNarrativeProfile(option)
  const hint = buildTimeScaleNarrativeHint(option)
  assertSame(profile.key, encodeTimeStepKey(option), `profile key must match ${encodeTimeStepKey(option)}`)
  assertIncludes(hint, profile.prompt, `${profile.id} prompt must enter the assembled time guidance`)
}

const oneYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 1 })
assertIncludes(oneYearHint, '年度故事弧线视角', 'one-year hint must use a connected annual story arc')
assertIncludes(oneYearHint, '二至三个彼此照应的代表性场景', 'one-year hint must cover the annual arc with connected representative scenes')
assertIncludes(oneYearHint, '旧主线只能作为承接背景，不能占据多数篇幅', 'one-year hint must move away from a repeated recent main line')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '根据世界事实、连续记忆和本轮引导', 'fixed prompt must use the approved 01 story sources')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '多个并列事项都要形成实际尝试', 'fixed prompt must cover every selected parallel action')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '当前时间、玩家行动、年龄边界、挑战与失败取向、称呼方式、叙述风格和字数要求', 'fixed prompt must map the approved age, challenge and failure guidance')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '角色当前身份、当前年龄、能力语义与天赋', 'fixed prompt must map age and talent under the character input')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '0至2岁只写婴幼儿能够成立的感知', 'fixed prompt must enforce infant capability boundaries')
assertIncludes(COMPILED_NARRATIVE_SYSTEM_PROMPT, '当前已生效天赋', 'fixed prompt must use the unified talent terminology')
assertOk(!COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('当前到期事件中的每项都要在正文中实际处理'), 'fixed prompt must not add a per-item due-event obligation')
assertOk(COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('"当前到期事件":'), 'fixed prompt must describe the optional due-event input')
const storySystemPromptSample = storyPromptSampleSrc.match(/## 系统 Prompt\s*```json\s*([\s\S]*?)\s*```/u)?.[1]
assertSame(storySystemPromptSample, COMPILED_NARRATIVE_SYSTEM_PROMPT, '01 sample system Prompt must exactly match the protected runtime asset')
assertOk(!COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('年度故事弧线视角'), 'fixed prompt must not duplicate a scale-specific dynamic profile')
assertOk(!COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('若本轮按年或更长跨度推进，正文仍只选择一个代表性现场'), 'fixed prompt must not force annual or longer spans into one scene')
assertOk(!COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('先选择能在该区间内自然收束的单一事件'), 'word-count guidance must not override long-span narrative scale')
const tenYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 10 })
assertIncludes(tenYearHint, '十年人生转型视角', 'ten-year hint must use character-scale decade transformation')
const fiftyYearHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 50 })
assertIncludes(fiftyYearHint, '半世纪历史视角', 'fifty-year hint must use historical perspective')
assertIncludes(fiftyYearHint, '选择少量能够代表转折的时代场景', 'fifty-year hint must use connected historical nodes')
assertIncludes(fiftyYearHint, '追踪同一个选择、事业、关系或遗产如何改变形态并反过来塑造人生', 'fifty-year hint must sustain one historical causal thread')
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
assertIncludes(januaryCalendar, '其中1月称冬季', 'cold January weather must retain its calendar season')
assertIncludes(januaryCalendar, '异常寒冷或炎热作为该季节中的特殊天气呈现', 'calendar guidance must separate weather from season naming')

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
assertIncludes(multiSeasonCalendar, '环境与社会节律随跨季过程自然变化', 'multi-season hint must require seasonal change')

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
assertIncludes(coarseToFineWindow, '已推进31天（1月）', 'runtime calendar hint must use actual elapsed days after a coarse-to-fine switch')
assertIncludes(coarseToFineWindow, '开端承接上一节点的既成结果', 'runtime calendar hint must advance from the completed period')
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
assertIncludes(alignedBridgeWindow, '前一粗粒度窗口已经完成', 'bridge prompt must preserve the completed coarse window')
assertIncludes(alignedBridgeWindow, '正文从当前合法节点建立一个代表性现场、后果或新线索', 'bridge prompt must continue from the current legal node')

const validPromotionOutput = {
  name: '照夜升阶',
  description: '因这一生的守望而凝结的轮回规则',
  effect: '这是一条保留现实代价、玩家选择余地、外部对抗空间与结果不确定性的纯概念叙事规则。',
  attrBonus: { mind: 3 },
}
assertOk(reincarnationPromotionOutputSchema.safeParse(validPromotionOutput).success, 'reincarnation promotion schema must accept a valid promoted entry')
assertOk(!reincarnationPromotionOutputSchema.safeParse({ ...validPromotionOutput, description: '' }).success, 'reincarnation promotion schema must reject an empty description')

const promotionRarities = ['common', 'fine', 'rare', 'epic', 'legendary', 'mythic']
const promotionTargets = ['fine', 'rare', 'epic', 'legendary', 'mythic', 'mythic']
for (const [index, rarity] of promotionRarities.entries()) {
  const source = {
    lineageId: `lineage-${rarity}`,
    version: index + 1,
    name: `${rarity}-source`,
    description: '来源说明',
    effect: '来源效果',
    category: 'cognition',
    rarity,
    attrBonus: {},
    strengthenLevel: rarity === 'mythic' ? 3 : 0,
  }
  const target = getReincarnationPromotionTargetRarity(rarity)
  const promotionDecision = decideReincarnationPromotion(source, () => 0.99)
  assertSame(target, promotionTargets[index], `${rarity} settlement promotion target`)

  const promoted = createPromotedReincarnationTalent(source, {
    name: `${rarity}-promoted`,
    description: '升阶说明',
    effect: '升阶效果',
    attrBonus: { mind: 3 },
  }, promotionDecision, {
    worldName: '测试世界',
    characterName: '测试角色',
    runId: 'run-promotion',
  }, 100 + index)

  assertSame(promoted.rarity, promotionTargets[index], `${rarity} promoted rarity`)
  assertSame(promoted.strengthenLevel, rarity === 'mythic' ? 4 : 0, `${rarity} strengthen level`)
  assertSame(promoted.version, source.version + 1, `${rarity} promoted version`)
  assertOk(ReincarnationTalentSchema.safeParse(promoted).success, `${rarity} promotion must satisfy persistence schema`)

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
  assertOk(new RegExp(`"rarity"\\s*:\\s*"${rarity}"`).test(prompt), `${rarity} source rarity must enter the promotion prompt`)
  assertOk(new RegExp(`"targetRarity"\\s*:\\s*"${target}"`).test(prompt), `${target} target rarity must enter the promotion prompt`)
}

const invalidNonMythicReincarnation = {
  id: 'invalid-fine',
  lineageId: 'invalid-fine',
  version: 1,
  name: '错误精良',
  description: '说明',
  category: 'action',
  rarity: 'fine',
  effect: '效果',
  attrBonus: {},
  strengthenLevel: 1,
  acquiredAt: 1,
  source: { worldName: '测试世界', characterName: '测试角色' },
}
assertOk(!ReincarnationTalentSchema.safeParse(invalidNonMythicReincarnation).success, 'non-mythic reincarnation talents must have strengthenLevel 0')
assertOk(ReincarnationTalentSchema.safeParse({ ...invalidNonMythicReincarnation, rarity: 'mythic', strengthenLevel: 0 }).success, 'newly promoted mythic reincarnation talents must allow strengthenLevel 0')

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
      category: 'cognition',
      rarity: 'rare',
      polarity: 'positive',
      attrBonus: { mind: 1, resources: 4 },
    }],
  },
  talents: [],
})
assertOk(!('resources' in migratedCharacter.characterBase.base), 'old character saves must remove resources from base attributes')
assertOk(!('resources' in migratedCharacter.destinyPatterns.patterns[0].attrBonus), 'old character saves must remove resources from destiny bonuses')
assertOk(!('polarity' in migratedCharacter.destinyPatterns.patterns[0]), 'old character saves must discard the retired destiny polarity field')
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

const newYearFestivalHint = buildFestivalNarrativeHint({
  scope: 'china',
  timeStep: { unit: 'day', value: 1 },
  month: 1,
  day: 1,
})
assertOk(newYearFestivalHint?.includes('春节'), 'game calendar must expose Spring Festival on first day of the year')
assertSame(
  buildFestivalNarrativeHint({ scope: 'china', timeStep: { unit: 'day', value: 1 }, month: 1, day: 2 }),
  undefined,
  'game calendar must match festivals by exact month and day',
)
assertOk(
  buildFestivalNarrativeHint({
    scope: 'china-and-international',
    timeStep: { unit: 'day', value: 1 },
    month: 2,
    day: 14,
  })?.includes('情人节'),
  'international festival scope must add optional international dates',
)

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
const narrativeHintsSrc = readRel('src/mods/mod-engine/helpers/narrative-hints.ts')
const narrativeCalendarSrc = readRel('src/mods/mod-engine/helpers/narrative-calendar.ts')
const narrativePromptSrc = readRel('src/mods/mod-engine/prompts/narrative-prompt.ts')
const narrativePromptComponentsSrc = readRel('src/mods/mod-engine/server/narrative-system-prompt.ts')
const talentGrowthPromptSrc = readRel('src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts')
const promptBuilderSrc = readRel('src/core/ai-service/prompt-builder.ts')
const promptContextRuntimeSrc = readRel('src/mods/mod-engine/subsystems/orchestrator-system/prompt-context-runtime.ts')
const roundCommitBusSrc = readRel('src/mods/mod-engine/helpers/round-commit-bus.ts')
const timelineCssSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.module.css')
const timelineTsxSrc = readDirectorySource('src/mods/mod-ui/components/organisms', root, ['.ts', '.tsx'])
const calendarContextSrc = readRel('src/mods/mod-engine/helpers/calendar-narrative-context.ts')
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
  5,
  'display identity must retain same-name candidates when their IDs differ',
)
assertSame(
  talentPoolHelpers.drawSlotsFromPool(sameNamePool).filter(Boolean).length,
  5,
  'a five-item pool with distinct IDs must expose all five candidates despite repeated names',
)
assertSame(
  talentPoolHelpers.uniquePatternsByIdentity([
    ...sameNamePool,
    { id: 'extra', name: '补足命格' },
    { id: 'extra-2', name: '再补命格' },
  ]).length,
  7,
  'adding two new IDs must retain all seven candidates regardless of display-name similarity',
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
assertOk(
  new Set(NARRATIVE_WORD_COUNT_TARGETS.map((target) => buildWordCountInstruction(target))).size === 16
    && buildWordCountInstruction(200).includes('2至3个短段、4至6个短句')
    && buildWordCountInstruction(200).startsWith('正文约200字。'),
  'every length option must select distinct density guidance and state the configured approximate target',
)
assertOk(
  buildWordCountInstruction(200).includes('按本轮视角分配必要节点')
    && !buildWordCountInstruction(200).includes('一个感官锚点')
    && !buildWordCountInstruction(200).includes('一组关键行动或对话'),
  'word-count guidance must own density without forcing every time scale into one scene',
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
  buildNarrativeCoherenceHeader({ powerSystemTag: 'none' }, 2)?.includes('【世界设定】【命格天赋】或【当前状态】'),
  'a no-base-power world must still preserve supernatural facts explicitly established by world, talent, or state',
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

assertOk(/DESTINY_PATTERN_DISPLAY_COUNT\s*=\s*20/.test(constantsSrc), 'destiny generation must publish twenty ordinary first-batch candidates')
assertOk(/AI_DESTINY_PATTERN_BATCH_SIZE\s*=\s*4/.test(constantsSrc), 'each destiny request must target four candidates')
assertOk(/DESTINY_PATTERN_CATEGORY_TARGET_COUNT\s*=\s*12/.test(constantsSrc), 'each destiny category must fill to twelve candidates')
assertSame(DESTINY_PATTERN_DISPLAY_COUNT, 20, 'destiny display count must expose five categories times four candidates')
assertSame(DESTINY_PATTERN_CATEGORY_TARGET_COUNT, 12, 'destiny background target must be twelve per category')
assertSame(DESTINY_PATTERN_CATEGORY_ORDER.join(','), 'action,cognition,expression,stewardship,misc', 'destiny category order must remain stable')
assertOk(
  /AI_DESTINY_PATTERN_THREAD_ASSIGNMENTS[\s\S]{0,260}\['action'\][\s\S]{0,120}\['cognition'\][\s\S]{0,120}\['expression'\][\s\S]{0,120}\['stewardship'\][\s\S]{0,120}\['misc'\]/.test(constantsSrc),
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
  destinyPromptSrc.includes('开局即可表现的能力倾向、感知方式、操作偏好、异常现象或限制')
    && destinyPromptSrc.includes('能力来源、形成过程、过去经历和既定身份必须留白'),
  'destiny prompt must require present traits while leaving biography open',
)
assertOk(destinyPromptSrc.includes('顶层含“天赋”'), 'destiny prompt must match the Chinese object contract')
assertOk(
  /DESTINY_PATTERN_PROMPT_VERSION\s*=\s*'8\.5\.0'/.test(destinyPromptSrc)
    && /DESTINY_PATTERN_PROMPT_VERSION/.test(destinyPromptSrc)
    && /buildDestinyPatternSystemPrompt/.test(destinyPromptSrc),
  'destiny prompt builder and cache version must share version 8.5.0',
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
    && destinyPromptSrc.includes('保留古典用词质感')
    && destinyPromptSrc.includes('比喻最多一处')
    && destinyPromptSrc.includes('普通级只提供局部、低强度、有限条件的开局优势'),
  'destiny prompt must keep direct classical wording and ordinary-tier boundaries',
)
assertOk(
  destinyPromptSrc.includes('幻想、虚幻、神秘、象征')
    && destinyPromptSrc.includes('输入事实封闭'),
  'destiny prompt must allow varied speculative themes without inventing missing facts',
)
const makeDestinyPattern = (index, category) => ({
  类别: category,
  名称: `命格${index}`,
  设定描述: `稳定成立且适应当前世界的命格特质${index}`,
  效果: `持续提供清楚可用的影响${index}`,
  属性加成: { 心智: 1 },
})
assertOk(destinyPatternOutputSchema.safeParse({ 命格: [makeDestinyPattern(0, '行动')] }).success, 'destiny transport schema must stay permissive')
const compatibleResponse = parseDestinyPatternAIResponse(JSON.stringify({ 命格: [
  { 类别: '认知', 名称: '踏野寻踪', 设定描述: '可识别痕迹。', 效果: '追踪更稳。', 属性加成: '心智+1，悟性+1，魅力-1' },
  { 类别: '认知', 名称: '过目不忘', 设定描述: '记忆清晰。', 效果: '回忆细节更准。', 属性加成: '心智+2' },
] }), 'cognition')
assertOk(compatibleResponse.length === 2 && compatibleResponse[0].attrBonus.mind === 1, 'destiny parser must recover string attribute bonuses')
const partialResponse = parseDestinyPatternAIResponse(JSON.stringify({ 命格: [
  { 类别: '行动', 名称: '铁壁磐石', 设定描述: '筋骨强健。', 效果: '承压更稳。', 属性加成: { 体魄: 2 } },
  { 类别: '行动', 名称: '坏项', 设定描述: '', 效果: '', 属性加成: '体魄+1' },
] }), 'action')
assertOk(partialResponse.length === 1 && partialResponse[0].name === '铁壁磐石', 'destiny parser must keep valid siblings when one item is unusable')
const numberedResponse = parseDestinyPatternAIResponse(JSON.stringify({
  第一条: { effect: '交流更稳。', attributes: '魅力+2，心智-1', title: '言简意明', type: 'expression', detail: '能迅速说清重点。' },
  第二条: { 属性加成: { 魅力: '1' }, 效果: '关系更易维持。', 名称: '守信重诺', 描述: '答应的事会认真完成。' },
}), 'expression')
assertOk(
  numberedResponse.length === 2
    && numberedResponse[0].name === '言简意明'
    && numberedResponse[1].category === 'expression',
  'destiny parser must recognize numbered object wrappers, aliases, missing assigned categories, and field disorder',
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
    && /rarity:\s*'common'/.test(destinySystemSrc),
  'destiny response parsing must enforce the locally assigned category and local common rarity',
)
assertOk(
  !/rarity:\s*z\./.test(destinyPromptSrc) && !/[“\"]稀有度[”\"]/.test(destinyPromptSrc),
  'destiny AI must not own the initial rarity decision',
)
assertOk(
  !destinyPromptSrc.includes('极性') && !destinySystemSrc.includes('polarity'),
  'destiny generation must not retain the retired polarity contract',
)
assertOk(!destinyPromptSrc.includes('resources:'), 'destiny output schema must reject the removed resources attribute')
assertOk(
  destinyPromptSrc.includes('体魄、心智、悟性、魅力或低概率出现的气运')
    && destinyPromptSrc.includes('Transport-only schema'),
  'destiny prompt must keep the shared attribute semantics without strict whole-response gating',
)
assertOk(
  !destinyPromptSrc.includes('systemModifiers')
    && !destinySystemSrc.includes('systemModifiers'),
  'destiny generation must not retain retired system modifiers',
)
assertOk(
  destinyPromptSrc.includes('作用方式和现实边界')
    && destinyPromptSrc.includes('只有确实存在时才补充条件、代价或限制')
    && destinyPromptSrc.includes('普通级只提供局部、低强度、有限条件的开局优势'),
  'conceptual rules and ordinary-tier semantics must match the current prompt contract',
)
assertOk(/叙事与模拟长期遵守的作用方式/.test(destinyPromptSrc), 'destiny effect must remain a narrative rule instead of only numeric modifiers')
assertOk(
  /version:\s*9/.test(characterStoreSrc)
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
  /BASE_ATTRIBUTE_KEYS\s*=\s*\['physique', 'mind', 'talentAptitude', 'charisma'\]/.test(characterMigrationSrc)
    && !/BASE_ATTRIBUTE_KEYS[^\n]*resources/.test(characterMigrationSrc),
  'character migration must keep exactly four base attributes',
)
assertOk(
  /sanitizeDestinyPatternState/.test(characterMigrationSrc) && /sanitizeAttrBonus/.test(characterMigrationSrc),
  'old character saves and destiny pools must remove retired attribute bonuses',
)
assertOk(/z\.object\(\{[\s\S]*name:[\s\S]*description:[\s\S]*effect:/.test(reincarnationPromptSrc), 'reincarnation promotion schema must require exactly name, description, and effect')
assertOk(
  /非数值概念规则/.test(reincarnationPromptSrc) && /持续生效/.test(reincarnationPromptSrc),
  'reincarnation promotion must remain a non-numeric conceptual rule',
)
assertOk(
  /promoteReincarnationTalent/.test(reincarnationAccessSrc) && /setReincarnationPromotionAIService/.test(reincarnationAccessSrc),
  'mod-character must expose a configurable reincarnation promotion entry',
)
assertOk(
  /selectedPattern:\s*\{[\s\S]{0,400}strengthenLevel:\s*input\.selectedPattern\.strengthenLevel/.test(reincarnationAccessSrc),
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
  /function dedupeDestinyPatterns[\s\S]{0,260}seenIds[\s\S]{0,180}seenIds\.has\(pattern\.id\)[\s\S]{0,180}seenIds\.add\(pattern\.id\)/.test(destinyValidationSrc)
    && /this\.currentPatterns = dedupeDestinyPatterns/.test(destinyPoolServiceSrc)
    && /countCategory\(category\)/.test(destinyPoolServiceSrc),
  'the AI authority must dedupe only repeated IDs while tracking each category independently',
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
  /const usableSaved = savedSlotsMatchMode \? saved : null/.test(talentDrawPageSrc),
  'an incompatible saved selection must not fall through into the selecting phase',
)
assertOk(
  /type TalentDrawPhase = 'idle' \| 'generating' \| 'ready' \| 'selecting'/.test(talentDrawPageSrc),
  'destiny draw must keep an explicit non-persisted handoff state after the five-category first batch is ready',
)
assertOk(
  /const completeFullDraw = useCallback\(\(patterns: DestinyPattern\[\]\)/.test(talentDrawPageSrc)
    && /DESTINY_PATTERN_CATEGORY_ORDER\.every/.test(talentDrawPageSrc)
    && /setSlots\(revealSlotsInOrder\(visiblePatterns\)\)/.test(talentDrawPageSrc)
    && /completionTimerRef\.current = window\.setTimeout\([\s\S]{0,220}setPhase\('ready'\)/.test(talentDrawPageSrc),
  'AI destiny readiness must require usable candidates from all five categories before the handoff opens',
)
assertOk(
  /phase === 'ready'[\s\S]{0,1600}进入命格选择/.test(talentDrawPageSrc),
  'the completed destiny handoff must expose an explicit enter-selection action',
)
assertOk(
  /function uniquePatternsByIdentity[\s\S]{0,500}seenIds[\s\S]{0,240}seenIds\.has\(pattern\.id\)[\s\S]{0,160}seenIds\.add\(pattern\.id\)/.test(talentDrawPageSrc)
    && !talentDrawPageSrc.includes('seenNames')
    && !talentDrawPageSrc.includes('patternNameKey'),
  'the destiny draw must remove duplicate IDs without treating display names as identity',
)
assertOk(
  /const savedSlotsMatchMode[\s\S]{0,360}savedPatterns\.length >= DESTINY_PATTERN_DISPLAY_COUNT[\s\S]{0,260}uniquePatternsByIdentity\(savedPatterns\)\.length === savedPatterns\.length/.test(talentDrawPageSrc),
  'persisted selecting slots must not restore a repeated-ID set',
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
  /const visibleIds = new Set\([\s\S]{0,700}visibleIds\.has\(pattern\.id\)\) continue[\s\S]{0,300}visibleIds\.add\(pattern\.id\)/.test(talentDrawPageSrc)
    && !talentDrawPageSrc.includes('visibleNames')
    && !talentDrawPageSrc.includes('patternNameKey'),
  'destiny redraw must reject repeated IDs without filtering same-name candidates',
)
assertOk(
  /\.aura\s*\{[^}]*width:\s*calc\(220 \* var\(--final-flow-density-px\)\)/s.test(talentDrawCssSrc)
    && /\.seals\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s.test(talentDrawCssSrc)
    && /\.drawStageComplete \.aura\s*\{[^}]*top:\s*calc\(224 \* var\(--final-flow-density-px\)\)/s.test(talentDrawCssSrc)
    && /\.drawStageComplete \.sealWrap\s*\{[^}]*opacity:\s*0/s.test(talentDrawCssSrc)
    && /aria-label="五类首批命印"/.test(talentDrawPageSrc)
    && /DESTINY_PATTERN_CATEGORY_ORDER\.map/.test(talentDrawPageSrc)
    && /DESTINY_PATTERN_CATEGORY_CONFIG\[id\]\.label/.test(talentDrawPageSrc)
    && /\{ id: 'mythic', label: '轮回天赋' \}/.test(talentDrawPageSrc)
    && /resolvedLoadoutSlots\.map\(/.test(talentDrawPageSrc)
    && /selectedData\.length !== PATTERN_LOADOUT_SLOT_COUNT/.test(talentDrawPageSrc)
    && !/role="dialog"|TalentDrawMythicLibrary|useTalentDrawMythicLibrary/.test(talentDrawPageSrc)
    && !/TalentAstrolabe|astrolabe|fateNode/.test(talentDrawPageSrc)
    && !/progressTrack|progressFill/.test(talentDrawPageSrc),
  'the completed destiny handoff must keep the selected aura, five-category seals, six tabs, and four shared slots',
)

assertOk(
  !orchestratorSrc.includes('capturePreviewSnapshot')
    && !orchestratorSrc.includes('restorePreviewSnapshot')
    && !hooksSrc.includes('roundSnapshot')
    && !hooksSrc.includes('rollbackError'),
  'failed real rounds must never restore an earlier runtime snapshot',
)

assertOk(timeScaleSrc.includes('年度故事弧线视角'), 'year step must use connected annual scenes')
assertOk(
  timeScaleSrc.includes('从窗口内正在发生的行动、关系或世界变化进入场景')
    && timeScaleSrc.includes('日期、年龄与阶段名称在需要定位转折时自然出现')
    && !narrativePromptComponentsSrc.includes('日期、年龄与阶段名称'),
  'time-scale guidance must own scene entry and time-anchor placement',
)
assertOk(
  timeScaleSrc.includes('十年人生转型视角')
    && timeScaleSrc.includes('半世纪历史视角')
    && narrativePromptComponentsSrc.includes('多个并列事项都要形成实际尝试'),
  'time guidance must own scale-specific distance while the fixed Prompt owns selected-action completion',
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
assertOk(
  narrativePromptComponentsSrc.includes('实质互斥的玩家选择')
    && narrativePromptComponentsSrc.includes('不同选择会改变后续走向'),
  'branch prompt must require a blocking choice with materially different futures',
)
assertOk(/version:\s*'7\.3\.0'/.test(narrativePromptSrc), 'pure narrative contract must use version 7.3.0')
assertOk(
  narrativeSignalsSrc.includes('metadata.semanticSignals?.irreversible !== true')
    && narrativeSignalsSrc.includes("metadata.semanticSignals.narrativeRegister !== 'fate'"),
  'branch eligibility must require an irreversible fate or legacy semantic signal',
)
assertOk(
  narrativePromptComponentsSrc.includes('默认以第二人称‘你’作为当前角色的叙事主语')
    && narrativePromptComponentsSrc.includes('本轮引导提供称呼方式，则以该动态称呼方式为准')
    && narrativePromptComponentsSrc.includes('不得伪造证据、身份、秘密答案、过去言行或后续结果'),
  'narrative prompt must preserve the approved second-person and fact-boundary rules',
)
assertOk(
  timeScaleSrc.includes('从窗口内正在发生的行动、关系或世界变化进入场景')
    && promptBuilderSrc.includes('保留古典用词质感，但使用略微白话、直接易读的句式')
    && promptBuilderSrc.includes('以具体动作、工具、材料、身体限制、关系反应和可追踪因果推进'),
  'time-scale entry and the approved dynamic narrative style must remain live',
)
assertOk(
  narrativePromptComponentsSrc.includes('同一主场景、同一主关系或同一反复动作')
    && narrativePromptComponentsSrc.includes('最近两轮未体现的天赋')
    && timeScaleSrc.includes('不能只换时间继续复述'),
  '01 must rotate repeated story focus and give naturally relevant underused talents room to act',
)
assertOk(
  talentGrowthPromptSrc.includes('程序筛选')
    && talentGrowthPromptSrc.includes('多天赋'),
  '03 must prefer other eligible talents without inventing growth evidence',
)
assertOk(
  promptBuilderSrc.includes('世界: world')
    && promptBuilderSrc.includes('历史剧情: context.timelineMemory ?? []')
    && promptBuilderSrc.includes('最近两轮详细剧情: context.recentDetailedStories ?? []')
    && promptBuilderSrc.includes('角色: character')
    && promptBuilderSrc.includes('天赋: context.talents ?? []')
    && promptBuilderSrc.includes('本轮引导: roundGuidance')
    && promptBuilderSrc.includes('当前到期事件')
    && /userSegments:\s*\[globalSegment,\s*memorySegment,\s*roundSegment\]/u.test(promptBuilderSrc)
    && !/(文明阶段|当前区域|当前可叙述状态)/u.test(promptBuilderSrc),
  '01 input assembly must keep the approved field whitelist and three-message order',
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
  !narrativeHintsSrc.includes('INFORMATION_PRIORITY_RULE')
    && !orchestratorSrc.includes('opening-information-priority'),
  'the retired attribute-over-background opening priority must not be injected',
)
assertOk(timeScaleSrc.includes('3—5月春季、6—8月夏季、9—11月秋季、12—2月冬季'), 'dynamic time guidance must define the canonical solar season mapping')
assertOk(!/commit\.changes\.slice\(/.test(roundCommitBusSrc), 'round commit must never partially truncate structured changes')
assertOk(
  roundCommitBusSrc.includes("export type RoundCommitSource = 'manual'")
    && !roundCommitBusSrc.includes("'background'"),
  'round commit must expose only local manual writes after AI state writers are removed',
)
assertOk(timelineTsxSrc.includes('splitNarrativeParagraphs(entry.text)'), 'timeline must render every natural narrative paragraph')
assertOk(!timelineTsxSrc.includes('streamingText'), 'timeline must render only fully committed narrative entries')
assertOk(
  promptContextRuntimeSrc.includes('function projectPowerFramework')
    && promptContextRuntimeSrc.includes('powerFramework: projectPowerFramework(')
    && promptContextRuntimeSrc.includes('config.powerFramework as PowerFrameworkDefinition'),
  '01 world projection must read the current world-owned power framework',
)
assertOk(!promptContextRuntimeSrc.includes("split('。')[0]"), '01 power projection must preserve complete rank descriptions')
assertOk(
  promptContextRuntimeSrc.includes('if (!framework) return undefined')
    && promptContextRuntimeSrc.includes('未启用独立超常力量框架')
    && promptContextRuntimeSrc.includes('能力、技术与特殊现象只能来自世界描述中已经成立的事实')
    && promptContextRuntimeSrc.includes('config.powerFramework as PowerFrameworkDefinition'),
  'non-supernatural worlds must project an explicit power boundary into the 01 world message',
)
assertOk(
  calendarContextSrc.includes('buildFestivalNarrativeHint')
    && calendarContextSrc.includes('festivalScope'),
  'time-system must expose the unified calendar and festival adapter',
)

assertOk(!timelineCssSrc.includes('.entryLatest'), 'latest narrative must not have a special background rule')
assertOk(!timelineTsxSrc.includes('styles.entryLatest'), 'latest narrative must not receive a special style class')

if (failed === 0) {
  console.log('PASS: playtest-quality-regression')
  process.exit(0)
}

process.exit(1)
