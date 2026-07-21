/**
 * 结算分享卡：只使用真实结算事实、本机生成、系统分享与 PNG 降级回归。
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
  calculateGameOverScore,
  getReincarnationStrengthTier,
  normalizeAchievementScore,
  selectFeaturedAchievement,
} = await import('../../../../src/mods/mod-pages/pages/game-over/game-over-scoring.ts')

let failed = 0
function assertOk(condition, message) {
  if (condition) return
  failed++
  console.error(`FAIL: ${message}`)
}

const longWorldName = '横跨群星与多重世界但仍保持完整名称的测试世界'
const longMythicName = '未被省略也不会在分享文案中被静默截断的转世天赋'
const shareData = {
  lifeRunId: 'life-test_01',
  characterName: '沈砚',
  worldName: longWorldName,
  ageLabel: '18—87 岁',
  rounds: 69,
  moralityLabel: '善良',
  overallScore: 78,
  achievementCount: 2,
  featuredAchievement: {
    title: '守住星港',
    detail: '选择了「留下来完成撤离」',
  },
  dimensions: [
    { label: '体魄', value: 72, comment: '出众' },
    { label: '心智', value: 86, comment: '卓越' },
    { label: '悟性', value: 86, comment: '卓越' },
    { label: '魅力', value: 64, comment: '出众' },
  ],
  mythic: {
    name: longMythicName,
    concept: '承诺',
    effect: '真心承担过的承诺，会在后来者的选择中留下回声。',
  },
  shareUrl: 'https://ai-mnrs.icu',
}

const strongest = getStrongestShareDimension(shareData.dimensions)
assertOk(strongest?.label === '心智', 'equal strongest dimensions must keep deterministic source order')

const facts = buildGameOverShareFacts(shareData)
assertOk(facts.length === 6, 'share preview must expose score-independent facts and structured achievements')
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

assertOk(normalizeAchievementScore(94.9) === 94, 'boosted scores below raw 95 must remain below 95')
assertOk(normalizeAchievementScore(95) === 95, 'raw score 95 must remain unchanged')
assertOk(normalizeAchievementScore(98.4) === 98, 'raw scores above 95 must use normal rounding')

const meaningfulScore = calculateGameOverScore({
  dimensionValues: [30, 30, 30, 30],
  rounds: 12,
  resolvedChoiceCount: 1,
  breakthroughCount: 0,
  completed: true,
})
assertOk(meaningfulScore.score >= 80, 'a meaningful completed run must commonly clear 80')
assertOk(getReincarnationStrengthTier(79).id === 'echo', 'scores below 80 must use the echo tier')
assertOk(getReincarnationStrengthTier(80).id === 'deep', 'score 80 must enter the deep tier')
assertOk(getReincarnationStrengthTier(90).id === 'legacy', 'score 90 must enter the legacy tier')
assertOk(getReincarnationStrengthTier(95).id === 'immortal', 'score 95 must enter the immortal tier')

const achievements = buildGameOverAchievements([
  {
    id: 'round-7',
    branchTitle: '星港抉择',
    resolvedChoice: '留下来完成撤离',
    displayTimeLabel: '群星历 77 年',
  },
  { id: 'round-8', branchTitle: '只有标题，不算已完成选择' },
], [{
  pathway: '星海之躯',
  year: 42,
  yearsGained: 20,
  description: '跨越生命边界',
}])
assertOk(achievements.length === 2, 'achievements must come only from resolved choices and structured breakthroughs')
assertOk(selectFeaturedAchievement(achievements)?.kind === 'breakthrough', 'the strongest structured event must be featured deterministically')

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
  new URL('../../../../src/mods/mod-character/prompts/mythic-pattern-prompt.ts', import.meta.url),
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
assertOk(scoringSource.includes('raw >= 95'), 'the normal-score threshold must remain explicit and testable')
assertOk(!talentCssSource.includes('-webkit-line-clamp'), 'talent detail text must not be hidden by line clamping')
assertOk(
  promptSource.includes("version: '1.2.0'")
    && promptSource.includes('endingScore')
    && promptSource.includes('reincarnationStrengthTier'),
  'reincarnation generation Prompt must receive the deterministic score and strength tier',
)
assertOk(
  helperSource.includes('await navigator.share({')
    && helperSource.includes('downloadShareCard(blob, fileName)'),
  'share flow must use Web Share when available and keep a PNG download fallback',
)

if (failed > 0) process.exit(1)
console.log('PASS: game-over-share-card-smoke')
