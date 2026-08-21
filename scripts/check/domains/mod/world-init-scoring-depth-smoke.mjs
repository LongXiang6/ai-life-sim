/**
 * Purpose: Regress valid world-init state depth and invalid recursive structures.
 * Owner: quality:mod
 * Responsibility: One system-safety depth smoke only.
 */

import assert from 'node:assert/strict'

import { deepSanitize } from '../../../../src/mods/mod-engine/helpers/system-safety.ts'

const worldState = {
  worldConfig: {
    powerFramework: {
      label: '星海航路',
      progression: '由近地轨道走向深空',
      ranks: [
        { id: 'ground', label: '地表', requirements: ['基础训练'] },
        { id: 'orbit', label: '轨道', requirements: ['完成首次升空'] },
      ],
    },
    lifeStageTemplate: [
      { id: 'youth', label: '青年', ageRange: { min: 18, max: 40 } },
    ],
  },
}

const worldResult = deepSanitize(worldState, 'sub.world-init.data')
assert.equal(worldResult.report.passed, true, 'valid world-init state must fit the safety depth budget')
assert.deepEqual(worldResult.result, worldState, 'sanitization must preserve valid world-init state')

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

console.log('[world-init-state-depth-smoke] PASS')
