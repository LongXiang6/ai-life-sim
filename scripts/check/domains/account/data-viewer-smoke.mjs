import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

import Database from 'better-sqlite3'

import {
  buildDataOverview,
  createDataViewerServer,
  inspectDatabaseSchema,
  listMemoryDatabases,
  listRoundArchives,
  parseDataViewerArgs,
  queryAiCalls,
  queryDevelopmentSystemDiagnostics,
  queryMemoryRows,
  queryNarrativeRoundChains,
  queryReadonlyDatabase,
  queryUserLinks,
  readRoundArchive,
} from '../../../ops/data-viewer.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-data-viewer-'))
const logDatabase = path.join(root, 'logs.sqlite')
const accountDatabase = path.join(root, 'accounts.sqlite')
const playerContentDatabase = path.join(root, 'player-content.sqlite')
const memoryRoot = path.join(root, 'narrative-memory')
const roundRoot = path.join(root, 'narrative-rounds')
const diagnosticRoot = path.join(root, 'development-diagnostics')
const lifeRunId = 'life-viewer-smoke'
const prompt = '第一行完整 Prompt\r\n第二行：字段={"值":1}\n末尾空格  '
const responseText = '第一行完整返回\n第二行保持原样\r\n<DATA>完整数据</DATA>'
const roundText = [
  'AI LIFE SIM CORE NARRATIVE UPSTREAM ARCHIVE\n',
  'format_version: 1\n',
  `life_run_id: ${lifeRunId}\n`,
  'round: 9\n',
  '\n===== EXCHANGE BEGIN =====\n',
  'request_id: request-viewer-1\n',
  'call_kind: narrative-main\n',
  'execution_kind: real\n',
  'provider: deepseek\n',
  'model: deepseek-v4-pro\n',
  'attempt: 1\n',
  'status: 200\n',
  `request_utf8_bytes: ${Buffer.byteLength(prompt, 'utf8')}\n`,
  `response_utf8_bytes: ${Buffer.byteLength(responseText, 'utf8')}\n`,
  '----- REQUEST BEGIN -----\n',
  prompt,
  '\n----- REQUEST END -----\n----- RESPONSE BEGIN -----\n',
  responseText,
  '\n----- RESPONSE END -----\n===== EXCHANGE END =====\n',
].join('')

await fs.mkdir(path.join(roundRoot, lifeRunId), { recursive: true })
await fs.mkdir(memoryRoot, { recursive: true })
await fs.mkdir(diagnosticRoot, { recursive: true })
await fs.writeFile(path.join(roundRoot, lifeRunId, 'round-000009.txt'), roundText, 'utf8')
const diagnosticTimestamp = Date.now()
const executionEvent = (input) => ({
  schemaVersion: 1,
  timestamp: diagnosticTimestamp + input.sequence,
  system: input.owner || 'mod-engine',
  event: 'execution-node-state',
  status: input.developmentStatus || 'ok',
  lifeRunId,
  round: 9,
  ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
  ...(input.category ? { category: input.category } : {}),
  execution: {
    flowId: 'narrative-round',
    executionId: input.executionId || 'narrative-round:viewer-smoke:9:real',
    department: 'mod-engine',
    subsystem: 'orchestrator-system',
    component: input.component,
    phase: input.phase,
    sequence: input.sequence,
    status: input.status,
    code: `narrative-round:${input.component}:${input.status}`,
    owner: input.owner || 'mod-engine',
    failureTarget: 'mod-engine',
    nextNodeIds: input.nextNodeIds || [],
    terminal: input.terminal,
  },
  details: { flowOwner: 'mod-engine' },
  ...(input.developmentStatus === 'error' ? { error: { message: input.message || '执行失败' } } : {}),
})
const diagnosticEvents = [
  {
    schemaVersion: 1,
    timestamp: diagnosticTimestamp,
    system: 'summary-compressor',
    event: 'compression-failed',
    status: 'error',
    lifeRunId,
    round: 9,
    details: { level: 'L1' },
    error: { message: '压缩返回缺少来源' },
  },
  executionEvent({ component: 'prepare-round', phase: 'prepare', sequence: 1, status: 'ready', terminal: false }),
  executionEvent({ component: 'prepare-round', phase: 'prepare', sequence: 2, status: 'running', terminal: false }),
  executionEvent({ component: 'prepare-round', phase: 'prepare', sequence: 3, status: 'succeeded', terminal: true, durationMs: 2, nextNodeIds: ['queue-round'] }),
  executionEvent({ component: 'queue-round', phase: 'ready', sequence: 4, status: 'succeeded', terminal: true, durationMs: 1, nextNodeIds: ['advance-time'] }),
  executionEvent({ component: 'advance-time', phase: 'execute', sequence: 5, status: 'succeeded', terminal: true, durationMs: 5, nextNodeIds: ['post-processing'] }),
  executionEvent({ component: 'post-processing', phase: 'transition', sequence: 6, status: 'succeeded', terminal: true, durationMs: 3, nextNodeIds: ['compress-save'] }),
  executionEvent({ component: 'compress-save', phase: 'finalize', sequence: 7, status: 'succeeded', terminal: true, durationMs: 1 }),
  executionEvent({
    component: 'apply-entity-references',
    phase: 'execute',
    sequence: 8,
    status: 'failed',
    terminal: true,
    durationMs: 4,
    developmentStatus: 'error',
    category: 'entity-directory-missing',
    executionId: 'narrative-round:viewer-smoke:9:failed',
    message: '已定位实体未在实体引用目录中登记当前上下文',
  }),
]
await fs.writeFile(
  path.join(diagnosticRoot, '2026-07-26.jsonl'),
  `${diagnosticEvents.map((event) => JSON.stringify(event)).join('\n')}\n`,
  'utf8',
)

const logs = new Database(logDatabase)
logs.exec(`
  CREATE TABLE log_entries (
    id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, client_timestamp INTEGER,
    entry_type TEXT NOT NULL, category TEXT, level TEXT, module TEXT, message TEXT,
    event TEXT, request_id TEXT, source_ip TEXT, source_id TEXT, diagnostic_code TEXT,
    device_provenance_id TEXT, is_registered INTEGER, account_id TEXT, username TEXT,
    feedback_id TEXT, round INTEGER, age REAL, era TEXT, provider TEXT, model TEXT,
    call_kind TEXT, strategy TEXT, status INTEGER, prompt TEXT, response TEXT,
    error TEXT, stack TEXT, meta_json TEXT, payload_json TEXT
  );
  CREATE TABLE log_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`)
logs.prepare(`
  INSERT INTO log_entries(
    id, created_at, entry_type, category, level, module, message, request_id,
    source_ip, source_id, diagnostic_code, device_provenance_id, is_registered,
    account_id, username, round, provider, model, call_kind, strategy, status,
    prompt, response, meta_json, payload_json
  ) VALUES(?, ?, 'ai-call', 'narrative-rounds', 'info', 'ai-debug', 'narrative-main', ?,
    '198.51.100.12', 'ip-198.51.100.12', 'ABC234', ?, 1,
    'account-viewer', '查看器测试用户', 9, 'deepseek', 'deepseek-v4-pro',
    'narrative-main', 'S4', 200, ?, ?, ?, ?)
`).run(
  'log-viewer-1',
  Date.now(),
  'request-viewer-1',
  'DEV-0123456789ABCDEF0123456789ABCDEF',
  prompt,
  responseText,
  JSON.stringify({ lifeRunId, usage: { hitTokens: 100, missTokens: 20 } }),
  JSON.stringify({ trace: { lifeRunId, round: 9 }, prompt, response: responseText }),
)
logs.prepare(`
  INSERT INTO log_entries(
    id, created_at, entry_type, category, level, module, message, request_id,
    source_ip, source_id, diagnostic_code, device_provenance_id, is_registered,
    account_id, username, round, provider, model, call_kind, strategy, status,
    prompt, response, meta_json, payload_json
  ) VALUES(?, ?, 'proxy-access', 'ai-proxy', 'info', 'proxy', 'response', ?,
    '198.51.100.13', 'ip-198.51.100.13', 'XYZ789', ?, 1,
    'account-viewer', '查看器测试用户', 9, 'deepseek', 'deepseek-v4-pro',
    'narrative-main', 'S4', 200, NULL, NULL, ?, ?)
`).run(
  'log-viewer-access',
  Date.now(),
  'request-viewer-access',
  'DEV-11111111111111111111111111111111',
  JSON.stringify({ lifeRunId, callKind: 'narrative-main', durationMs: 1200 }),
  JSON.stringify({ trace: { lifeRunId, round: 9, callKind: 'narrative-main', durationMs: 1200 } }),
)
logs.prepare(`
  INSERT INTO log_entries(
    id, created_at, entry_type, category, level, module, message, event, request_id,
    source_ip, source_id, diagnostic_code, device_provenance_id, is_registered,
    account_id, username, round, provider, model, call_kind, strategy, status,
    prompt, response, meta_json, payload_json
  ) VALUES(?, ?, 'proxy-trace', 'ai-proxy', 'info', 'proxy', 'response', 'response', ?,
    '198.51.100.13', 'ip-198.51.100.13', 'XYZ789', ?, 1,
    'account-viewer', '查看器测试用户', 9, 'deepseek', 'deepseek-v4-pro',
    'narrative-main', 'S4', 200, NULL, ?, ?, ?)
`).run(
  'log-viewer-trace',
  Date.now(),
  'request-viewer-access',
  'DEV-11111111111111111111111111111111',
  JSON.stringify({ usage: { prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 20, completion_tokens: 30, total_tokens: 150 } }),
  JSON.stringify({ lifeRunId, callKind: 'narrative-main' }),
  JSON.stringify({ trace: { lifeRunId, round: 9, callKind: 'narrative-main' } }),
)
logs.close()

const accounts = new Database(accountDatabase)
accounts.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, created_at INTEGER NOT NULL, last_active_at INTEGER NOT NULL)')
accounts.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)').run('account-viewer', '查看器测试用户', Date.now(), Date.now())
accounts.close()

const content = new Database(playerContentDatabase)
content.exec(`
  CREATE TABLE leaderboard_best_runs (account_id TEXT PRIMARY KEY);
  CREATE TABLE player_mail_messages (id TEXT PRIMARY KEY);
  CREATE TABLE portrait_mail_jobs (account_id TEXT, record_id TEXT);
  CREATE TABLE cloud_manual_saves (account_id TEXT PRIMARY KEY);
`)
content.prepare('INSERT INTO leaderboard_best_runs VALUES (?)').run('account-viewer')
content.close()

const memory = new Database(path.join(memoryRoot, `${lifeRunId}.sqlite`))
memory.exec(`
  CREATE TABLE summary_nodes (
    summary_id TEXT PRIMARY KEY, level INTEGER, start_round INTEGER, end_round INTEGER,
    created_round INTEGER, content TEXT, raw_ai_response TEXT,
    source_summary_ids_json TEXT, context_ids_json TEXT,
    start_total_days REAL, end_total_days REAL
  );
  CREATE TABLE l1_archives (
    summary_id TEXT PRIMARY KEY, start_round INTEGER, end_round INTEGER,
    raw_ai_response TEXT, timeline_text TEXT, events_json TEXT, archived_at INTEGER
  );
  CREATE TABLE memory_events (
    event_id TEXT PRIMARY KEY, origin_summary_id TEXT, level INTEGER, time_span TEXT,
    event_text TEXT, occurrence_time TEXT, source_event_ids_json TEXT,
    source_rounds_json TEXT, initial_weight INTEGER, current_weight INTEGER,
    weight_anchor_round INTEGER, forgotten_round INTEGER, active INTEGER,
    permanent INTEGER, superseded_by_event_id TEXT, updated_at INTEGER
  );
  CREATE TABLE summary_event_links (summary_id TEXT, event_id TEXT);
`)
memory.prepare('INSERT INTO summary_nodes VALUES (?, 1, 1, 4, 9, ?, ?, ?, ?, NULL, NULL)')
  .run('L1:1-4', '时间轴完整摘要', '原始压缩 AI 返回', '[]', '[]')
memory.prepare('INSERT INTO memory_events VALUES (?, ?, 1, ?, ?, ?, ?, ?, 8, 7, 9, NULL, 1, 0, NULL, ?)')
  .run('event-1', 'L1:1-4', '2026-01 到 2026-04', '完整记忆事件', '2026-04', '[]', '[1,2,3,4]', Date.now())
memory.close()

const options = { logDatabase, accountDatabase, playerContentDatabase, memoryRoot, roundRoot, diagnosticRoot }
let server
try {
  assert.throws(() => parseDataViewerArgs(['--host', '0.0.0.0']), /只允许监听本机回环地址/u)

  const calls = queryAiCalls(options, { query: 'DEV-0123456789ABCDEF0123456789ABCDEF', page: 1, pageSize: 50 })
  assert.equal(calls.total, 1)
  assert.equal(calls.entries[0].prompt, prompt)
  assert.equal(calls.entries[0].response, responseText)
  assert.equal(calls.entries[0].deviceProvenanceId, 'DEV-0123456789ABCDEF0123456789ABCDEF')

  const users = queryUserLinks(options, { query: '查看器测试用户', page: 1, pageSize: 50 })
  const linkedUser = users.entries.find((entry) => (
    entry.deviceProvenanceId === 'DEV-0123456789ABCDEF0123456789ABCDEF'
  ))
  assert.equal(linkedUser?.accountId, 'account-viewer')
  assert.equal(linkedUser?.deviceProvenanceId, 'DEV-0123456789ABCDEF0123456789ABCDEF')

  assert.equal(listRoundArchives(options).saves[0].rounds[0].round, 9)
  assert.equal(readRoundArchive(options, lifeRunId, 9).content, roundText)
  assert.equal(listMemoryDatabases(options).saves[0].lifeRunId, lifeRunId)
  assert.equal(queryMemoryRows(options, { lifeRunId, view: 'summaries', page: 1, pageSize: 50 }).entries[0].raw_ai_response, '原始压缩 AI 返回')
  assert.equal(queryMemoryRows(options, { lifeRunId, view: 'events', page: 1, pageSize: 50 }).entries[0].event_text, '完整记忆事件')
  const diagnostics = queryDevelopmentSystemDiagnostics(options, { system: 'summary-compressor', status: 'error', page: 1, pageSize: 50 })
  assert.equal(diagnostics.total, 1)
  assert.equal(diagnostics.entries[0].system, 'summary-compressor')
  assert.equal(diagnostics.entries[0].error.message, '压缩返回缺少来源')
  const executionDiagnostics = queryDevelopmentSystemDiagnostics(options, { query: 'narrative-round', page: 1, pageSize: 50 })
  assert.equal(executionDiagnostics.execution.rawEvents, 8)
  assert.equal(executionDiagnostics.execution.terminalEvents, 6)
  assert.equal(executionDiagnostics.execution.failures, 1)
  assert.equal(executionDiagnostics.execution.byPhase.prepare.events, 3)
  assert.equal(executionDiagnostics.execution.byPhase.finalize.terminalEvents, 1)
  assert.equal(executionDiagnostics.execution.hierarchy[0].name, 'mod-engine')
  assert.equal(executionDiagnostics.execution.hierarchy[0].subsystems[0].name, 'orchestrator-system')
  assert.equal(executionDiagnostics.incidents.byCategory['entity-directory-missing'], 1)
  assert.ok(inspectDatabaseSchema(options, 'logs').tables.some((table) => table.name === 'log_entries'))

  const overview = buildDataOverview(options)
  assert.equal(overview.logs.today.calls, 1)
  assert.equal(overview.logs.today.cacheHitRate, 83.33)
  assert.equal(overview.logs.today.registeredCalls, 1)
  assert.equal(overview.logs.today.byPool['narrative-main'].hitTokens, 100)
  assert.equal(overview.diagnosticFiles, 1)

  const chains = queryNarrativeRoundChains(options, {
    lifeRunId,
    page: 1,
    pageSize: 50,
  })
  assert.equal(chains.total, 1)
  assert.equal(chains.entries[0].round, 9)
  assert.equal(chains.entries[0].exchanges[0].request, prompt)
  assert.equal(chains.entries[0].exchanges[0].response, responseText)
  assert.equal(chains.entries[0].archiveAvailable, true)
  assert.equal(chains.entries[0].memory.available, true)

  const readonly = queryReadonlyDatabase(options, {
    source: 'logs',
    sql: "SELECT request_id, prompt, response FROM log_entries WHERE id = 'log-viewer-1'",
    page: 1,
    pageSize: 50,
  })
  assert.equal(readonly.total, 1)
  assert.deepEqual(readonly.columns, ['request_id', 'prompt', 'response'])
  assert.equal(readonly.rows[0].prompt, prompt)
  assert.throws(() => queryReadonlyDatabase(options, {
    source: 'logs',
    sql: 'DELETE FROM log_entries',
    page: 1,
    pageSize: 50,
  }), /SELECT 或/u)

  server = createDataViewerServer(options)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  const page = await fetch(baseUrl).then((response) => response.text())
  assert.match(page, /数据查看器/u)
  assert.match(page, /AI 调用/u)
  assert.match(page, /系统诊断/u)
  assert.doesNotMatch(page, /玩家设置|\/settings/u)
  const script = await fetch(`${baseUrl}/app.js`).then((response) => response.text())
  assert.doesNotThrow(() => new vm.Script(script))
  assert.match(script, /render = async function renderEnhanced[\s\S]*\nrender\(\);\s*$/u)
  assert.match(script, /metrics = function metricsEnhanced[\s\S]*typeof value === 'number' \? fmt\(value\) : String/u)
  assert.match(script, /五阶段聚合/u)
  assert.match(script, /data\.execution\.hierarchy/u)

  const apiCall = await fetch(`${baseUrl}/api/ai-calls?q=request-viewer-1`).then((response) => response.json())
  assert.equal(apiCall.entries[0].prompt, prompt)
  assert.equal(apiCall.entries[0].response, responseText)
  const round = await fetch(`${baseUrl}/api/round?lifeRunId=${lifeRunId}&round=9`).then((response) => response.json())
  assert.equal(round.content, roundText)
  const chain = await fetch(`${baseUrl}/api/narrative-rounds?lifeRunId=${lifeRunId}`).then((response) => response.json())
  assert.equal(chain.entries[0].exchanges[0].request, prompt)
  const diagnosticApi = await fetch(`${baseUrl}/api/system-diagnostics?system=summary-compressor&status=error`).then((response) => response.json())
  assert.equal(diagnosticApi.entries[0].event, 'compression-failed')
  const executionApi = await fetch(`${baseUrl}/api/system-diagnostics?q=narrative-round`).then((response) => response.json())
  assert.equal(executionApi.execution.failures, 1)
  assert.equal(executionApi.execution.byPhase.transition.terminalEvents, 1)
  const query = await fetch(`${baseUrl}/api/query?source=logs&sql=${encodeURIComponent('SELECT request_id FROM log_entries')}`).then((response) => response.json())
  assert.equal(query.rows[0].request_id, 'request-viewer-1')
  const rejectedWrite = await fetch(`${baseUrl}/api/overview`, { method: 'POST' })
  assert.equal(rejectedWrite.status, 405)

  console.log('[data-viewer-smoke] PASS')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  await fs.rm(root, { recursive: true, force: true })
}
