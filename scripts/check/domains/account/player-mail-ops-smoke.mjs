/**
 * Purpose: Regress operator mailbox delivery and developer reward claim behavior.
 * Owner: quality:account
 * Responsibility: One isolated mail-operations and reward-campaign smoke transaction only.
 */

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
  accounts.prepare(`
    INSERT INTO accounts(
      id, username, username_canonical, qq, password_hash, settings_json,
      character_draft_json, encrypted_api_key, save_api_key, revision,
      created_at, last_active_at
    ) VALUES ('ops-second', '运维第二收件人', '运维第二收件人', NULL, 'hash', '{}', '{}', NULL, 0, 0, 1, 1)
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

  const rewardStartsAt = Date.now() - 1_000
  const rewardEndsAt = rewardStartsAt + 3 * 24 * 60 * 60 * 1000
  const reopenedAccounts = accountDatabaseModule.getAccountDatabase()
  reopenedAccounts.prepare('UPDATE accounts SET created_at = ?, last_active_at = ? WHERE id = ?')
    .run(rewardStartsAt - 1_000, rewardStartsAt, 'ops-account')
  accountDatabaseModule.closeAccountDatabaseForTests()
  const rewardTalent = {
    id: 'ops-reward-talent',
    lineageId: 'ops-reward-lineage',
    version: 1,
    name: '运维礼包天赋',
    description: '用于验证礼包领取的普通天赋。',
    category: 'creation',
    rarity: 'common',
    effect: '进入账号轮回天赋库。',
    attrBonus: { mind: 1, luck: 2 },
    strengthenLevel: 0,
    acquiredAt: rewardStartsAt,
    source: { worldName: '运维测试', characterName: '礼包领取者', runId: 'ops-reward' },
  }
  const reward = run(
    '--broadcast', '--title', '礼包通知', '--body', '领取一份运维测试天赋',
    '--reward-id', 'ops-reward-campaign', '--talent-json', JSON.stringify(rewardTalent),
    '--starts-at', String(rewardStartsAt), '--ends-at', String(rewardEndsAt),
  )
  assert.equal(reward.status, 0, reward.stderr || reward.stdout)
  const rewardAgain = run(
    '--broadcast', '--title', '礼包通知', '--body', '领取一份运维测试天赋',
    '--reward-id', 'ops-reward-campaign', '--talent-json', JSON.stringify(rewardTalent),
    '--starts-at', String(rewardStartsAt), '--ends-at', String(rewardEndsAt),
  )
  assert.equal(rewardAgain.status, 0, rewardAgain.stderr || rewardAgain.stdout)
  assert.match(rewardAgain.stdout, /"created":false/)
  const rewardWithImplicitWindow = run(
    '--broadcast', '--title', '礼包通知', '--body', '领取一份运维测试天赋',
    '--reward-id', 'ops-reward-campaign', '--talent-json', JSON.stringify(rewardTalent),
  )
  assert.equal(rewardWithImplicitWindow.status, 0, rewardWithImplicitWindow.stderr || rewardWithImplicitWindow.stdout)
  assert.match(rewardWithImplicitWindow.stdout, /"created":false/)
  const playerMail = await import('../../../../src/core/player-content/player-mail-service.ts')
  const rewardPage = playerMail.readPlayerMailboxPage({
    identity: { accountId: 'ops-account', username: '运维收件人' },
    folder: 'inbox',
    now: rewardStartsAt + 100,
  })
  const rewardMessage = rewardPage.messages.find((message) => message.reward?.rewardId === 'ops-reward-campaign')
  assert.ok(rewardMessage)
  assert.equal(rewardMessage.reward.claimStatus, 'available')
  assert.equal(playerMail.claimPlayerMailboxReward({
    identity: { accountId: 'ops-account', username: '运维收件人' },
    messageId: rewardMessage.id,
    now: rewardStartsAt + 100,
  }).updated, true)
  const repeatedReward = playerMail.claimPlayerMailboxReward({
    identity: { accountId: 'ops-account', username: '运维收件人' },
    messageId: rewardMessage.id,
    now: rewardStartsAt + 101,
  })
  assert.equal(repeatedReward.updated, false)
  const verifiedAccounts = accountDatabaseModule.getAccountDatabase()
  assert.equal(verifiedAccounts.prepare(`
    SELECT COUNT(*) AS count FROM account_reincarnation_talents
    WHERE account_id = 'ops-account' AND talent_id = ?
  `).get(rewardTalent.id).count, 1)
  accountDatabaseModule.closeAccountDatabaseForTests()

  const directReward = run(
    '--account', '运维收件人', '--account', '运维第二收件人',
    '--title', '定向礼包', '--body', '只给两个账号的测试天赋',
    '--reward-id', 'ops-reward-direct', '--talent-json', JSON.stringify({ ...rewardTalent, id: 'ops-reward-direct-talent' }),
    '--eligibility', 'registered-account', '--starts-at', String(rewardStartsAt), '--ends-at', String(rewardEndsAt),
  )
  assert.equal(directReward.status, 0, directReward.stderr || directReward.stdout)
  const directMail = await import('../../../../src/core/player-content/player-mail-service.ts')
  for (const [accountId, username] of [['ops-account', '运维收件人'], ['ops-second', '运维第二收件人']]) {
    const page = directMail.readPlayerMailboxPage({ identity: { accountId, username }, folder: 'inbox', now: rewardStartsAt + 200 })
    const message = page.messages.find((item) => item.reward?.rewardId === 'ops-reward-direct')
    assert.ok(message)
    assert.equal(message.reward.claimStatus, 'available')
    assert.equal(directMail.claimPlayerMailboxReward({ identity: { accountId, username }, messageId: message.id, now: rewardStartsAt + 200 }).updated, true)
  }
  const deletedReward = run(
    '--broadcast', '--title', '删除礼包', '--body', '删除后不能领取',
    '--reward-id', 'ops-reward-deleted', '--talent-json', JSON.stringify({ ...rewardTalent, id: 'ops-reward-deleted-talent' }),
    '--starts-at', String(rewardStartsAt), '--ends-at', String(rewardEndsAt),
  )
  assert.equal(deletedReward.status, 0, deletedReward.stderr || deletedReward.stdout)
  const deletedPage = directMail.readPlayerMailboxPage({ identity: { accountId: 'ops-second', username: '运维第二收件人' }, folder: 'inbox', now: rewardStartsAt + 250 })
  const deletedMessage = deletedPage.messages.find((item) => item.reward?.rewardId === 'ops-reward-deleted')
  assert.ok(deletedMessage)
  directMail.deletePlayerMailboxMessage({ identity: { accountId: 'ops-second', username: '运维第二收件人' }, messageId: deletedMessage.id, now: rewardStartsAt + 251 })
  assert.throws(() => directMail.claimPlayerMailboxReward({ identity: { accountId: 'ops-second', username: '运维第二收件人' }, messageId: deletedMessage.id, now: rewardStartsAt + 252 }), (error) => error?.code === 'mail_reward_deleted')
  console.log('[player-mail-ops-smoke] PASS')
} finally {
  accountDatabaseModule.closeAccountDatabaseForTests()
  playerDatabaseModule.closePlayerContentDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
