#!/usr/bin/env node

import assert from 'node:assert/strict'

import { isAiCredentialError } from '../../../../src/core/ai-service/ai-client.ts'
import { DestinyPatternSystem } from '../../../../src/mods/mod-character/subsystems/destiny-pattern-system.ts'

assert.equal(isAiCredentialError({ status: 401 }), true, '401 must be classified as a credential-terminal error')
assert.equal(isAiCredentialError({ status: 403 }), true, '403 must be classified as a credential-terminal error')
assert.equal(isAiCredentialError({ status: 429 }), false, '429 remains a transient retry case')

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
  'credential failure must leave the generation loop as a terminal error',
)

assert.ok(requestCount >= 1, 'the first-screen generation must attempt at least one request')
assert.ok(requestCount <= 3, `401 must stop after already-started first-screen concurrency, received ${requestCount} requests`)
assert.equal(system.getPoolFillStatus().inProgress, false, 'terminal credential failure must clear the pool-fill lifecycle')

console.log(`[destiny-credential-terminal] PASS requests=${requestCount}`)
