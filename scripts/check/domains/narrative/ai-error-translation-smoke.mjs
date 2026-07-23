#!/usr/bin/env node

import assert from 'node:assert/strict'

import {
  diagnoseApiError,
  formatApiErrorForUser,
} from '../../../../src/core/ai-service/api-error.ts'
import {
  normalizeProxyStorySeedInput,
  normalizeStorySeed,
} from '../../../../src/core/ai-service/story-seed.ts'

const cases = [
  [400, '请求参数'],
  [401, 'API Key'],
  [402, '余额'],
  [403, '权限'],
  [404, '找不到'],
  [408, '超时'],
  [409, '冲突'],
  [413, '内容过大'],
  [415, '格式'],
  [422, '无法处理'],
  [429, '频繁'],
  [499, '取消'],
  [500, '内部错误'],
  [501, '不支持'],
  [502, '上游'],
  [503, '繁忙'],
  [504, '超时'],
  [507, '存储空间'],
  [418, '请求被拒绝'],
  [599, '服务端异常'],
]

const secretError = 'upstream rejected api_key=player-secret Authorization: Bearer hidden-token'
for (const [status, expected] of cases) {
  const message = formatApiErrorForUser(status, secretError, 'req-test-123')
  const diagnostic = diagnoseApiError(status, secretError)

  assert.ok(message.includes(`HTTP ${status}`), `${status} must retain its HTTP status`)
  assert.ok(message.includes(expected), `${status} must explain the error as ${expected}`)
  assert.ok(message.includes('解决办法'), `${status} must tell the player how to resolve it`)
  assert.ok(message.includes('请求 ID：req-test-123'), `${status} must preserve the request ID`)
  assert.ok(!message.includes('player-secret'), `${status} must not expose the upstream secret body`)
  assert.ok(!message.includes('hidden-token'), `${status} must not expose bearer tokens`)
  assert.ok(!diagnostic.detail.includes('player-secret'), `${status} detail must remain UI-safe`)
}

const moderationDiagnostic = diagnoseApiError(400, '抱歉，您所输入的内容含有违规信息，请重新编辑后再发送')
assert.equal(moderationDiagnostic.summary, '输入内容触发了安全审核')
assert.ok(moderationDiagnostic.suggestion.includes('调整输入内容'))
assert.ok(moderationDiagnostic.suggestion.includes('重试不会解决审核问题'))

assert.equal(normalizeStorySeed(0), 0, 'numeric zero remains a valid story seed')
assert.equal(normalizeStorySeed(' 42 '), 42, 'numeric strings are normalized')
assert.equal(normalizeStorySeed(''), undefined, 'empty story seeds are omitted')
assert.equal(normalizeStorySeed('not-a-number'), undefined, 'non-numeric story seeds are omitted')
assert.equal(normalizeStorySeed(Number.NaN), undefined, 'NaN story seeds are omitted before JSON serialization')
assert.equal(normalizeStorySeed(Number.POSITIVE_INFINITY), undefined, 'infinite story seeds are omitted')
assert.equal(normalizeProxyStorySeedInput(null), undefined, 'legacy proxy seed=null is normalized to omission')
assert.equal(normalizeProxyStorySeedInput(42), 42, 'valid numeric proxy seeds remain unchanged')
assert.equal(normalizeProxyStorySeedInput('invalid'), 'invalid', 'non-null proxy values remain available to schema validation')

console.log(`[ai-error-translation] PASS statuses=${cases.length}`)
