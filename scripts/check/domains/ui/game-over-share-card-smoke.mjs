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

let failed = 0
function assertOk(condition, message) {
  if (condition) return
  failed++
  console.error(`FAIL: ${message}`)
}

const longWorldName = '横跨群星与多重世界但仍保持完整名称的测试世界'
const longMythicName = '未被省略也不会在分享文案中被静默截断的神话余响'
const shareData = {
  lifeRunId: 'life-test_01',
  characterName: '沈砚',
  worldName: longWorldName,
  ageLabel: '18—87 岁',
  rounds: 69,
  moralityLabel: '善良',
  overallScore: 78,
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
assertOk(facts.length === 4, 'share preview must expose the four approved structured fact groups')
assertOk(facts.some((fact) => fact.value.includes('心智 86')), 'share facts must use the real strongest dimension')
assertOk(facts.some((fact) => fact.value === '69 轮世事'), 'share facts must use the real narrative round count')

const shareText = buildGameOverShareText(shareData)
assertOk(shareText.includes(longWorldName), 'share text must preserve the complete world name')
assertOk(shareText.includes(longMythicName), 'share text must preserve the complete selected mythic name')
assertOk(shareText.includes('https://ai-mnrs.icu'), 'share text must include the public project address when provided')

assertOk(
  buildGameOverShareFileName(shareData) === 'ai-life-sim-life-test_01.png',
  'share file name must use the stable technical life run ID rather than player prose',
)

const helperSource = await readFile(
  new URL('../../../../src/mods/mod-pages/pages/game-over/game-over-share-card.ts', import.meta.url),
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
assertOk(
  helperSource.includes('await navigator.share({')
    && helperSource.includes('downloadShareCard(blob, fileName)'),
  'share flow must use Web Share when available and keep a PNG download fallback',
)

if (failed > 0) process.exit(1)
console.log('PASS: game-over-share-card-smoke')
