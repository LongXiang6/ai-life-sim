import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import Database from 'better-sqlite3'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-mail-ops-'))
const accountPath = path.join(tempRoot, 'accounts.sqlite')
const playerContentPath = path.join(tempRoot, 'player-content.sqlite')
process.env.ACCOUNT_DB_PATH = accountPath
process.env.PLAYER_CONTENT_DB_PATH = playerContentPath

const accountDatabaseModule = await import('../../../../src/core/account/account-database.ts')
const playerDatabaseModule = await import('../../../../src/core/player-content/player-content-database.ts')

function run(...args) {
  return spawnSync(process.execPath, [
    'scripts/ops/send-player-mail.mjs',
    '--database', accountPath,
    '--player-content-database', playerContentPath,
    ...args,
  ], { cwd: process.cwd(), encoding: 'utf8' })
}

try {
  const accounts = accountDatabaseModule.getAccountDatabase()
  accounts.prepare(`
    INSERT INTO accounts(
      id, username, username_canonical, qq, password_hash, settings_json,
      character_draft_json, encrypted_api_key, save_api_key, revision,
      created_at, last_active_at
    ) VALUES ('ops-account', '运维收件人', '运维收件人', NULL, 'hash', '{}', '{}', NULL, 0, 0, 1, 1)
  `).run()
  playerDatabaseModule.getPlayerContentDatabase()
  accountDatabaseModule.closeAccountDatabaseForTests()
  playerDatabaseModule.closePlayerContentDatabaseForTests()

  const broadcast = run('--broadcast', '--title', '全体通知', '--body', '只写入一份')
  assert.equal(broadcast.status, 0, broadcast.stderr || broadcast.stdout)
  const account = run('--account', '运维收件人', '--title', '账号定向', '--body', '账号正文')
  assert.equal(account.status, 0, account.stderr || account.stdout)
  const diagnostic = run('--diagnostic', '7NGERM', '--title', '诊断定向', '--body', '诊断正文')
  assert.equal(diagnostic.status, 0, diagnostic.stderr || diagnostic.stdout)

  const inspected = new Database(playerContentPath, { readonly: true })
  try {
    assert.equal(inspected.prepare(`
      SELECT COUNT(*) AS count FROM player_mail_messages
    `).get().count, 3)
    assert.equal(inspected.prepare(`
      SELECT COUNT(*) AS count FROM player_mail_messages WHERE audience = 'broadcast'
    `).get().count, 1)
    assert.equal(inspected.prepare(`
      SELECT recipient_key FROM player_mail_messages WHERE title = '诊断定向'
    `).get().recipient_key, 'diagnostic:7NGERM')
    assert.equal(inspected.prepare(`
      SELECT COUNT(*) AS count FROM diagnostic_mailboxes WHERE diagnostic_code = '7NGERM'
    `).get().count, 1)
  } finally {
    inspected.close()
  }

  const invalid = run('--diagnostic', 'BAD001', '--title', '无效', '--body', '不应发送')
  assert.notEqual(invalid.status, 0)
  console.log('[player-mail-ops-smoke] PASS')
} finally {
  accountDatabaseModule.closeAccountDatabaseForTests()
  playerDatabaseModule.closePlayerContentDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
