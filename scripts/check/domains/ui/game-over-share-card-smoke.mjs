/**
 * Purpose: Regress game-over share facts, local rendering, system sharing, and PNG download behavior.
 * Owner: quality:ui
 * Responsibility: One local share-card contract and source-projection assertion lifecycle only.
 */

import { readFile } from 'node:fs/promises'

const {
  buildGameOverShareFacts,
  buildGameOverShareFileName,
  buildGameOverShareText,
  getStrongestShareDimension,
} = await import('../../../../src/mods/mod-pages/pages/game-over/game-over-share-card.ts')
const {
  buildGameOverAchievements,
  getReincarnationStrengthTier,
  selectFeaturedAchievement,
} = await import('../../../../src/mods/mod-pages/pages/game-over/game-over-scoring.ts')
const { createLifeScoringResult } = await import('../../../../src/core/scoring/life-scoring.ts')
const { decideReincarnationPromotion } = await import('../../../../src/mods/mod-character/reincarnation-talent-access.ts')

let failed = 0
function assertOk(condition, message) {
  if (condition) return
  failed++
  console.error(`FAIL: ${message}`)
}

const longWorldName = '横跨群星与多重世界但仍保持完整名称的测试世界'
const longMythicName = '未被省略也不会在分享文案中被静默截断的轮回天赋'
const shareData = {
  lifeRunId: 'life-test_01',
  characterName: '沈砚',
  worldName: longWorldName,
  ageLabel: '18—87 岁',
  rounds: 69,
  overallScore: 78,
  achievementCount: 2,
  featuredAchievement: {
    title: '守住星港',
    detail: '选择了「留下来完成撤离」',
  },
  dimensions: [
    { label: '体魄', value: 72, comment: '出众' },
    { label: '心智', value: 86, comment: '卓越' },
    { label: '财富', value: 86, comment: '卓越' },
    { label: '魅力', value: 64, comment: '出众' },
    { label: '回响', value: 82, comment: '清晰' },
  ],
  reincarnation: {
    name: longMythicName,
    description: '承诺',
    effect: '真心承担过的承诺，会在后来者的选择中留下回声。',
  },
  shareUrl: 'https://ai-mnrs.icu',
}

const strongest = getStrongestShareDimension(shareData.dimensions)
assertOk(strongest?.label === '心智', 'equal strongest dimensions must keep deterministic source order')

const facts = buildGameOverShareFacts(shareData)
assertOk(facts.length === 5, 'share preview must expose score-independent facts and structured achievements')
assertOk(facts.some((fact) => fact.value.includes('心智 86')), 'share facts must use the real strongest dimension')
assertOk(facts.some((fact) => fact.value === '69 轮世事'), 'share facts must use the real narrative round count')
assertOk(facts.some((fact) => fact.value === '2 项已确认大事'), 'share facts must include the structured achievement count')
assertOk(facts.some((fact) => fact.value.includes('守住星港')), 'share facts must include the featured structured achievement')

const shareText = buildGameOverShareText(shareData)
assertOk(shareText.includes(longWorldName), 'share text must preserve the complete world name')
assertOk(shareText.includes(longMythicName), 'share text must preserve the complete selected mythic name')
assertOk(shareText.includes('代表大事：守住星港'), 'share text must include the featured structured achievement')
assertOk(shareText.includes('https://ai-mnrs.icu'), 'share text must include the public project address when provided')

assertOk(
  buildGameOverShareFileName(shareData) === 'ai-life-sim-life-test_01.png',
  'share file name must use the stable technical life run ID rather than player prose',
)

const scoringNarrativeIds = Array.from({ length: 5 }, (_, index) => `round-${index + 1}`)
const scoringEvidenceIds = scoringNarrativeIds.map((id) => `narrative:${id}`)
const scoringAudit = {
  schemaVersion: 1,
  lifeRunId: 'life-score-meaningful',
  committedRounds: 5,
  narrativeIds: scoringNarrativeIds,
  resolvedChoiceCount: 1,
  achievementIds: ['choice-1'],
  completed: true,
  terminalCommitted: true,
  stateTransitionsTrusted: true,
  hasValidationFailure: false,
  transitionAudits: scoringNarrativeIds.map((narrativeId, index) => ({
    schemaVersion: 1,
    round: index + 1,
    narrativeId,
    validatedWritePath: true,
    interceptorPassed: true,
    intentValidationPassed: true,
    historicalCommitPassed: true,
    structuredDataPresent: true,
    structuredDataAccepted: true,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    trusted: true,
    validationClean: true,
    reasons: [],
  })),
}
const dimensionValues = [80, 82, 84, 86, 88]
const scoreResponse = {
  dimensions: dimensionValues.map((value, index) => ({
    id: `dimension-${index + 1}`,
    label: `维度${index + 1}`,
    description: `当前世界中的第${index + 1}项人生衡量`,
    value,
    comment: `你在第${index + 1}项维度留下了可追溯的经历。`,
    evidenceIds: [scoringEvidenceIds[index]],
  })),
}
const meaningfulScore = createLifeScoringResult({
  response: scoreResponse,
  allowedEvidenceIds: scoringEvidenceIds,
  audit: scoringAudit,
})
assertOk(meaningfulScore.score === 84, 'final score must be the rounded arithmetic mean of exactly five AI dimensions')
assertOk(meaningfulScore.integrity.passed, 'complete five-dimension evidence must pass structural integrity')
const invalidScore = createLifeScoringResult({
  response: scoreResponse,
  allowedEvidenceIds: scoringEvidenceIds,
  audit: { ...scoringAudit, committedRounds: 1 },
})
assertOk(invalidScore.score === 84 && !invalidScore.integrity.passed, 'audit failure must stay separate from the AI dimension values')
let rejectedFourDimensions = false
try {
  createLifeScoringResult({
    response: { dimensions: scoreResponse.dimensions.slice(0, 4) },
    allowedEvidenceIds: scoringEvidenceIds,
    audit: scoringAudit,
  })
} catch {
  rejectedFourDimensions = true
}
assertOk(rejectedFourDimensions, 'settlement scoring must require exactly five dimensions')
assertOk(getReincarnationStrengthTier(79).id === 'echo', 'scores below 80 must use the echo tier')
assertOk(getReincarnationStrengthTier(80).id === 'deep', 'score 80 must enter the deep tier')
assertOk(getReincarnationStrengthTier(90).id === 'legacy', 'score 90 must enter the legacy tier')
assertOk(getReincarnationStrengthTier(95).id === 'immortal', 'score 95 must enter the immortal tier')

const mythicSource = {
  lineageId: 'mythic:test',
  version: 6,
  name: '命运之书',
  description: '记录已经发生的命运。',
  effect: '可在明确代价下调整一次既定结果。',
  category: 'perception',
  rarity: 'mythic',
  attrBonus: { mind: 8, familyBackground: 7, luck: 3 },
  strengthenLevel: 5,
}
const firstFailure = decideReincarnationPromotion(mythicSource, () => 0)
assertOk(
  !firstFailure.success
    && firstFailure.attemptedStrengthenLevel === 6
    && firstFailure.resultingStrengthenLevel === 4
    && firstFailure.failureRate === 10
    && firstFailure.mutationSeverity === '轻微异变'
    && firstFailure.attributeCap === 22,
  'mythic +5 to +6 failure must retreat one level from the pre-attempt level and apply the resulting attribute cap',
)
const secondFailure = decideReincarnationPromotion({ ...mythicSource, strengthenLevel: 6 }, () => 0)
assertOk(
  secondFailure.attemptedStrengthenLevel === 7
    && secondFailure.resultingStrengthenLevel === 5
    && secondFailure.failureRate === 20,
  'mythic +6 to +7 failure must retreat to +5 rather than +4',
)
const cappedFailure = decideReincarnationPromotion({ ...mythicSource, strengthenLevel: 12 }, () => 0)
assertOk(cappedFailure.failureRate === 50 && cappedFailure.mutationSeverity === '彻底重组', 'mythic failure rate must remain capped at 50 percent')

const achievements = buildGameOverAchievements([
  {
    id: 'round-7',
    branchTitle: '星港抉择',
    resolvedChoice: '留下来完成撤离',
    displayTimeLabel: '群星历 77 年',
  },
  { id: 'round-8', branchTitle: '只有标题，不算已完成选择' },
 ])
assertOk(achievements.length === 1, 'achievements must come only from resolved choices')
assertOk(selectFeaturedAchievement(achievements)?.kind === 'choice', 'the resolved choice must be featured deterministically')

const helperSource = await readFile(
  new URL('../../../../src/mods/mod-pages/pages/game-over/game-over-share-card.ts', import.meta.url),
  'utf8',
)
const scoringSource = await readFile(
  new URL('../../../../src/mods/mod-pages/pages/game-over/game-over-scoring.ts', import.meta.url),
  'utf8',
)
const talentCssSource = await readFile(
  new URL('../../../../src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css', import.meta.url),
  'utf8',
)
const promptSource = await readFile(
  new URL('../../../../src/mods/mod-character/prompts/reincarnation-promotion-prompt.ts', import.meta.url),
  'utf8',
)
const promptAccessSource = await readFile(
  new URL('../../../../src/mods/mod-character/reincarnation-talent-access.ts', import.meta.url),
  'utf8',
)
assertOk(!helperSource.includes('narrativeHistory'), 'share renderer must not ingest complete story history')
assertOk(!helperSource.includes('compressedSummaries'), 'share renderer must not ingest compressed story content')
assertOk(!helperSource.includes('apiKey'), 'share renderer must not ingest API credentials')
assertOk(!helperSource.includes('fetch('), 'share rendering must remain local and must not upload the card')
assertOk(
  helperSource.includes("const file = typeof File === 'function'")
    && helperSource.includes('if (normalizedValue > 0)'),
  'share rendering must preserve no-File fallback and must not draw a false positive bar for zero values',
)
assertOk(!scoringSource.includes('calculateGameOverScore'), 'the page helper must not retain a second score calculation owner')
assertOk(!talentCssSource.includes('-webkit-line-clamp'), 'talent detail text must not be hidden by line clamping')
assertOk(
  promptSource.includes("version: '2.1.0'")
    && promptAccessSource.includes('endingScore: input.endingScore')
    && promptAccessSource.includes('reincarnationStrengthTier: input.strengthTier')
    && promptAccessSource.includes('promotionDecision: input.promotionDecision'),
  'reincarnation generation Prompt must receive the score, strength tier, and program-decided promotion result',
)
assertOk(
  helperSource.includes('await navigator.share({')
    && helperSource.includes('downloadShareCard(blob, fileName)'),
  'share flow must use Web Share when available and keep a PNG download fallback',
)

if (failed > 0) process.exit(1)
console.log('PASS: game-over-share-card-smoke')
