#!/usr/bin/env node
/**
 * Purpose: Verify five-way destiny credential failures remain terminal without retries.
 * Owner: quality:narrative
 * Responsibility: Regression assertions only; it never changes runtime state.
 */

import assert from 'node:assert/strict'

import { isAiCredentialError } from '../../../../src/core/ai-service/ai-client.ts'
import {
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
} from '../../../../src/mods/mod-character/constants.ts'
import {
  getDestinyPatternPoolCacheKey,
  loadDestinyPatternPool,
  saveDestinyPatternPool,
} from '../../../../src/mods/mod-character/utils/destiny-pattern-pool-cache.ts'
import { DestinyPatternSystem } from '../../../../src/mods/mod-character/subsystems/destiny-pattern-system.ts'

class MemoryStorage {
  constructor() { this.data = new Map() }
  get length() { return this.data.size }
  key(index) { return [...this.data.keys()][index] ?? null }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null }
  setItem(key, value) { this.data.set(String(key), String(value)) }
  removeItem(key) { this.data.delete(String(key)) }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })

assert.equal(isAiCredentialError({ status: 401 }), true, '401 must be classified as a credential-terminal error')
assert.equal(isAiCredentialError({ status: 403 }), true, '403 must be classified as a credential-terminal error')
assert.equal(isAiCredentialError({ status: 429 }), false, '429 must remain distinct from credential failure')

const system = new DestinyPatternSystem()
let requestCount = 0
system.setAIService(async () => {
  requestCount += 1
  throw Object.assign(new Error('unauthorized'), { status: 401 })
})

await assert.rejects(
  system.generateWithAI({
    worldConfig: null,
    calibration: null,
    worldTags: undefined,
    character: { name: '测试角色', startingAge: 18 },
    existingNames: [],
  }),
  (error) => isAiCredentialError(error),
  'credential failure must leave the single generation request as a terminal error',
)

assert.equal(requestCount, 5, 'credential failure must finish the five independent initial category requests without retries')
assert.equal(system.getPoolFillStatus().inProgress, false, 'terminal credential failure must clear the pool-fill lifecycle')

const context = {
  worldConfig: null,
  calibration: null,
  worldTags: undefined,
  character: { name: '模拟玩家', startingAge: 18 },
  existingNames: [],
}
const categoryLabels = {
  enhancement: '灵躯蜕变',
  control: '万象听令',
  perception: '洞察天机',
  summoning: '万灵随行',
  creation: '造化成形',
}
const variationWords = [
  '急停转身', '狭窄穿行', '长途负重', '水面平衡',
  '细节捕捉', '信息归档', '故障排查', '数量估算',
  '声调控制', '即兴逗趣', '预算拆分', '物品归类',
]
const generationSystem = new DestinyPatternSystem()
const categoryCallCounts = new Map(DESTINY_PATTERN_CATEGORY_ORDER.map((category) => [category, 0]))
let generationRequestCount = 0

generationSystem.setAIService(async (systemPrompt, userPrompt, options) => {
  const callKind = options?.logContext?.callKind ?? ''
  const category = DESTINY_PATTERN_CATEGORY_ORDER.find((candidate) => callKind.includes(`-${candidate}-`))
  assert.ok(category, `every destiny request must expose its assigned category in callKind: ${callKind}`)
  const callIndex = (categoryCallCounts.get(category) ?? 0) + 1
  categoryCallCounts.set(category, callIndex)
  generationRequestCount += 1

  const label = categoryLabels[category]
  assert.match(systemPrompt, new RegExp(label), 'system prompt must stay category-scoped')
  const userPayload = JSON.parse(userPrompt)
  assert.ok(
    !Object.hasOwn(userPayload, '生成方向') && !Object.hasOwn(userPayload, 'generationDirection'),
    'user prompt must not duplicate the system-owned category field',
  )
  if (callIndex > 1) {
    assert.ok(Array.isArray(userPayload.existingPatterns), 'supplement calls must receive same-category candidate summaries')
    assert.ok(
      userPayload.existingPatterns.every((pattern) => (
        typeof pattern.name === 'string'
        && typeof pattern.description === 'string'
        && typeof pattern.effect === 'string'
        && !Object.hasOwn(pattern, 'id')
        && !Object.hasOwn(pattern, 'lineageId')
      )),
      'candidate summaries must omit internal identity fields',
    )
  }
  const variationOffset = (callIndex - 1) * 4
  return JSON.stringify({
    天赋: Array.from({ length: 4 }, (_, itemIndex) => ({
      类别: category,
      名称: `${label}${variationWords[variationOffset + itemIndex]}倾向`,
      简介: `${label}在${variationWords[variationOffset + itemIndex]}方面保有普通熟练倾向。`,
      资质阶位: itemIndex % 3 + 1,
      开发阶段: '初醒',
      效果: `处理${variationWords[variationOffset + itemIndex]}时更容易保持稳定表现，适合日常情境。`,
      属性加成: itemIndex === 0 ? { 心智: 1, 财富: 1, 魅力: -1 } : { 体魄: 1 },
    })),
  })
})

const initialPatterns = await generationSystem.generateWithAI(context)
assert.equal(generationRequestCount, 5, 'fresh initial generation must make exactly five category calls')
assert.equal(initialPatterns.length, 20, 'fresh initial generation must publish four candidates per category')
assert.equal(generationSystem.getPoolFillStatus().initialReady, true, 'all five initial categories must publish the selection handoff')
assert.equal(initialPatterns[0]?.attrBonus.mind, 1, 'current numeric attributes must remain usable in the generation path')

const fullPool = await generationSystem.startBackgroundFill(context, initialPatterns)
assert.equal(generationRequestCount, 15, 'fresh full pool must use five initial calls plus ten background calls')
assert.equal(fullPool.length, 60, 'background filling must finish with twelve candidates in each of five categories')
for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
  assert.equal(categoryCallCounts.get(category), 3, `${category} must use one initial and two background calls`)
  assert.equal(
    fullPool.filter((pattern) => pattern.category === category).length,
    DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
    `${category} must stop at its twelve-candidate target`,
  )
}
assert.equal(generationSystem.getPoolFillStatus().inProgress, false, 'completed background filling must clear its lifecycle')

const restoredSystem = new DestinyPatternSystem()
restoredSystem.hydratePool(initialPatterns)
assert.equal(restoredSystem.getPoolFillStatus().initialReady, true, 'cached five-category candidates must restore the selection handoff')
assert.equal(restoredSystem.getCandidates().length, 20, 'cached hydration must restore the candidate pool without a second source')

const duplicateCacheFixture = [
  initialPatterns[0],
  { ...initialPatterns[0], id: 'ai-cache-duplicate-name', name: ` ${initialPatterns[0].name} ` },
]
saveDestinyPatternPool(2, duplicateCacheFixture)
const restoredCache = loadDestinyPatternPool(2)
assert.equal(restoredCache.length, 1, 'cache owner must canonicalize duplicate names on write and restore')
assert.equal(
  restoredCache[0]?.id,
  initialPatterns[0]?.id,
  'cache owner must preserve the first valid candidate for a canonical name',
)
localStorage.removeItem(`ai-life-sim:mod-character:cache:${getDestinyPatternPoolCacheKey(2)}`)

const sameContentSystem = new DestinyPatternSystem()
let sameContentRequestCount = 0
sameContentSystem.setAIService(async (_systemPrompt, _userPrompt, options) => {
  sameContentRequestCount += 1
  const callKind = options?.logContext?.callKind ?? ''
  const category = DESTINY_PATTERN_CATEGORY_ORDER.find((candidate) => callKind.includes(`-${candidate}-`))
  assert.ok(category, 'same-content fixture must resolve its assigned category')
  const label = categoryLabels[category]
  return JSON.stringify({
    天赋: [
      {
        类别: category,
        名称: `${label}同名倾向`,
        简介: `${label}方向完全相同的候选内容。`,
        资质阶位: 1, 开发阶段: '初醒',
        效果: `${label}方向完全相同的候选效果。`,
        属性加成: { 体魄: 1 },
      },
      {
        类别: category,
        名称: `${label}同名倾向`,
        简介: `${label}方向完全相同的候选内容（重复）。`,
        资质阶位: 1, 开发阶段: '初醒',
        效果: `${label}方向完全相同的候选效果（重复）。`,
        属性加成: { 体魄: 1 },
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        类别: category,
        名称: `${label}独立倾向${index + 1}`,
        简介: `${label}方向独立的候选内容${index + 1}。`,
        资质阶位: 1, 开发阶段: '初醒',
        效果: `${label}方向独立的候选效果${index + 1}。`,
        属性加成: { 体魄: 1 },
      })),
    ],
  })
})
const sameContentPatterns = await sameContentSystem.generateWithAI(context)
assert.equal(sameContentRequestCount, 5, 'same-content candidates must not trigger retries')
assert.equal(sameContentPatterns.length, 20, 'same-name candidates must retain one canonical name plus three unique names per category')
assert.equal(
  sameContentPatterns.filter((pattern) => pattern.name === '灵躯蜕变同名倾向').length,
  1,
  'same-name candidates must retain only the first candidate in each category',
)
assert.equal(sameContentSystem.getPoolFillStatus().initialReady, true, 'four structurally valid candidates per category must hand off')

const overflowSystem = new DestinyPatternSystem()
overflowSystem.setAIService(async (_systemPrompt, _userPrompt, options) => {
  const callKind = options?.logContext?.callKind ?? ''
  const category = DESTINY_PATTERN_CATEGORY_ORDER.find((candidate) => callKind.includes(`-${candidate}-`))
  assert.ok(category, 'overflow fixture must resolve its assigned category')
  const label = categoryLabels[category]
  return JSON.stringify({
    天赋: Array.from({ length: 5 }, (_, index) => ({
      类别: category,
      名称: `${label}额外候选${index + 1}`,
      简介: `${label}方向的第${index + 1}条额外候选。`,
      资质阶位: 1, 开发阶段: '初醒',
      效果: `${label}方向的第${index + 1}条额外效果。`,
      属性加成: {},
    })),
  })
})
const overflowPatterns = await overflowSystem.generateWithAI(context)
assert.equal(overflowPatterns.length, 25, 'initial responses above four items must not be truncated locally')

const injectedSystem = new DestinyPatternSystem()
const injected = injectedSystem.generateFromAI([
  {
    category: 'enhancement',
    aptitudeTier: 1, developmentStage: 'awakening',
    name: ' 手眼　协调 ',
    description: '处理细小物件时动作较稳。',
    effects: '日常操作中较少出现明显失误。',
  },
  {
    category: 'enhancement',
    aptitudeTier: 1, developmentStage: 'awakening',
    name: '手眼协调',
    description: '处理细小物件时动作较稳。',
    effects: '日常操作中较少出现明显失误。',
  },
])
assert.equal(injected.length, 1, 'public AI injection must retain only the first canonical name')

const pollutedHydrationSystem = new DestinyPatternSystem()
pollutedHydrationSystem.hydratePool([
  ...initialPatterns,
  {
    ...initialPatterns[0],
    id: 'ai-high-tier-wording',
    name: '长生不老',
    description: '身体不会衰老。',
    effect: '获得长生不老效果。',
  },
  {
    ...initialPatterns[0],
    id: 'ai-polluted-attributes',
    name: '过量加成',
    description: '日常处理事情时略有优势。',
    effect: '普通事务中表现更稳定。',
    attrBonus: { mind: 3 },
  },
  {
    ...initialPatterns[1],
    name: '重复身份但不同内容',
  },
])
assert.equal(
  pollutedHydrationSystem.getCandidates().some((pattern) => pattern.name === '长生不老'),
  true,
  'cache hydration must not judge or discard candidate wording',
)
assert.equal(
  pollutedHydrationSystem.getCandidates().some((pattern) => pattern.name === '过量加成'),
  false,
  'cache hydration must reject common candidates outside the ordinary attribute budget',
)
assert.equal(
  pollutedHydrationSystem.getCandidates().filter((pattern) => pattern.id === initialPatterns[1].id).length,
  1,
  'cache hydration must retain only one candidate for a duplicate persistent ID',
)

console.log(`[destiny-credential-terminal] PASS credentialRequests=${requestCount} generationRequests=${generationRequestCount} initial=${initialPatterns.length} final=${fullPool.length}`)
