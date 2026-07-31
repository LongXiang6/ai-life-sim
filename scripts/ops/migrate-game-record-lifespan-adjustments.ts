#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

import { CloudGameRecordSchema } from '../../src/core/account/account-contract'

interface Options {
  mode: 'apply' | 'rollback' | 'verify'
  playerContentDatabase: string
  accountDatabase: string
  backupDirectory?: string
}

interface DatabaseTarget {
  databasePath: string
  metaTable: 'account_meta' | 'player_content_meta'
  table: 'account_game_records' | 'leaderboard_best_runs'
  jsonColumn: 'data_json' | 'record_json'
}

const EXPECTED_SCHEMA_VERSION = '5'

function parseArgs(argv: string[]): Options {
  const mode = argv.shift()
  if (mode !== 'apply' && mode !== 'rollback' && mode !== 'verify') {
    throw new Error('Usage: migrate-game-record-lifespan-adjustments.ts <apply|rollback|verify> [options]')
  }
  const options: Options = {
    mode,
    playerContentDatabase: process.env.PLAYER_CONTENT_DB_PATH || '/var/lib/ai-life-sim/player-content.sqlite',
    accountDatabase: process.env.ACCOUNT_DB_PATH || '/var/lib/ai-life-sim/accounts.sqlite',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${argv[index - 1]} missing value`)
      return value
    }
    if (argv[index] === '--player-content-database') options.playerContentDatabase = next()
    else if (argv[index] === '--account-database') options.accountDatabase = next()
    else if (argv[index] === '--backup-directory') options.backupDirectory = next()
    else throw new Error(`Unknown argument: ${argv[index]}`)
  }
  options.playerContentDatabase = path.resolve(options.playerContentDatabase)
  options.accountDatabase = path.resolve(options.accountDatabase)
  if (options.backupDirectory) options.backupDirectory = path.resolve(options.backupDirectory)
  if (mode === 'rollback' && !options.backupDirectory) {
    throw new Error('rollback requires --backup-directory')
  }
  return options
}

function targets(options: Options): DatabaseTarget[] {
  return [
    {
      databasePath: options.accountDatabase,
      metaTable: 'account_meta',
      table: 'account_game_records',
      jsonColumn: 'data_json',
    },
    {
      databasePath: options.playerContentDatabase,
      metaTable: 'player_content_meta',
      table: 'leaderboard_best_runs',
      jsonColumn: 'record_json',
    },
  ]
}

function assertDatabase(database: Database.Database, target: Pick<DatabaseTarget, 'databasePath' | 'metaTable'>): void {
  const quickCheck = database.pragma('quick_check') as Array<{ quick_check: string }>
  if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== 'ok') {
    throw new Error(`SQLite quick_check failed: ${target.databasePath}`)
  }
  const schema = database.prepare(`
    SELECT value FROM ${target.metaTable} WHERE key = 'schema_version'
  `).get() as { value: string } | undefined
  if (schema?.value !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(`Unexpected database schema at ${target.databasePath}: ${schema?.value ?? 'missing'}`)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function renameField(
  value: Record<string, unknown>,
  legacyKey: string,
  currentKey: string,
  location: string,
): boolean {
  if (!hasOwn(value, legacyKey)) return false
  if (hasOwn(value, currentKey)) {
    throw new Error(`Conflicting game-record fields at ${location}`)
  }
  value[currentKey] = value[legacyKey]
  delete value[legacyKey]
  return true
}

function migrateRecord(record: unknown): { value: Record<string, unknown>; changed: boolean } {
  if (!isObject(record)) throw new Error('Game record root must be an object')
  let changed = false

  if (Array.isArray(record.achievements)) {
    for (const achievement of record.achievements) {
      if (isObject(achievement) && achievement.kind === 'breakthrough') {
        achievement.kind = 'lifespan-adjustment'
        changed = true
      }
    }
  }

  const scoring = isObject(record.scoring) ? record.scoring : null
  const profile = scoring && isObject(scoring.profile) ? scoring.profile : null
  if (profile && Array.isArray(profile.dimensions)) {
    for (const dimension of profile.dimensions) {
      if (!isObject(dimension) || !Array.isArray(dimension.evidenceKinds)) continue
      if (dimension.evidenceKinds.includes('breakthroughs')
        && dimension.evidenceKinds.includes('lifespan-adjustments')) {
        throw new Error('Conflicting game-record evidence kinds')
      }
      dimension.evidenceKinds = dimension.evidenceKinds.map((kind) => {
        if (kind !== 'breakthroughs') return kind
        changed = true
        return 'lifespan-adjustments'
      })
    }
  }

  if (scoring && isObject(scoring.audit)) {
    changed = renameField(
      scoring.audit,
      'breakthroughCount',
      'lifespanAdjustmentCount',
      'scoring.audit',
    ) || changed
  }
  if (scoring && isObject(scoring.evidence)) {
    changed = renameField(
      scoring.evidence,
      'breakthroughs',
      'lifespan-adjustments',
      'scoring.evidence',
    ) || changed
  }

  CloudGameRecordSchema.parse(record)
  return { value: record, changed }
}

function parseRecord(raw: string, rowNumber: number): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error(`Invalid game-record JSON at row ${rowNumber}`)
  }
}

function migrateTarget(target: DatabaseTarget): { rows: number; updated: number } {
  const database = new Database(target.databasePath, { fileMustExist: true })
  try {
    database.pragma('busy_timeout = 5000')
    assertDatabase(database, target)
    return database.transaction(() => {
      const rows = database.prepare(`
        SELECT rowid AS row_id, ${target.jsonColumn} AS payload
        FROM ${target.table} ORDER BY rowid ASC
      `).all() as Array<{ row_id: number; payload: string }>
      const update = database.prepare(`
        UPDATE ${target.table} SET ${target.jsonColumn} = ? WHERE rowid = ?
      `)
      let updated = 0
      rows.forEach((row, index) => {
        const migrated = migrateRecord(parseRecord(row.payload, index + 1))
        if (!migrated.changed) return
        update.run(JSON.stringify(migrated.value), row.row_id)
        updated += 1
      })
      return { rows: rows.length, updated }
    })()
  } finally {
    database.close()
  }
}

function verifyTarget(target: DatabaseTarget): { rows: number } {
  const database = new Database(target.databasePath, { readonly: true, fileMustExist: true })
  try {
    assertDatabase(database, target)
    const rows = database.prepare(`
      SELECT ${target.jsonColumn} AS payload FROM ${target.table} ORDER BY rowid ASC
    `).all() as Array<{ payload: string }>
    rows.forEach((row, index) => {
      CloudGameRecordSchema.parse(parseRecord(row.payload, index + 1))
    })
    return { rows: rows.length }
  } finally {
    database.close()
  }
}

async function backupDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  if (fs.existsSync(destinationPath)) return
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    await source.backup(destinationPath)
  } finally {
    source.close()
  }
  fs.chmodSync(destinationPath, 0o600)
}

function assertSnapshot(databasePath: string, metaTable: DatabaseTarget['metaTable']): void {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    assertDatabase(database, { databasePath, metaTable })
  } finally {
    database.close()
  }
}

async function restoreDatabase(
  activePath: string,
  baselinePath: string,
  archivePath: string,
  metaTable: DatabaseTarget['metaTable'],
): Promise<void> {
  assertSnapshot(activePath, metaTable)
  assertSnapshot(baselinePath, metaTable)
  await backupDatabase(activePath, archivePath)
  assertSnapshot(archivePath, metaTable)

  const restoreTemp = `${activePath}.game-record-lifespan-adjustments-restore`
  fs.rmSync(restoreTemp, { force: true })
  await backupDatabase(baselinePath, restoreTemp)
  assertSnapshot(restoreTemp, metaTable)
  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${activePath}${suffix}`, { force: true })
  }
  fs.renameSync(restoreTemp, activePath)
  fs.chmodSync(activePath, 0o600)
  assertSnapshot(activePath, metaTable)
}

async function rollbackMigration(options: Options): Promise<void> {
  const backupDirectory = options.backupDirectory!
  const accountBaseline = path.join(backupDirectory, 'accounts.sqlite')
  const playerContentBaseline = path.join(backupDirectory, 'player-content.sqlite')
  const accountArchive = path.join(backupDirectory, 'accounts-game-record-lifespan-adjustments-rollback.sqlite')
  const playerContentArchive = path.join(backupDirectory, 'player-content-game-record-lifespan-adjustments-rollback.sqlite')

  await restoreDatabase(
    options.accountDatabase,
    accountBaseline,
    accountArchive,
    'account_meta',
  )
  await restoreDatabase(
    options.playerContentDatabase,
    playerContentBaseline,
    playerContentArchive,
    'player_content_meta',
  )
  console.log(JSON.stringify({
    ok: true,
    mode: 'rollback',
    restored: ['accounts.sqlite', 'player-content.sqlite'],
    archived: [path.basename(accountArchive), path.basename(playerContentArchive)],
  }))
}

const options = parseArgs(process.argv.slice(2))
if (options.mode === 'apply') {
  const results = targets(options).map((target) => ({
    table: target.table,
    ...migrateTarget(target),
  }))
  console.log(JSON.stringify({ ok: true, mode: 'apply', results }))
} else if (options.mode === 'verify') {
  const results = targets(options).map((target) => ({
    table: target.table,
    ...verifyTarget(target),
  }))
  console.log(JSON.stringify({ ok: true, mode: 'verify', results }))
} else {
  await rollbackMigration(options)
}
