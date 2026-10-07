/**
 * Purpose: Read compressed narrative-memory databases for the local data viewer.
 * Owner: operations
 * Responsibility: Memory database listing and row projection only; round archives and log queries are separate owners.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  DEFAULT_PAGE_SIZE,
  listFiles,
  MAX_PAGE_SIZE,
  MEMORY_TABLES,
  pathInside,
  positiveInteger,
  tableExists,
  withReadonly,
  assertSafeSegment,
} from './shared.mjs'

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
