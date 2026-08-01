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
const accountService = read('src/core/account/account-service.ts')
const clientLogRoute = read('src/app/api/log/route.ts')
const clientLogger = read('src/core/logger/client-logger.ts')
const debugLogRoute = read('src/app/api/debug-log/route.ts')
const debugLogger = read('src/core/logger/debug-logger.ts')
const debugLogPage = read('src/mods/mod-pages/pages/debug-log/page.tsx')
const diagnosticIdentityStore = read('src/core/logger/diagnostic-player-identity.ts')
const diagnosticIdentityRoute = read('src/app/api/diagnostic-identity/route.ts')
const diagnosticCodeContract = read('src/core/logger/diagnostic-player-code.ts')
const feedbackPage = read('src/mods/mod-pages/pages/feedback/page.tsx')
const feedbackContract = read('src/core/logger/feedback-contract.ts')
const feedbackBuilder = read('src/mods/mod-pages/pages/feedback/build-feedback-diagnostics.ts')
const initMods = read('src/app/_components/init-mods.tsx')
const gameStory = read('src/mods/mod-pages/pages/game-story/page.tsx')
const gameBranch = read('src/mods/mod-pages/pages/game-story/useSimulationBranch.ts')
const engineHooks = read('src/mods/mod-engine/hooks.ts')
const inspector = read('scripts/ops/inspect-ai-logs.mjs')
const logDatabases = read('scripts/ops/lib/log-databases.mjs')

assert(
  /reasoning_effort:\s*z\.enum\(\['high', 'max'\]\)\.optional\(\)/.test(proxy),
  'proxy schema must accept the supported DeepSeek reasoning effort values',
)
assert(
  /providerId === 'deepseek'[\s\S]{0,500}proxyBody\.reasoning_effort = reasoningEffort/.test(client)
    && !/REASONING_BUDGET_MAP/.test(client),
  'DeepSeek enabled reasoning must use reasoning_effort without legacy budget mapping',
)
assert(
  /seed:\s*z\.preprocess\([\s\S]{0,120}normalizeProxyStorySeedInput[\s\S]{0,120}z\.number\(\)\.finite\(\)\.optional\(\)/.test(proxy)
    && /value === null \? undefined : value/.test(storySeed),
  'proxy must normalize cached legacy seed=null requests to an omitted seed',
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
    && /appendServerLogEntry/.test(proxy),
  'every proxy call must expose a request ID and persist one-row trace records',
)
assert(
  /saveRawResponse\(source, requestId, providerId, model, upstreamResp\.status, errorText\)/.test(proxy)
    && /response:\s*body/.test(proxy),
  'raw upstream failures must be stored directly in the plaintext response column',
)
assert(
  /better-sqlite3/.test(logStore)
    && /CREATE TABLE IF NOT EXISTS log_entries/.test(logStore)
    && /prompt TEXT/.test(logStore)
    && /response TEXT/.test(logStore)
    && /meta_json TEXT/.test(logStore)
    && /payload_json TEXT/.test(logStore)
    && /storage_format', 'plaintext-sqlite'/.test(logStore),
  'the log owner must be a directly readable plaintext SQLite schema',
)
assert(
  !/redactSensitiveData|sha256-gzip|gzip|gunzip|content\/sha256|storeServerLogContent|readServerLogContent/.test(logStore + proxy + clientLogRoute + debugLogRoute + feedbackBuilder),
  'runtime logging must contain no redaction, compression, or content-reference path',
)
assert(
  /setDate\(startOfToday\.getDate\(\) - 1\)/.test(logStore)
    && /logs-archive\.sqlite/.test(logStore)
    && /INSERT INTO archive_logs\.log_entries/.test(logStore)
    && /findUnarchivedLogEntry/.test(logStore)
    && /assertNoLogEntryConflict/.test(logStore)
    && /DELETE FROM log_entries WHERE created_at < \?/.test(logStore)
    && /WITH combined_logs AS/.test(logStore)
    && !/INSERT OR IGNORE INTO archive_logs\.log_entries/.test(logStore)
    && /CLEANUP_INTERVAL_MS = 15 \* 60 \* 1000/.test(logStore),
  'retention must archive complete rows, reject conflicts, and query hot plus archive data',
)
assert(
  /x-real-ip/.test(logSafety)
    && logSafety.indexOf("request.headers.get('x-real-ip')") < logSafety.indexOf("request.headers.get('x-forwarded-for')")
    && /isRegistered:\s*false/.test(logSafety),
  'trusted source classification must retain an explicit anonymous fallback',
)
assert(
  /getSessionAccountIdentity/.test(logStore)
    && /accountId:\s*identity\.accountId/.test(logStore)
    && /username:\s*identity\.username/.test(logStore)
    && /SELECT accounts\.id, accounts\.username/.test(accountService),
  'registered account identity must come from the trusted server session',
)
assert(
  /DIAGNOSTIC_PLAYER_CODE_COOKIE/.test(logSafety)
    && /reserveDiagnosticIdentity/.test(diagnosticIdentityStore)
    && /diagnostic_identities/.test(logStore)
    && /HttpOnly/i.test(diagnosticIdentityRoute)
    && /A-HJ-NP-Z2-9/.test(diagnosticCodeContract),
  'anonymous diagnostic identity must remain directly queryable in SQLite',
)
assert(
  /isUserOperation\(entry\)/.test(clientLogRoute)
    && /ignored: 'user-operation'/.test(clientLogRoute)
    && /USER_OPERATION_METRICS/.test(clientLogRoute),
  'server logging must discard stale user-operation payloads',
)
assert(
  !/logger\.action|reportDomAction|addEventListener\('click'|addEventListener\('submit'|addEventListener\('change'/.test(clientLogger + initMods + gameStory + gameBranch + engineHooks)
    && !/kind:\s*'page_view'|kind:\s*'narrative_advance'|kind:\s*'time_step_selected'|kind:\s*'branch_choice'/.test(initMods + gameStory + gameBranch + engineHooks),
  'client code must not record clicks, forms, navigation, advances, time-step changes, or branch choices',
)
assert(
  /eventType\?: 'log' \| 'exception' \| 'metric'/.test(clientLogger)
    && /kind: 'story_repetition'/.test(engineHooks),
  'system quality metrics may remain without being classified as user operations',
)
const debugLoggerMethod = clientLogger.match(/debug\(module:[\s\S]*?\n  },\n\n  info\(/)?.[0] ?? ''
const infoLoggerMethod = clientLogger.match(/info\(module:[\s\S]*?\n  },\n\n  warn\(/)?.[0] ?? ''
assert(
  debugLoggerMethod.includes('rememberLocalDiagnostic({')
    && infoLoggerMethod.includes('rememberLocalDiagnostic({')
    && !debugLoggerMethod.includes('sendToServer({')
    && !infoLoggerMethod.includes('sendToServer({')
    && /reportUsageMetric[\s\S]{0,360}sendToServer\(\{/.test(clientLogger),
  'debug/info diagnostics must stay local while explicit quality metrics remain server-reported',
)
assert(
  /appendServerLogEntry/.test(debugLogRoute)
    && /queryServerLogEntries/.test(debugLogRoute)
    && !/deleteServerLogEntries|export async function DELETE/.test(debugLogRoute + logStore)
    && /entryType:\s*'ai-call'/.test(debugLogRoute)
    && /NEXT_PUBLIC_DISABLE_DEBUG_LOG_COLLECTION/.test(debugLogger),
  'AI debug logs must write and query direct database rows without a destructive clear path',
)
assert(
  /账号状态/.test(debugLogPage)
    && /账号 ID/.test(debugLogPage)
    && /用户名/.test(debugLogPage)
    && /Prompt \/ AI 输入/.test(debugLogPage)
    && /AI 返回 \/ 叙事/.test(debugLogPage),
  'database viewer must show plaintext content and registered/anonymous identity',
)
assert(
  !/consent|附带诊断|玩家编号/.test(feedbackPage + feedbackContract)
    && /ensureDiagnosticPlayerCode/.test(feedbackPage)
    && /diagnostics/.test(feedbackPage + feedbackContract)
    && !/redact|excludedTerms|delete safeSettings/.test(feedbackBuilder),
  'feedback must silently initialize diagnostic identity and submit without consent UI or redaction',
)
assert(
  !fs.existsSync(path.join(root, 'src/core/logger/redact-sensitive-data.ts'))
    && !fs.existsSync(path.join(root, 'src/core/logger/diagnostic-consent.ts')),
  'redaction and diagnostic-consent modules must not remain in the logging system',
)
assert(
  /readLogRows/.test(inspector)
    && /better-sqlite3/.test(logDatabases)
    && /日志归档 ID 冲突/.test(logDatabases)
    && /--account-id <id>/.test(inspector)
    && /payload_json/.test(inspector),
  'private inspector must query conflict-checked plaintext rows across hot and archive databases',
)

if (!process.exitCode) console.log('[ai-proxy-observability] PASS')
