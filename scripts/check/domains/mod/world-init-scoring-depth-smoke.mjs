import assert from 'node:assert/strict'

import { deepSanitize } from '../../../../src/mods/mod-engine/helpers/system-safety.ts'

const scoringState = {
  worldConfig: {
    scoringProfile: {
      dimensions: [
        { id: 'growth', evidenceKinds: ['attributes', 'lifespan-adjustments'] },
        { id: 'agency', evidenceKinds: ['choices'] },
        { id: 'journey', evidenceKinds: ['journey'] },
        { id: 'impact', evidenceKinds: ['achievements', 'choices', 'lifespan-adjustments'] },
      ],
    },
  },
}

const scoringResult = deepSanitize(scoringState, 'sub.world-init.data')
assert.equal(scoringResult.report.passed, true, 'world-init scoring profile must fit the safety depth budget')
assert.deepEqual(scoringResult.result, scoringState, 'sanitization must preserve valid scoring profile data')

const tooDeep = {}
let cursor = tooDeep
for (let index = 0; index < 13; index += 1) {
  cursor.next = {}
  cursor = cursor.next
}
const tooDeepResult = deepSanitize(tooDeep, 'deep')
assert.equal(tooDeepResult.report.passed, false, 'the safety guard must still reject excessive depth')
assert.ok(
  tooDeepResult.report.errors.some((error) => error.includes('递归深度超过限制')),
  'excessive depth must report a bounded-depth error',
)

const cyclic = {}
cyclic.self = cyclic
const cyclicResult = deepSanitize(cyclic, 'cyclic')
assert.equal(cyclicResult.report.passed, false, 'the safety guard must reject circular state')
assert.ok(
  cyclicResult.report.errors.some((error) => error.includes('循环引用')),
  'circular state must report a cycle error',
)

console.log('[world-init-scoring-depth-smoke] PASS')
