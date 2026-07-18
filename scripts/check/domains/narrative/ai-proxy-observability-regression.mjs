#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[ai-proxy-observability] FAIL: ${message}`)
    process.exitCode = 1
  }
}

const proxy = read('src/app/api/proxy/route.ts')
const client = read('src/core/ai-service/ai-client.ts')
const logStore = read('src/core/logger/server-log-store.ts')

assert(
  /type:\s*z\.literal\('enabled'\)[\s\S]{0,160}budget_tokens/.test(proxy),
  'proxy schema must accept DeepSeek thinking type=enabled with an optional budget',
)
assert(
  /providerId === 'deepseek'[\s\S]{0,500}\{ type: 'enabled', budget_tokens: budgetTokens \}/.test(client),
  'DeepSeek enabled reasoning must send type=enabled together with budget_tokens',
)
assert(
  /\{ type: 'disabled' \}/.test(client),
  'DeepSeek disabled reasoning must remain explicit',
)
assert(
  !/MAX_RETRY_COUNT|shouldReject|Retry limit exceeded/.test(proxy),
  'proxy must observe repeated fingerprints without enforcing a fixed request-count rejection',
)
assert(
  /class AIHttpError[\s\S]{0,1200}isRetryableAiError/.test(client)
    && /error\.status === 408 \|\| error\.status === 429 \|\| error\.status >= 500/.test(client),
  'deterministic 400 responses must not enter the transient internal retry path',
)
assert(
  /randomUUID\(\)/.test(proxy)
    && /x-ai-request-id/.test(proxy)
    && /ai-traces\/ai-trace-/.test(proxy),
  'every proxy call must expose a request ID and persist an AI trace',
)
assert(
  /AI_LOG_DIR/.test(logStore)
    && /AI_LOG_RETENTION_DAYS/.test(logStore)
    && /AI_LOG_MAX_TOTAL_BYTES/.test(logStore)
    && /redactSensitiveData/.test(logStore),
  'server log store must support persistent roots, retention, capacity cleanup, and redaction',
)

if (!process.exitCode) {
  console.log('[ai-proxy-observability] PASS')
}
