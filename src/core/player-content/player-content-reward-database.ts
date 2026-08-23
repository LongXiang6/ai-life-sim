/**
 * Purpose: Create and upgrade player-content mailbox reward persistence.
 * Owner: core:player-content
 * Responsibility: Reward campaign, target, claim tables, indexes, and additive v7 columns only.
 */

import type Database from 'better-sqlite3'

export function ensureMailboxRewardSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS player_mail_reward_campaigns (
      reward_id TEXT PRIMARY KEY,
      talent_id TEXT NOT NULL,
      talent_json TEXT NOT NULL,
      target_signature TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      eligibility_mode TEXT NOT NULL
        CHECK (eligibility_mode IN ('login-window', 'registered-account')),
      starts_at INTEGER NOT NULL CHECK (starts_at >= 0),
      ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
      created_at INTEGER NOT NULL CHECK (created_at >= 0)
    );
    CREATE INDEX IF NOT EXISTS player_mail_reward_campaigns_window_idx
      ON player_mail_reward_campaigns(starts_at, ends_at, reward_id);

    CREATE TABLE IF NOT EXISTS player_mail_reward_targets (
      reward_id TEXT NOT NULL
        REFERENCES player_mail_reward_campaigns(reward_id) ON DELETE CASCADE,
      message_id TEXT NOT NULL
        REFERENCES player_mail_messages(id) ON DELETE CASCADE,
      recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('account', 'broadcast')),
      recipient_key TEXT,
      recipient_label TEXT,
      PRIMARY KEY (reward_id, message_id),
      CHECK (
        (recipient_kind = 'broadcast' AND recipient_key IS NULL AND recipient_label IS NULL)
        OR (recipient_kind = 'account' AND recipient_key IS NOT NULL AND recipient_label IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS player_mail_reward_targets_account_idx
      ON player_mail_reward_targets(reward_id, recipient_key)
      WHERE recipient_kind = 'account';
    CREATE UNIQUE INDEX IF NOT EXISTS player_mail_reward_targets_broadcast_idx
      ON player_mail_reward_targets(reward_id)
      WHERE recipient_kind = 'broadcast';
    CREATE UNIQUE INDEX IF NOT EXISTS player_mail_reward_targets_message_unique_idx
      ON player_mail_reward_targets(message_id);
    CREATE INDEX IF NOT EXISTS player_mail_reward_targets_recipient_idx
      ON player_mail_reward_targets(recipient_key, reward_id)
      WHERE recipient_kind = 'account';

    CREATE TABLE IF NOT EXISTS player_mail_reward_claims (
      reward_id TEXT NOT NULL
        REFERENCES player_mail_reward_campaigns(reward_id) ON DELETE RESTRICT,
      account_id TEXT NOT NULL,
      message_id TEXT
        REFERENCES player_mail_messages(id) ON DELETE SET NULL,
      talent_id TEXT NOT NULL,
      talent_json TEXT NOT NULL,
      claimed_at INTEGER NOT NULL CHECK (claimed_at >= 0),
      PRIMARY KEY (reward_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS player_mail_reward_claims_account_idx
      ON player_mail_reward_claims(account_id, claimed_at DESC, reward_id);
    CREATE INDEX IF NOT EXISTS player_mail_reward_claims_reward_idx
      ON player_mail_reward_claims(reward_id, claimed_at DESC, account_id);
    CREATE INDEX IF NOT EXISTS player_mail_reward_claims_talent_idx
      ON player_mail_reward_claims(account_id, talent_id);
  `)

  const columns = () => new Set(
    (database.pragma('table_info(player_mail_reward_campaigns)') as Array<{ name: string }>)
      .map((column) => column.name),
  )
  let current = columns()
  if (!current.has('target_signature')) {
    database.exec("ALTER TABLE player_mail_reward_campaigns ADD COLUMN target_signature TEXT NOT NULL DEFAULT ''")
    current = columns()
  }
  if (!current.has('title')) {
    database.exec("ALTER TABLE player_mail_reward_campaigns ADD COLUMN title TEXT NOT NULL DEFAULT ''")
    current = columns()
  }
  if (!current.has('body')) {
    database.exec("ALTER TABLE player_mail_reward_campaigns ADD COLUMN body TEXT NOT NULL DEFAULT ''")
  }
}
