#!/usr/bin/env node

import {
  getServerRequestSource,
  redactSensitiveData,
} from '../../../../src/core/logger/server-log-safety.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const trusted = getServerRequestSource(new Request('http://localhost/api/proxy', {
  headers: {
    'x-real-ip': '203.0.113.7',
    'x-forwarded-for': '198.51.100.9, 127.0.0.1',
  },
}))
assert(trusted.ip === '203.0.113.7', 'X-Real-IP must outrank a forwarded chain')
assert(trusted.sourceId === 'ip-203.0.113.7', 'IPv4 source ID must remain stable and filesystem-safe')

const forwarded = getServerRequestSource(new Request('http://localhost/api/log', {
  headers: { 'x-forwarded-for': '2001:db8::8, 127.0.0.1' },
}))
assert(forwarded.ip === '2001:db8::8', 'forwarded IPv6 must be accepted when X-Real-IP is absent')
assert(forwarded.sourceId === 'ip-2001_db8_8', 'IPv6 source ID must remain stable and filesystem-safe')

const unknown = getServerRequestSource(new Request('http://localhost/api/log', {
  headers: { 'x-real-ip': 'not-an-ip' },
}))
assert(unknown.ip === 'unknown', 'invalid source headers must not become classification paths')

const sanitized = redactSensitiveData({
  apiKey: 'player-api-key',
  customKey: 'player-custom-key',
  managedApiKey: 'managed-key',
  accessToken: 'access-token',
  password: 'password-value',
  cookie: 'session=value',
  authorization: 'Bearer hidden-value',
  max_tokens: 4096,
  prompt: '完整剧情内容必须保留',
  raw: '{"customKey":"hidden"} Authorization: Bearer another-hidden-value',
})

for (const key of ['apiKey', 'customKey', 'managedApiKey', 'accessToken', 'password', 'cookie', 'authorization']) {
  assert(sanitized[key] === '[REDACTED]', `${key} must be redacted recursively`)
}
assert(sanitized.max_tokens === 4096, 'ordinary token-budget fields must not be mistaken for credentials')
assert(sanitized.prompt === '完整剧情内容必须保留', 'non-secret Prompt semantics must remain complete')
assert(!sanitized.raw.includes('hidden'), 'credential-like values inside raw strings must be redacted')
assert(sanitized.raw.includes('[REDACTED]'), 'raw-string redaction must leave an explicit marker')

console.log('[server-log-store-smoke] PASS')
