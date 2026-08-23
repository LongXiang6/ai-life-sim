/**
 * Purpose: Verify the debug AI view pairs proxy request and response traces into one exchange.
 * Owner: quality:ui
 * Responsibility: Read-only exchange projection and Beijing timestamp formatting only.
 */

import assert from 'node:assert/strict'

import {
  formatShortTime,
  getLifeRunId,
  pairProxyTraceEntries,
  projectDebugLogValue,
  projectProxyPromptText,
} from '../../../../src/mods/mod-pages/pages/debug-log/debug-log-types.ts'

function entry(overrides) {
  return {
    id: 'entry',
    createdAt: 0,
    clientTimestamp: null,
    entryType: 'proxy-trace',
    category: 'ai-proxy',
    level: 'info',
    module: 'api-proxy',
    message: 'request',
    event: 'request',
    requestId: 'request-001',
    sourceIp: '127.0.0.1',
    sourceId: 'ip-127.0.0.1',
    diagnosticCode: null,
    deviceProvenanceId: null,
    isRegistered: false,
    accountId: null,
    username: null,
    feedbackId: null,
    round: 4,
    age: null,
    era: null,
    provider: 'custom',
    model: 'test-model',
    callKind: 'narrative-main',
    strategy: null,
    status: 200,
    prompt: null,
    response: null,
    error: null,
    stack: null,
    meta: { lifeRunId: 'life-debug-smoke' },
    payload: {},
    ...overrides,
  }
}

const exchanges = pairProxyTraceEntries([
  entry({ id: 'response-row', createdAt: 200, event: 'response', response: '原始响应' }),
  entry({ id: 'request-row', createdAt: 100, prompt: '原始发送文本' }),
])

assert.equal(exchanges.length, 1)
assert.equal(exchanges[0].id, 'request-001')
assert.equal(exchanges[0].createdAt, 100)
assert.equal(exchanges[0].prompt, '原始发送文本')
assert.equal(exchanges[0].response, '原始响应')
assert.equal(getLifeRunId(exchanges[0]), 'life-debug-smoke')
assert.match(formatShortTime(Date.parse('2026-08-23T12:34:56.000Z')), /20:34:56/u)

const legacyRequest = JSON.stringify({
  apiKey: 'sk-legacy-secret',
  messages: [{ role: 'user', content: '历史消息' }],
})
assert.equal(projectProxyPromptText(legacyRequest), JSON.stringify([{ role: 'user', content: '历史消息' }]))
const projectedDiagnostics = JSON.stringify(projectDebugLogValue({ apiKey: 'sk-legacy-secret', nested: { authorization: 'Bearer legacy-secret' } }))
assert.doesNotMatch(projectedDiagnostics, /apiKey|authorization|legacy-secret/u)

console.log('[debug-log-exchange-smoke] PASS')
