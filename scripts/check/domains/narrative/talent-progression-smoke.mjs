/**
 * Purpose: Regress nine aptitude tiers, development gates, and apex reincarnation outcomes.
 * Owner: quality:narrative
 * Responsibility: Deterministic talent rules and Prompt contracts; no network calls.
 */

import assert from 'node:assert/strict'
import { DESTINY_PATTERN_APTITUDE_CONFIG, PRESET_DESTINY_PATTERNS } from '../../../../src/mods/mod-character/constants.ts'
import { createPendingDestinyPatternGrowth, validateDestinyPatternAttrBonusForAptitude } from '../../../../src/mods/mod-character/destiny-pattern-growth.ts'
import { decideReincarnationPromotion, createPromotedReincarnationTalent } from '../../../../src/mods/mod-character/reincarnation-talent-access.ts'
import { DestinyPatternSystem } from '../../../../src/mods/mod-character/subsystems/destiny-pattern-system.ts'
import { parseDestinyPatternAIResponse } from '../../../../src/mods/mod-character/subsystems/destiny-pattern-system/validation.ts'
import { buildNarrativeTalentGrowthPromptInput } from '../../../../src/mods/mod-engine/helpers/narrative-talent-growth-context.ts'
import { COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts'
import { ReincarnationTalentSchema } from '../../../../src/core/account/account-contract.ts'

assert.deepEqual(Object.values(DESTINY_PATTERN_APTITUDE_CONFIG).map((entry) => entry.label), ['普通', '良好', '优秀', '卓越', '史诗', '传说', '神话', '本源', '至高'])
const source = {
  id: 'source', lineageId: 'lineage', version: 1, name: '折光留影', category: 'control',
  aptitudeTier: 2, developmentStage: 'awakening', description: '迈步时身后多留一道影子。',
  effect: '在有光时可留下短暂残影，不能替代实体。', attrBonus: { mind: 1 }, apexStrengthenLevel: 0,
}
const directions = ['深度强化', '广度强化', '转变强化'].map((route, index) => ({
  route, name: ['分光留影', '映光成幕', '移影换形'][index], description: '迈步时旧影留在原地，追踪的目光被短暂引向另一处，身体仍须自行脱离险地。',
  effect: '保留有光时留下残影的能力，并改善其控制；不能替代实体。', attrBonus: { mind: 1 },
}))
const promotedContent = { name: '分光留影', description: '影子展开。', effect: '保留原有残影，新增控制分支。', attrBonus: {} }
for (let tier = 1; tier <= 9; tier++) {
  assert.equal(validateDestinyPatternAttrBonusForAptitude({ mind: tier * 2 }, tier), true)
  assert.equal(validateDestinyPatternAttrBonusForAptitude({ mind: tier * 2 + 1 }, tier), false)
  assert.equal(validateDestinyPatternAttrBonusForAptitude({ mind: tier * 4, physique: -tier * 2 }, tier), true)
  assert.equal(validateDestinyPatternAttrBonusForAptitude({ mind: 1, physique: -(tier * 2 + 1) }, tier), false)
  assert.equal(validateDestinyPatternAttrBonusForAptitude({}, tier), true)
  const current = { ...source, aptitudeTier: tier }
  const pending = createPendingDestinyPatternGrowth({ narrativeId: `tier-${tier}`, roundSequence: 1, source: current, directions })
  assert(pending.options.every((option) => option.pattern.aptitudeTier === tier && option.pattern.developmentStage === 'mastery'))
  const complete = createPendingDestinyPatternGrowth({ narrativeId: `complete-${tier}`, roundSequence: 22, source: pending.options[0].pattern, directions })
  assert(complete.options.every((option) => option.pattern.developmentStage === 'complete'))
  assert.throws(() => createPendingDestinyPatternGrowth({ narrativeId: 'over', roundSequence: 50, source: complete.options[0].pattern, directions }), /圆满/)
  const decision = decideReincarnationPromotion(current, () => 0.99)
  const promoted = createPromotedReincarnationTalent(current, promotedContent, decision, { worldName: '世界', characterName: '角色' }, 1)
  assert.equal(promoted.aptitudeTier, Math.min(9, tier + 1))
  assert.equal(promoted.developmentStage, 'awakening')
  assert.equal(promoted.apexStrengthenLevel, tier === 9 ? 1 : 0)
  assert.equal(ReincarnationTalentSchema.safeParse(promoted).success, true)
}
for (const invalid of [{ mind: 0 }, { mind: NaN }, { mind: '1' }, { mind: 0.5 }, { removed: 1 }]) {
  assert.equal(validateDestinyPatternAttrBonusForAptitude(invalid, 2), false)
}
assert.equal(validateDestinyPatternAttrBonusForAptitude({}, 10), false)
for (const preset of PRESET_DESTINY_PATTERNS) {
  assert(preset.aptitudeTier >= 1 && preset.aptitudeTier <= 3)
  assert.equal(preset.developmentStage, 'awakening')
  assert(validateDestinyPatternAttrBonusForAptitude(preset.attrBonus, preset.aptitudeTier))
}
const system = new DestinyPatternSystem()
assert.equal(system.generateFromAI(Array.from({ length: 9 }, (_, index) => ({
  ...source, name: `候选${index}`, effects: source.effect, aptitudeTier: index + 1,
}))).length, 3)
const item = { 类别: 'control', 名称: '折光留影', 简介: '影子展开。', 资质阶位: 2, 开发阶段: '初醒', 效果: '短暂残影。', 属性加成: {} }
assert.equal(parseDestinyPatternAIResponse(JSON.stringify({ 天赋: [item, { ...item, 类别: 'battle' }, { ...item, 稀有度: '普通' }] })).length, 1)

const evidence = (count) => Array.from({ length: count }, (_, index) => ({
  lineageId: source.lineageId, sourceRound: 22 + index, usage: '在灯光下留下残影引开追踪。',
  result: '残影使追踪者判断失误并成功脱身。', ...(index === count - 1 ? { breakthrough: '紧急脱身中发现了新的操控方式。' } : {}),
}))
const baseInput = {
  patterns: [source], compressedSummaries: { summaries: [] }, recentStories: [], currentRound: 24,
  currentAge: 40, totalBasePoints: 40001, growthHistory: [], growthEvidence: evidence(2),
}
const eligible = (overrides = {}) => buildNarrativeTalentGrowthPromptInput({ ...baseInput, ...overrides }).eligiblePatterns.length
assert.equal(eligible(), 1)
assert.equal(eligible({ currentAge: 15 }), 0)
assert.equal(eligible({ currentAge: 16 }), 1)
assert.equal(eligible({ growthEvidence: evidence(1) }), 0)
assert.equal(eligible({ growthEvidence: evidence(2).map(({ breakthrough: _, ...entry }) => entry) }), 1)
assert.equal(eligible({ growthEvidence: evidence(2).map((entry) => ({ ...entry, sourceRound: 30 })) }), 0)
assert.equal(eligible({ growthAssessments: [{ lineageId: source.lineageId, evaluatedBreakthroughRound: 23, evaluatedThroughRound: 23 }] }), 0)
const mastered = { ...source, version: 2, developmentStage: 'mastery' }
const history = { lineageId: source.lineageId, roundSequence: 4, totalBasePoints: 20000, source, result: mastered }
assert.equal(eligible({ patterns: [mastered], growthHistory: [history] }), 0)
assert.equal(eligible({ patterns: [mastered], growthHistory: [history], growthEvidence: evidence(3) }), 1)
assert.equal(eligible({ patterns: [mastered], growthHistory: [history], growthEvidence: evidence(3), currentRound: 23 }), 0)
assert.equal(eligible({ patterns: [mastered], growthHistory: [history], growthEvidence: evidence(3), totalBasePoints: 40000 }), 0)
assert.equal(eligible({ growthHistory: [history, history] }), 0)
assert.equal(eligible({ growthHistory: Array.from({ length: 6 }, (_, index) => ({ ...history, lineageId: `other-${index}` })) }), 0)
assert.equal(eligible({ patterns: [{ ...source, developmentStage: 'complete' }] }), 0)
const rules = JSON.parse(COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT)
assert(rules.局内成长边界.证据窗口.includes('稳定成功'))
assert(rules.局内成长边界.证据窗口.includes('重要挑战'))
assert(rules.资质与开发边界.能力连续性.includes('不得削弱'))
for (const [level, failureRate, severity] of [[5, 10, '轻微异变'], [6, 20, '局部异变'], [7, 30, '明显异变'], [8, 40, '重大异变'], [9, 50, '彻底重组'], [20, 50, '彻底重组']]) {
  const apex = { ...source, aptitudeTier: 9, apexStrengthenLevel: level }
  const failure = decideReincarnationPromotion(apex, () => 0)
  assert.equal(failure.failureRate, failureRate)
  assert.equal(failure.success, false)
  assert.equal(failure.resultingApexStrengthenLevel, level - 1)
  assert.equal(failure.mutationSeverity, severity)
  assert.equal(failure.attributeCap, 18)
  const success = decideReincarnationPromotion(apex, () => 0.99)
  assert.equal(success.success, true)
  assert.equal(success.resultingApexStrengthenLevel, level + 1)
}
console.log('[talent-progression] PASS nine-tiers draw-1-3 stages windows-2-3 age cooldown counts apex-mutations caps')
