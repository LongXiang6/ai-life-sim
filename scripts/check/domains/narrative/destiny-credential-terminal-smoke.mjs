#!/usr/bin/env node
/**
 * Purpose: Verify four-way destiny credential failures remain terminal without retries.
 * Owner: quality:narrative
 * Responsibility: Regression assertions only; it never changes runtime state.
 */

import assert from 'node:assert/strict'

import { isAiCredentialError } from '../../../../src/core/ai-service/ai-client.ts'
import {
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
} from '../../../../src/mods/mod-character/constants.ts'
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

assert.equal(requestCount, 4, 'credential failure must finish the four independent initial category requests without retries')
assert.equal(system.getPoolFillStatus().inProgress, false, 'terminal credential failure must clear the pool-fill lifecycle')

const context = {
  worldConfig: null,
  calibration: null,
  worldTags: undefined,
  character: { name: '模拟玩家', startingAge: 18 },
  existingNames: [],
}
const categoryLabels = {
  battle: '战斗',
  exploration: '探索',
  social: '社交',
  production: '生产',
}
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
  return JSON.stringify({
    命格: Array.from({ length: 4 }, (_, itemIndex) => ({
      类别: label,
      名称: `${label}命格${callIndex}-${itemIndex + 1}`,
      设定描述: `${label}方向的普通命格设定${callIndex}-${itemIndex + 1}。`,
      效果: `${label}方向的长期叙事作用${callIndex}-${itemIndex + 1}。`,
      属性加成: itemIndex === 0 ? '心智+1，悟性+1，魅力-1' : { 体魄: 1 },
    })),
  })
})

const initialPatterns = await generationSystem.generateWithAI(context)
assert.equal(generationRequestCount, 4, 'fresh initial generation must make exactly four category calls')
assert.equal(initialPatterns.length, 16, 'fresh initial generation must publish four candidates per category')
assert.equal(generationSystem.getPoolFillStatus().initialReady, true, 'all four initial categories must publish the selection handoff')
assert.equal(initialPatterns[0]?.attrBonus.mind, 1, 'string attribute bonuses must remain usable in the live generation path')

const fullPool = await generationSystem.startBackgroundFill(context, initialPatterns)
assert.equal(generationRequestCount, 12, 'fresh full pool must use four initial calls plus eight background calls')
assert.equal(fullPool.length, 48, 'background filling must finish with twelve candidates in each of four categories')
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
assert.equal(restoredSystem.getPoolFillStatus().initialReady, true, 'cached four-category candidates must restore the selection handoff')
assert.equal(restoredSystem.getCandidates().length, 16, 'cached hydration must restore the candidate pool without a second source')

console.log(`[destiny-credential-terminal] PASS credentialRequests=${requestCount} generationRequests=${generationRequestCount} initial=${initialPatterns.length} final=${fullPool.length}`)
