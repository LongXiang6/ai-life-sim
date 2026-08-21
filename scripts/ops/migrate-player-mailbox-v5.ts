#!/usr/bin/env node

/**
 * Purpose: Migrate the legacy v4 player mailbox to the current player-content schema.
 * Owner: operations
 * Responsibility: Apply, verify, and rollback the single mailbox deployment migration lifecycle.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

interface Options {
  mode: 'apply' | 'rollback' | 'verify'
  playerContentDatabase: string
  accountDatabase: string
  backupDirectory?: string
}

function parseArgs(argv: string[]): Options {
  const mode = argv.shift()
  if (mode !== 'apply' && mode !== 'rollback' && mode !== 'verify') {
    throw new Error('Usage: migrate-player-mailbox-v5.ts <apply|rollback|verify> [options]')
  }
  const options: Options = {
    mode,
    playerContentDatabase: process.env.PLAYER_CONTENT_DB_PATH || '/var/lib/ai-life-sim/player-content.sqlite',
    accountDatabase: process.env.ACCOUNT_DB_PATH || '/var/lib/ai-life-sim/accounts.sqlite',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${argv[index - 1]} 缺少参数`)
      return value
    }
    if (argv[index] === '--player-content-database') options.playerContentDatabase = next()
    else if (argv[index] === '--account-database') options.accountDatabase = next()
    else if (argv[index] === '--backup-directory') options.backupDirectory = next()
    else throw new Error(`未知参数：${argv[index]}`)
  }
  options.playerContentDatabase = path.resolve(options.playerContentDatabase)
  options.accountDatabase = path.resolve(options.accountDatabase)
  if (options.backupDirectory) options.backupDirectory = path.resolve(options.backupDirectory)
  if (mode === 'rollback' && !options.backupDirectory) {
    throw new Error('rollback 必须提供 --backup-directory')
  }
  return options
}

function schemaVersion(databasePath: string): string | null {
  if (!fs.existsSync(databasePath)) return null
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const row = database.prepare(`
      SELECT value FROM player_content_meta WHERE key = 'schema_version'
    `).get() as { value: string } | undefined
    return row?.value ?? null
  } finally {
    database.close()
  }
}

function assertQuickCheck(databasePath: string, expectedVersion: string): void {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const check = database.pragma('quick_check') as Array<{ quick_check: string }>
    if (check.length !== 1 || check[0]?.quick_check !== 'ok') {
      throw new Error(`SQLite quick_check 失败：${databasePath}`)
    }
    const version = database.prepare(`
      SELECT value FROM player_content_meta WHERE key = 'schema_version'
    `).get() as { value: string } | undefined
    if (version?.value !== expectedVersion) {
      throw new Error(`玩家内容 Schema 应为 ${expectedVersion}，实际为 ${version?.value ?? 'missing'}`)
    }
  } finally {
    database.close()
  }
}

async function backupDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  if (fs.existsSync(destinationPath)) throw new Error(`备份目标已存在：${destinationPath}`)
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    await source.backup(destinationPath)
  } finally {
    source.close()
  }
  fs.chmodSync(destinationPath, 0o600)
}

async function ensureDatabaseBackup(
  sourcePath: string,
  destinationPath: string,
  expectedVersion: string,
): Promise<void> {
  if (!fs.existsSync(destinationPath)) {
    await backupDatabase(sourcePath, destinationPath)
  }
  assertQuickCheck(destinationPath, expectedVersion)
}

async function applyMigration(options: Options): Promise<void> {
  const before = schemaVersion(options.playerContentDatabase)
  if (before !== '4') {
    throw new Error(`只允许从玩家内容 Schema 4 升级，当前为 ${before ?? 'missing'}`)
  }
  process.env.PLAYER_CONTENT_DB_PATH = options.playerContentDatabase
  process.env.ACCOUNT_DB_PATH = options.accountDatabase
  const databaseModule = await import('../../src/core/player-content/player-content-database')
  try {
    databaseModule.getPlayerContentDatabase()
  } finally {
    databaseModule.closePlayerContentDatabaseForTests()
  }
  assertQuickCheck(options.playerContentDatabase, '6')
  console.log(JSON.stringify({ ok: true, mode: 'apply', before, after: '6' }))
}

async function rollbackMigration(options: Options): Promise<void> {
  const backupDirectory = options.backupDirectory!
  const baseline = path.join(backupDirectory, 'player-content.sqlite')
  if (!fs.existsSync(baseline)) throw new Error('部署前玩家内容备份不存在')
  assertQuickCheck(baseline, '4')
  const currentVersion = schemaVersion(options.playerContentDatabase)
  if (currentVersion !== '6') {
    if (currentVersion === '4') {
      console.log(JSON.stringify({ ok: true, mode: 'rollback', restored: false, reason: 'already-v4' }))
      return
    }
    throw new Error(`回滚前玩家内容 Schema 应为 6，实际为 ${currentVersion ?? 'missing'}`)
  }

  const archive = path.join(backupDirectory, 'player-content-mailbox-v5-rollback.sqlite')
  await ensureDatabaseBackup(options.playerContentDatabase, archive, '6')

  const restoreTemp = `${options.playerContentDatabase}.mailbox-v5-restore`
  if (fs.existsSync(restoreTemp)) {
    try {
      assertQuickCheck(restoreTemp, '4')
    } catch {
      fs.rmSync(restoreTemp, { force: true })
    }
  }
  await ensureDatabaseBackup(baseline, restoreTemp, '4')
  for (const suffix of ['-wal', '-shm']) {
    try { fs.rmSync(`${options.playerContentDatabase}${suffix}`, { force: true }) } catch { /* already absent */ }
  }
  fs.renameSync(restoreTemp, options.playerContentDatabase)
  fs.chmodSync(options.playerContentDatabase, 0o600)
  assertQuickCheck(options.playerContentDatabase, '4')
  console.log(JSON.stringify({
    ok: true,
    mode: 'rollback',
    restored: true,
    archivedVersion: '6',
    activeVersion: '4',
  }))
}

const options = parseArgs(process.argv.slice(2))
if (options.mode === 'apply') await applyMigration(options)
else if (options.mode === 'rollback') await rollbackMigration(options)
else {
  assertQuickCheck(options.playerContentDatabase, '6')
  console.log(JSON.stringify({ ok: true, mode: 'verify', version: '6' }))
}
