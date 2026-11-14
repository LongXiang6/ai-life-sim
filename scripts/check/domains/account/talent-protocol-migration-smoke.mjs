/**
 * Purpose: Verify one-time talent cleanup is atomic, idempotent, and narrowly scoped.
 * Owner: quality:account
 * Responsibility: Isolated local persistence and SQLite migration fixtures only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

class MemoryStorage {
  data = new Map()
  get length() { return this.data.size }
  key(index) { return [...this.data.keys()][index] ?? null }
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(String(key), String(value)) }
  removeItem(key) { this.data.delete(key) }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
const oldTalent = { id: 'old', name: '旧天赋', category: 'battle', rarity: 'mythic', strengthenLevel: 3 }
storage.setItem('mod-character:persist:character-state', JSON.stringify({ version: 11, state: {
  name: '保留角色', background: '保留完整背景', gender: 'female', race: 'human', age: 25,
  characterBase: { base: { mind: 3, physique: 2, charisma: 1, familyBackground: 4 }, startingAge: 18 },
  destinyPatterns: { patterns: [oldTalent], candidates: [oldTalent], growthHistory: [oldTalent] },
  equippedReincarnationTalents: [oldTalent],
} }))
storage.setItem('mod-character:persist:reincarnation-library', JSON.stringify({ version: 1, state: { talents: [oldTalent] } }))
storage.setItem('ai-life-sim:mod-character:cache:destiny-pool:9.3.0:1', JSON.stringify({ data: [oldTalent], ts: 1 }))
storage.setItem('ai-life-sim:mod-pages:config:talent-draw:1', JSON.stringify({ phase: 'selecting', slots: [oldTalent] }))
storage.setItem('unrelated-draft', 'preserve-byte-for-byte')

const { useCharacterStore } = await import('../../../../src/mods/mod-character/store.ts')
const { useReincarnationLibraryStore } = await import('../../../../src/mods/mod-character/reincarnation-library-store.ts')
const { loadDestinyPatternPool } = await import('../../../../src/mods/mod-character/utils/destiny-pattern-pool-cache.ts')
const { hasTalentDrawState } = await import('../../../../src/mods/mod-pages/pages/talent-draw/talent-draw-storage.ts')
const character = useCharacterStore.getState()
assert.equal(character.name, '保留角色')
assert.equal(character.background, '保留完整背景')
assert.equal(character.characterBase.base.mind, 3)
assert.deepEqual(character.destinyPatterns.patterns, [])
assert.deepEqual(character.destinyPatterns.candidates, [])
assert.deepEqual(character.destinyPatterns.growthHistory, [])
assert.deepEqual(character.equippedReincarnationTalents, [])
assert.deepEqual(useReincarnationLibraryStore.getState().talents, [])
assert.deepEqual(loadDestinyPatternPool(1), [])
assert.equal(hasTalentDrawState(1), false)
assert.equal(storage.getItem('ai-life-sim:mod-character:cache:destiny-pool:9.3.0:1'), null)
assert.equal(storage.getItem('unrelated-draft'), 'preserve-byte-for-byte')
const newTalent = {
  id: 'new', lineageId: 'new-lineage', version: 1, name: '新天赋', category: 'perception',
  aptitudeTier: 2, developmentStage: 'awakening', description: '新描述', effect: '新效果',
  attrBonus: { mind: 1 }, apexStrengthenLevel: 0, acquiredAt: 1,
  source: { worldName: '世界', characterName: '角色' },
}
useReincarnationLibraryStore.getState().addReincarnationTalent(newTalent)
await useReincarnationLibraryStore.persist.rehydrate()
await useCharacterStore.persist.rehydrate()
assert.equal(useReincarnationLibraryStore.getState().talents[0].id, 'new')
assert.equal(useCharacterStore.getState().name, '保留角色')

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'talent-migration-'))
process.env.ACCOUNT_DB_PATH = path.join(temp, 'accounts.sqlite')
process.env.PLAYER_CONTENT_DB_PATH = path.join(temp, 'content.sqlite')
const accounts = await import('../../../../src/core/account/account-database.ts')
const content = await import('../../../../src/core/player-content/player-content-database.ts')
const talentTables = ['player_mail_talent_attachments', 'player_mail_talent_ownership', 'player_mail_reward_claims', 'player_mail_reward_targets', 'player_mail_reward_campaigns']
try {
  const db = accounts.getAccountDatabase()
  db.prepare(`INSERT INTO accounts(id, username, username_canonical, password_hash, settings_json, character_draft_json, created_at, last_active_at)
    VALUES ('owner', 'owner', 'owner', 'hash', ?, ?, 1, 1)`).run('{"custom":"keep-settings"}', '{"background":"keep-draft"}')
  db.prepare('INSERT INTO account_game_records VALUES (?, 1, ?, ?, 1)').run('owner', 'life', '{"record":"keep-life"}')
  db.prepare('INSERT INTO account_reincarnation_talents VALUES (?, 1, ?, ?, 1)').run('owner', 'old', JSON.stringify(oldTalent))
  db.exec(`UPDATE account_meta SET value = '9' WHERE key = 'schema_version';
    CREATE TRIGGER fail_cleanup BEFORE DELETE ON account_reincarnation_talents BEGIN SELECT RAISE(ABORT, 'atomic-probe'); END;`)
  accounts.closeAccountDatabaseForTests()
  assert.throws(() => accounts.getAccountDatabase(), /atomic-probe/)
  const probe = new Database(process.env.ACCOUNT_DB_PATH)
  assert.equal(probe.prepare("SELECT value FROM account_meta WHERE key = 'schema_version'").get().value, '9')
  assert.equal(probe.prepare('SELECT COUNT(*) AS count FROM account_reincarnation_talents').get().count, 1)
  probe.exec('DROP TRIGGER fail_cleanup')
  probe.close()
  const migrated = accounts.getAccountDatabase()
  assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM account_reincarnation_talents').get().count, 0)
  const preserved = migrated.prepare('SELECT settings_json, character_draft_json FROM accounts').get()
  assert.deepEqual(preserved, { settings_json: '{"custom":"keep-settings"}', character_draft_json: '{"background":"keep-draft"}' })
  assert.equal(migrated.prepare('SELECT data_json FROM account_game_records').get().data_json, '{"record":"keep-life"}')
  migrated.prepare('INSERT INTO account_reincarnation_talents VALUES (?, 1, ?, ?, 2)').run('owner', 'new', JSON.stringify(newTalent))
  accounts.closeAccountDatabaseForTests()
  assert.equal(accounts.getAccountDatabase().prepare('SELECT talent_id FROM account_reincarnation_talents').get().talent_id, 'new')

  const player = content.getPlayerContentDatabase()
  player.exec(`INSERT INTO player_mail_messages(id, audience, kind, sender_key, sender_label, title, body, created_at, expires_at)
      VALUES ('mail', 'broadcast', 'message', 'system', '系统', '保留标题', '保留邮件正文', 1, 9999999999999);
    INSERT INTO player_mail_talent_attachments(message_id, talent_id, talent_json, sender_key, status) VALUES ('mail', 'old', '{}', 'system', 'pending');
    INSERT INTO player_mail_talent_ownership VALUES ('old', 'owner', '{}', 'mail', 1);
    INSERT INTO player_mail_reward_campaigns(reward_id, talent_id, talent_json, eligibility_mode, starts_at, ends_at, created_at)
      VALUES ('reward', 'old', '{}', 'registered-account', 1, 2, 1);
    INSERT INTO player_mail_reward_targets(reward_id, message_id, recipient_kind) VALUES ('reward', 'mail', 'broadcast');
    INSERT INTO player_mail_reward_claims VALUES ('reward', 'owner', 'mail', 'old', '{}', 1);
    CREATE TABLE unrelated_probe(value TEXT); INSERT INTO unrelated_probe VALUES ('keep');
    UPDATE player_content_meta SET value = '9' WHERE key = 'schema_version';
    CREATE TRIGGER fail_cleanup BEFORE DELETE ON player_mail_reward_claims BEGIN SELECT RAISE(ABORT, 'atomic-probe'); END;`)
  content.closePlayerContentDatabaseForTests()
  assert.throws(() => content.getPlayerContentDatabase(), /atomic-probe/)
  const playerProbe = new Database(process.env.PLAYER_CONTENT_DB_PATH)
  assert.equal(playerProbe.prepare("SELECT value FROM player_content_meta WHERE key = 'schema_version'").get().value, '9')
  for (const table of talentTables) assert.equal(playerProbe.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 1)
  playerProbe.exec('DROP TRIGGER fail_cleanup')
  playerProbe.close()
  const migratedPlayer = content.getPlayerContentDatabase()
  for (const table of talentTables) assert.equal(migratedPlayer.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0)
  assert.equal(migratedPlayer.prepare('SELECT body FROM player_mail_messages').get().body, '保留邮件正文')
  assert.equal(migratedPlayer.prepare('SELECT value FROM unrelated_probe').get().value, 'keep')
  migratedPlayer.prepare('INSERT INTO player_mail_talent_ownership VALUES (?, ?, ?, ?, 2)').run('new', 'owner', JSON.stringify(newTalent), 'mail')
  content.closePlayerContentDatabaseForTests()
  assert.equal(content.getPlayerContentDatabase().prepare('SELECT talent_id FROM player_mail_talent_ownership').get().talent_id, 'new')
  console.log('[talent-protocol-migration] PASS local-reset account-atomic player-atomic idempotent unrelated-preserved')
} finally {
  accounts.closeAccountDatabaseForTests()
  content.closePlayerContentDatabaseForTests()
  await fs.rm(temp, { recursive: true, force: true })
}
