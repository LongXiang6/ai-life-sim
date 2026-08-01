#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import Database from 'better-sqlite3'

const projectRoot = process.cwd()
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-log-archive-v1-'))
const logDatabase = path.join(tempRoot, 'logs.sqlite')
const archiveDatabase = path.join(tempRoot, 'logs-archive.sqlite')
const backupDirectory = path.join(tempRoot, 'backup')
const migrationCommand = path.join('scripts', 'ops', 'migrate-log-archive-v1.ts')
const typescriptLoader = pathToFileURL(
  path.join(projectRoot, 'scripts', 'check', 'lib', 'typescript-loader.mjs'),
).href

function runMigration(mode, rollbackDirectory = backupDirectory) {
  const output = execFileSync(process.execPath, [
    '--no-warnings=ExperimentalWarning',
    '--loader',
    typescriptLoader,
    migrationCommand,
    mode,
    '--log-database',
    logDatabase,
    ...(mode === 'rollback' ? ['--backup-directory', rollbackDirectory] : []),
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, AI_LOG_DB_PATH: logDatabase },
  }).trim()
  return JSON.parse(output.split(/\r?\n/u).at(-1))
}

async function backupBaseline(directory) {
  await fs.mkdir(directory, { recursive: true })
  const source = new Database(logDatabase, { readonly: true, fileMustExist: true })
  try {
    await source.backup(path.join(directory, 'logs.sqlite'))
  } finally {
    source.close()
  }
  const archiveExists = await fs.access(archiveDatabase).then(() => true, () => false)
  if (archiveExists) {
    const archive = new Database(archiveDatabase, { readonly: true, fileMustExist: true })
    try {
      await archive.backup(path.join(directory, 'logs-archive.sqlite'))
    } finally {
      archive.close()
    }
  }
}

function rowCount(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    return Number(database.prepare('SELECT COUNT(*) AS count FROM log_entries').get().count)
  } finally {
    database.close()
  }
}

process.env.AI_LOG_DB_PATH = logDatabase
const store = await import('../../../../src/core/logger/server-log-store.ts')

try {
  const source = {
    ip: '203.0.113.9',
    sourceId: 'ip-203.0.113.9',
    diagnosticCode: 'LOGV10',
    deviceProvenanceId: 'DEV-11111111111111111111111111111111',
    isRegistered: false,
  }
  assert(await store.appendServerLogEntry({
    id: 'baseline-current',
    createdAt: Date.now(),
    entryType: 'client-log',
    source,
    message: 'baseline-current',
  }))
  assert(await store.appendServerLogEntry({
    id: 'baseline-expired',
    createdAt: 1,
    entryType: 'client-log',
    source,
    message: 'baseline-expired',
  }))
  store.closeServerLogDatabaseForTests()
  await backupBaseline(backupDirectory)

  const applied = runMigration('apply')
  assert.equal(applied.ok, true)
  assert.equal(applied.expiredHotRows, 0)
  assert.equal(applied.hotRows, 1)
  assert.equal(applied.archiveRows, 1)
  assert.equal(rowCount(logDatabase), 1)
  assert.equal(rowCount(archiveDatabase), 1)

  const verified = runMigration('verify')
  assert.equal(verified.ok, true)
  assert.equal(verified.duplicateRows, 0)

  assert(await store.appendServerLogEntry({
    id: 'candidate-only',
    createdAt: Date.now(),
    entryType: 'client-log',
    source,
    message: 'candidate-only',
  }))
  store.closeServerLogDatabaseForTests()

  const rolledBack = runMigration('rollback')
  assert.equal(rolledBack.ok, true)
  assert.equal(rolledBack.archiveBaselineRestored, false)
  assert.equal(rowCount(logDatabase), 2)
  await assert.rejects(fs.access(archiveDatabase))
  assert.equal(rowCount(path.join(backupDirectory, 'logs-log-archive-v1-rollback.sqlite')), 2)
  assert.equal(
    rowCount(path.join(backupDirectory, 'logs-archive-log-archive-v1-rollback.sqlite')),
    1,
  )

  runMigration('apply')
  const existingArchiveBackup = path.join(tempRoot, 'backup-existing-archive')
  await backupBaseline(existingArchiveBackup)
  assert(await store.appendServerLogEntry({
    id: 'candidate-current-existing-archive',
    createdAt: Date.now(),
    entryType: 'client-log',
    source,
    message: 'candidate-current-existing-archive',
  }))
  assert(await store.appendServerLogEntry({
    id: 'candidate-expired-existing-archive',
    createdAt: 2,
    entryType: 'client-log',
    source,
    message: 'candidate-expired-existing-archive',
  }))
  store.closeServerLogDatabaseForTests()
  runMigration('apply')

  const existingArchiveRollback = runMigration('rollback', existingArchiveBackup)
  assert.equal(existingArchiveRollback.archiveBaselineRestored, true)
  assert.equal(rowCount(logDatabase), 1)
  assert.equal(rowCount(archiveDatabase), 1)
  assert.equal(
    rowCount(path.join(existingArchiveBackup, 'logs-log-archive-v1-rollback.sqlite')),
    2,
  )
  assert.equal(
    rowCount(path.join(existingArchiveBackup, 'logs-archive-log-archive-v1-rollback.sqlite')),
    2,
  )

  const corruptedCandidateBackup = path.join(tempRoot, 'backup-corrupted-candidate')
  await backupBaseline(corruptedCandidateBackup)
  await fs.writeFile(logDatabase, 'invalid candidate hot database')
  await fs.writeFile(archiveDatabase, 'invalid candidate archive database')
  const discardedCandidate = runMigration('rollback', corruptedCandidateBackup)
  assert.deepEqual(discardedCandidate.discarded.sort(), ['logs-archive.sqlite', 'logs.sqlite'])
  assert.equal(rowCount(logDatabase), 1)
  assert.equal(rowCount(archiveDatabase), 1)
  await fs.access(path.join(
    corruptedCandidateBackup,
    'logs-log-archive-v1-rollback.sqlite.discarded',
  ))
  await fs.access(path.join(
    corruptedCandidateBackup,
    'logs-archive-log-archive-v1-rollback.sqlite.discarded',
  ))
  console.log('[log-archive-v1-migration-smoke] PASS')
} finally {
  store.closeServerLogDatabaseForTests()
  delete process.env.AI_LOG_DB_PATH
  await fs.rm(tempRoot, { recursive: true, force: true })
}
