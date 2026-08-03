/**
 * Purpose: Read narrative round archives, memory links, retry diffs, and round outcome chains.
 * Owner: operations
 * Responsibility: Read-only narrative archive projection; it does not mutate memory, logs, or simulation state.
 */

import fs from 'node:fs'
import path from 'node:path'

import { extractUsageObject, normalizeUsage } from './log-analysis.mjs'
import { mapLogRow } from './log-queries.mjs'
import {
  DEFAULT_PAGE_SIZE,
  listFiles,
  MAX_PAGE_SIZE,
  MEMORY_TABLES,
  pathInside,
  positiveInteger,
  tableExists,
  withReadonly,
  withReadonlyLogs,
  assertSafeSegment,
} from './shared.mjs'

function parseRoundArchiveExchanges(content) {
  const source = Buffer.from(content, 'utf8')
  const begin = Buffer.from('===== EXCHANGE BEGIN =====\n', 'utf8')
  const requestBegin = Buffer.from('----- REQUEST BEGIN -----\n', 'utf8')
  const requestEnd = Buffer.from('\n----- REQUEST END -----\n----- RESPONSE BEGIN -----\n', 'utf8')
  const responseEnd = Buffer.from('\n----- RESPONSE END -----\n===== EXCHANGE END =====', 'utf8')
  const exchanges = []
  let cursor = 0
  while (cursor < source.length) {
    const blockStart = source.indexOf(begin, cursor)
    if (blockStart < 0) break
    const headerStart = blockStart + begin.length
    const bodyStartMarker = source.indexOf(requestBegin, headerStart)
    if (bodyStartMarker < 0) break
    const header = source.subarray(headerStart, bodyStartMarker).toString('utf8')
    const fields = Object.fromEntries(header.split(/\r?\n/u).flatMap((entry) => {
      const separator = entry.indexOf(':')
      return separator > 0 ? [[entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]] : []
    }))
    const requestLength = Number(fields.request_utf8_bytes)
    const responseLength = Number(fields.response_utf8_bytes)
    if (!Number.isSafeInteger(requestLength) || requestLength < 0
      || !Number.isSafeInteger(responseLength) || responseLength < 0) break
    const requestStart = bodyStartMarker + requestBegin.length
    const requestEndAt = requestStart + requestLength
    if (!source.subarray(requestEndAt, requestEndAt + requestEnd.length).equals(requestEnd)) break
    const responseStart = requestEndAt + requestEnd.length
    const responseEndAt = responseStart + responseLength
    if (!source.subarray(responseEndAt, responseEndAt + responseEnd.length).equals(responseEnd)) break
    exchanges.push({
      requestId: fields.request_id || '',
      callKind: fields.call_kind || '',
      executionKind: fields.execution_kind || '',
      provider: fields.provider || '',
      model: fields.model || '',
      attempt: Number(fields.attempt) || 1,
      status: fields.status ? Number(fields.status) : null,
      transportError: fields.transport_error || '',
      request: source.subarray(requestStart, requestEndAt).toString('utf8'),
      response: source.subarray(responseStart, responseEndAt).toString('utf8'),
      usage: normalizeUsage(extractUsageObject(source.subarray(responseStart, responseEndAt).toString('utf8'))),
    })
    cursor = responseEndAt + responseEnd.length
  }
  return exchanges
}

function completeTextDiff(left, right) {
  const before = String(left ?? '')
  const after = String(right ?? '')
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1
  return {
    identical: before === after,
    commonPrefixChars: prefix,
    commonSuffixChars: suffix,
    removed: before.slice(prefix, before.length - suffix),
    added: after.slice(prefix, after.length - suffix),
  }
}

function readRoundMemoryLinks(options, lifeRunId, round) {
  const databasePath = pathInside(options.memoryRoot, `${lifeRunId}.sqlite`)
  return withReadonly(databasePath, { available: false, summaries: [], events: [] }, (database) => {
    const summaries = tableExists(database, 'summary_nodes')
      ? database.prepare(`
          SELECT * FROM summary_nodes
          WHERE start_round <= ? AND end_round >= ?
          ORDER BY level ASC, start_round ASC, summary_id ASC
        `).all(round, round)
      : []
    const events = tableExists(database, 'memory_events')
      ? database.prepare(`
          SELECT DISTINCT events.* FROM memory_events AS events, json_each(events.source_rounds_json) AS source_round
          WHERE json_valid(events.source_rounds_json) AND CAST(source_round.value AS INTEGER) = ?
          ORDER BY events.level ASC, events.occurrence_time ASC, events.event_id ASC
        `).all(round)
      : []
    return { available: true, summaries, events }
  })
}

function readRoundOutcome(options, lifeRunId, round) {
  return withReadonlyLogs(options.logDatabase, null, (database) => {
    if (!tableExists(database, 'log_entries')) return null
    const pattern = `%${lifeRunId}%`
    const rows = database.prepare(`
      SELECT * FROM log_entries
      WHERE entry_type IN ('narrative-round-commit', 'narrative-round-diagnostic')
        AND round = ? AND (meta_json LIKE ? OR payload_json LIKE ?)
      ORDER BY created_at ASC, rowid ASC, id ASC
    `).all(round, pattern, pattern)
    return rows.map(mapLogRow)
  })
}

export function queryNarrativeRoundChains(options, input = {}) {
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, 20, 100)
  const query = String(input.query ?? '').trim().toLowerCase()
  const requestedLifeRunId = input.lifeRunId ? assertSafeSegment(input.lifeRunId, 'lifeRunId') : ''
  const requestedRound = input.round ? positiveInteger(input.round, 0) : 0
  const index = listRoundArchives(options)
  const flattened = index.saves.flatMap((save) => save.rounds.map((entry) => ({
    ...entry,
    lifeRunId: save.lifeRunId,
  }))).filter((entry) => (
    (!requestedLifeRunId || entry.lifeRunId === requestedLifeRunId)
    && (!requestedRound || entry.round === requestedRound)
    && (!query || `${entry.lifeRunId} ${entry.round}`.toLowerCase().includes(query))
  )).sort((left, right) => right.round - left.round || right.lifeRunId.localeCompare(left.lifeRunId))
  const selected = flattened.slice((page - 1) * pageSize, page * pageSize)
  const entries = selected.map((entry) => {
    const archive = readRoundArchive(options, entry.lifeRunId, entry.round)
    const exchanges = parseRoundArchiveExchanges(archive.content)
    const grouped = new Map()
    for (const exchange of exchanges) {
      const key = exchange.callKind || 'unclassified'
      const group = grouped.get(key) ?? []
      group.push(exchange)
      grouped.set(key, group)
    }
    const differences = []
    for (const [callKind, attempts] of grouped) {
      const ordered = [...attempts].sort((left, right) => left.attempt - right.attempt)
      for (let index = 1; index < ordered.length; index += 1) {
        differences.push({
          callKind,
          fromAttempt: ordered[index - 1].attempt,
          toAttempt: ordered[index].attempt,
          request: completeTextDiff(ordered[index - 1].request, ordered[index].request),
          response: completeTextDiff(ordered[index - 1].response, ordered[index].response),
        })
      }
    }
    return {
      ...entry,
      archiveAvailable: archive.available,
      exchanges,
      differences,
      outcome: readRoundOutcome(options, entry.lifeRunId, entry.round),
      memory: readRoundMemoryLinks(options, entry.lifeRunId, entry.round),
    }
  })
  return { available: index.available, total: flattened.length, page, pageSize, entries }
}

export function listRoundArchives(options) {
  const saves = listFiles(options.roundRoot, (entry) => entry.isDirectory()).map((lifeRunId) => {
    const directory = pathInside(options.roundRoot, lifeRunId)
    const rounds = listFiles(directory, (entry) => entry.isFile() && /^round-\d{6}\.txt$/u.test(entry.name))
      .map((fileName) => ({
        round: Number(fileName.slice(6, 12)),
        fileName,
        bytes: fs.statSync(path.join(directory, fileName)).size,
      }))
    return { lifeRunId, rounds }
  })
  return { available: fs.existsSync(options.roundRoot), saves }
}

export function readRoundArchive(options, lifeRunId, round) {
  const safeLifeRunId = assertSafeSegment(lifeRunId, 'lifeRunId')
  const safeRound = positiveInteger(round, 0)
  if (!safeRound) throw new Error('round 必须是正整数')
  const fileName = `round-${String(safeRound).padStart(6, '0')}.txt`
  const filePath = pathInside(options.roundRoot, safeLifeRunId, fileName)
  if (!fs.existsSync(filePath)) return { available: false, lifeRunId: safeLifeRunId, round: safeRound, content: '', bytes: 0 }
  const content = fs.readFileSync(filePath, 'utf8')
  return { available: true, lifeRunId: safeLifeRunId, round: safeRound, content, bytes: Buffer.byteLength(content, 'utf8') }
}

export function listMemoryDatabases(options) {
  const saves = listFiles(options.memoryRoot, (entry) => entry.isFile() && /^[a-zA-Z0-9._-]+\.sqlite$/u.test(entry.name))
    .map((fileName) => ({
      lifeRunId: fileName.slice(0, -'.sqlite'.length),
      bytes: fs.statSync(path.join(options.memoryRoot, fileName)).size,
    }))
  return { available: fs.existsSync(options.memoryRoot), saves }
}

export function queryMemoryRows(options, input) {
  const lifeRunId = assertSafeSegment(input.lifeRunId, 'lifeRunId')
  const target = MEMORY_TABLES[input.view] ?? MEMORY_TABLES.events
  const databasePath = pathInside(options.memoryRoot, `${lifeRunId}.sqlite`)
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  return withReadonly(databasePath, { available: false, lifeRunId, view: input.view, total: 0, page, pageSize, entries: [] }, (database) => {
    if (!tableExists(database, target.table)) return { available: false, lifeRunId, view: input.view, total: 0, page, pageSize, entries: [] }
    const total = Number(database.prepare(`SELECT COUNT(*) AS count FROM "${target.table}"`).get()?.count ?? 0)
    const entries = database.prepare(`SELECT * FROM "${target.table}" ORDER BY ${target.order} LIMIT ? OFFSET ?`)
      .all(pageSize, (page - 1) * pageSize)
    return { available: true, lifeRunId, view: input.view, total, page, pageSize, entries }
  })
}
