import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import Database from 'better-sqlite3'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-mail-migration-'))
const databasePath = path.join(tempRoot, 'player-content.sqlite')
process.env.PLAYER_CONTENT_DB_PATH = databasePath

const createdAt = 1_000_000
const legacy = new Database(databasePath)
legacy.exec(`
  CREATE TABLE player_content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO player_content_meta(key, value) VALUES ('schema_version', '4');
  CREATE TABLE player_mail_messages (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('portrait')),
    record_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    asset_id TEXT,
    created_at INTEGER NOT NULL,
    read_at INTEGER,
    UNIQUE(account_id, record_id, kind)
  );
  CREATE INDEX player_mail_messages_account_idx
    ON player_mail_messages(account_id, created_at DESC);
`)
legacy.prepare(`
  INSERT INTO player_mail_messages(
    id, account_id, kind, record_id, title, body, asset_id, created_at, read_at
  ) VALUES ('legacy-mail', 'legacy-account', 'portrait', 'legacy-record',
    '旧画像', '旧正文', 'legacy-asset', ?, ?)
`).run(createdAt, createdAt + 10)
legacy.close()

const databaseModule = await import('../../../../src/core/player-content/player-content-database.ts')
try {
  const migrated = databaseModule.getPlayerContentDatabase()
  assert.equal(migrated.prepare(`
    SELECT value FROM player_content_meta WHERE key = 'schema_version'
  `).get().value, '5')
  const message = migrated.prepare(`
    SELECT audience, kind, sender_key, recipient_key, record_id, expires_at
    FROM player_mail_messages WHERE id = 'legacy-mail'
  `).get()
  assert.deepEqual(message, {
    audience: 'direct',
    kind: 'portrait',
    sender_key: 'system:portrait',
    recipient_key: 'account:legacy-account',
    record_id: 'legacy-record',
    expires_at: createdAt + databaseModule.PLAYER_MAIL_RETENTION_MS,
  })
  assert.deepEqual(migrated.prepare(`
    SELECT recipient_key, read_at FROM player_mail_recipient_states
    WHERE message_id = 'legacy-mail'
  `).get(), {
    recipient_key: 'account:legacy-account',
    read_at: createdAt + 10,
  })
  assert.equal(migrated.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_master
    WHERE type = 'table' AND name = 'player_mail_messages_v4'
  `).get().count, 0)
  console.log('[player-mail-migration-smoke] PASS')
} finally {
  databaseModule.closePlayerContentDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}

const deploymentRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-mail-deployment-migration-'))
const deploymentDatabase = path.join(deploymentRoot, 'player-content.sqlite')
const accountDatabase = path.join(deploymentRoot, 'accounts.sqlite')
const backupDirectory = path.join(deploymentRoot, 'backup')
const baseline = path.join(backupDirectory, 'player-content.sqlite')
const rollbackArchive = path.join(backupDirectory, 'player-content-mailbox-v5-rollback.sqlite')
const restoreTemp = `${deploymentDatabase}.mailbox-v5-restore`
const projectRoot = process.cwd()
const migrationCommand = path.join('scripts', 'ops', 'migrate-player-mailbox-v5.ts')
const typescriptLoader = pathToFileURL(path.join(projectRoot, 'scripts', 'check', 'lib', 'typescript-loader.mjs')).href

function runMigration(mode, ...args) {
  return execFileSync(process.execPath, [
    '--no-warnings=ExperimentalWarning',
    '--loader', typescriptLoader,
    migrationCommand,
    mode,
    '--player-content-database', deploymentDatabase,
    '--account-database', accountDatabase,
    ...args,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
}

try {
  await fs.mkdir(backupDirectory)
  new Database(accountDatabase).close()
  const source = new Database(deploymentDatabase)
  source.exec(`
    CREATE TABLE player_content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO player_content_meta(key, value) VALUES ('schema_version', '4');
    CREATE TABLE player_mail_messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('portrait')),
      record_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      asset_id TEXT,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      UNIQUE(account_id, record_id, kind)
    );
    CREATE INDEX player_mail_messages_account_idx
      ON player_mail_messages(account_id, created_at DESC);
  `)
  await source.backup(baseline)
  source.close()

  assert.match(runMigration('apply'), /"after":"5"/)
  assert.match(runMigration('verify'), /"version":"5"/)

  const migrated = new Database(deploymentDatabase)
  migrated.exec(`CREATE TABLE rollback_probe(value TEXT NOT NULL); INSERT INTO rollback_probe VALUES ('preserved');`)
  await migrated.backup(rollbackArchive)
  migrated.close()
  await fs.writeFile(restoreTemp, 'incomplete restore')

  assert.match(
    runMigration('rollback', '--backup-directory', backupDirectory),
    /"restored":true/,
  )
  const restored = new Database(deploymentDatabase, { readonly: true })
  assert.equal(restored.prepare(`SELECT value FROM player_content_meta WHERE key = 'schema_version'`).get().value, '4')
  assert.equal(restored.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'rollback_probe'`).get().count, 0)
  restored.close()

  const archived = new Database(rollbackArchive, { readonly: true })
  assert.equal(archived.prepare(`SELECT value FROM player_content_meta WHERE key = 'schema_version'`).get().value, '5')
  assert.equal(archived.prepare(`SELECT value FROM rollback_probe`).get().value, 'preserved')
  archived.close()
  assert.match(
    runMigration('rollback', '--backup-directory', backupDirectory),
    /"reason":"already-v4"/,
  )
  console.log('[player-mail-deployment-migration-smoke] PASS')
} finally {
  await fs.rm(deploymentRoot, { recursive: true, force: true })
}
