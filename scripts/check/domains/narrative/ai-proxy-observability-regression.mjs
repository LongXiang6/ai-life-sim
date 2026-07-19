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
const storySeed = read('src/core/ai-service/story-seed.ts')
const logStore = read('src/core/logger/server-log-store.ts')
const logSafety = read('src/core/logger/server-log-safety.ts')
const clientLogRoute = read('src/app/api/log/route.ts')
const clientLogger = read('src/core/logger/client-logger.ts')
const debugLogRoute = read('src/app/api/debug-log/route.ts')
const debugLogger = read('src/core/logger/debug-logger.ts')
const inspector = read('scripts/ops/inspect-ai-logs.mjs')

assert(
  /type:\s*z\.literal\('enabled'\)[\s\S]{0,160}budget_tokens/.test(proxy),
  'proxy schema must accept DeepSeek thinking type=enabled with an optional budget',
)
assert(
  /providerId === 'deepseek'[\s\S]{0,500}\{ type: 'enabled', budget_tokens: budgetTokens \}/.test(client),
  'DeepSeek enabled reasoning must send type=enabled together with budget_tokens',
)
assert(
  /seed:\s*z\.preprocess\([\s\S]{0,120}normalizeProxyStorySeedInput[\s\S]{0,120}z\.number\(\)\.finite\(\)\.optional\(\)/.test(proxy)
    && /value === null \? undefined : value/.test(storySeed),
  'proxy must normalize cached legacy seed=null requests to an omitted seed',
)
assert(
  /normalizeStorySeed\(options\?\.storySeed\)/.test(client)
    && /function normalizeStorySeed\(storySeed: unknown\)/.test(storySeed)
    && /Number\.isFinite\(parsed\)/.test(storySeed),
  'client must omit non-finite and non-numeric story seeds before serialization',
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
  /function isRetryableAiError\(error: unknown\)/.test(client)
    && /error instanceof AIHttpError/.test(client)
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
  /saveRawResponse\(requestId, providerId, model, upstreamResp\.status, errorText\)/.test(proxy)
    && /formatApiErrorForUser/.test(client),
  'raw upstream failures must remain in sanitized server logs while the client uses the translation layer',
)
assert(
  /AI_LOG_DIR/.test(logStore)
    && /AI_LOG_RETENTION_DAYS/.test(logStore)
    && /AI_LOG_MAX_TOTAL_BYTES/.test(logStore)
    && /DEFAULT_MAX_TOTAL_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/.test(logStore)
    && /redactSensitiveData/.test(logStore),
  'server log store must support persistent roots, 10 GiB capacity, retention cleanup, and redaction',
)
assert(
  /Buffer\.isBuffer\(content\)[\s\S]{0,180}redactSensitiveData/.test(logStore),
  'standalone raw text and Buffer log files must pass through secret redaction before writing',
)
assert(
  /x-real-ip/.test(logSafety)
    && logSafety.indexOf("request.headers.get('x-real-ip')") < logSafety.indexOf("request.headers.get('x-forwarded-for')")
    && /sourceId:\s*`ip-\$\{safeLogSegment\(ip\)\}`/.test(logSafety)
    && /sources\/\$\{source\.sourceId\}/.test(logStore),
  'server-derived IP must prefer the trusted Nginx header and own a per-source index',
)
assert(
  /custom\|managed\|provider/.test(logSafety)
    && /key\|token\|secret\|password\|authorization\|cookie/.test(logSafety),
  'secret redaction must cover player custom keys and token-like credential fields',
)
assert(
  /getServerRequestSource\(request\)/.test(clientLogRoute)
    && /sourceIp:\s*source\.ip/.test(clientLogRoute)
    && /requestId:\s*z\.string\(\)\.optional\(\)/.test(clientLogRoute)
    && /requestId/.test(clientLogger),
  'client diagnostics must receive a trusted source and preserve optional AI request correlation',
)
assert(
  /AI_DIAGNOSTIC_LOGS_ENABLED/.test(debugLogRoute)
    && /process\.env\.NODE_ENV === 'production'/.test(debugLogRoute)
    && /getServerRequestSource\(request\)/.test(debugLogRoute)
    && /ai-debug-index-/.test(debugLogRoute)
    && /NEXT_PUBLIC_DISABLE_DEBUG_LOG_COLLECTION/.test(debugLogger),
  'complete AI debug metadata must keep collecting in production while public read/delete stays closed',
)
assert(
  /--ip <address>/.test(inspector)
    && /--request-id <id>/.test(inspector)
    && /--include-content/.test(inspector)
    && /default output excludes full player Prompt/.test(inspector),
  'the private operator inspector must support IP/request lookup without exposing content by default',
)

if (!process.exitCode) {
  console.log('[ai-proxy-observability] PASS')
}
