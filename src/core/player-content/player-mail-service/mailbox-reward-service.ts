/**
 * Purpose: Claim developer-authored mailbox reward campaigns for authenticated accounts.
 * Owner: core:player-content
 * Responsibility: Reward eligibility, one-time claim ledger, and account-library insertion only.
 */

import { ReincarnationTalentSchema, type CloudReincarnationTalent } from '@/core/account/account-contract'

import type { PlayerMailCommandResult } from '../player-content-contract'
import { PlayerContentServiceError } from '../player-content-error'
import {
  accountKey,
  accountRevision,
  ensureAccountStoreAttached,
  parseTalent,
  resolveActor,
} from './mailbox-identity'
import {
  getAccessibleMessage,
  readMessageById,
  stateRecipientKey,
} from './mailbox-read-service'
import { addTalentToAttachedAccount } from './mailbox-talent-storage'
import type { PlayerMailboxIdentity } from './types'

interface RewardRow {
  reward_id: string
  talent_json: string
  eligibility_mode: 'login-window' | 'registered-account'
  starts_at: number
  ends_at: number
  recipient_kind: 'account' | 'broadcast'
  recipient_key: string | null
}

function rewardEligibilityError(
  mode: RewardRow['eligibility_mode'],
  account: { created_at: number; last_active_at: number },
  startsAt: number,
  endsAt: number,
  now: number,
): PlayerContentServiceError | null {
  if (mode === 'login-window'
    && (account.last_active_at < startsAt || account.last_active_at > now)) {
    return new PlayerContentServiceError('需要在礼包有效时间内登录过后领取', 409, 'mail_reward_not_eligible')
  }
  if (mode === 'registered-account' && account.created_at > endsAt) {
    return new PlayerContentServiceError('该礼包只面向活动结束前已注册的账号', 409, 'mail_reward_not_eligible')
  }
  return null
}

export function claimPlayerMailboxReward(input: {
  identity: PlayerMailboxIdentity
  messageId: string
  now?: number
}): PlayerMailCommandResult {
  const now = input.now ?? Date.now()
  const actor = resolveActor(input.identity, now)
  if (!actor.accountId) {
    throw new PlayerContentServiceError('登录账号后才能领取礼包天赋', 401, 'mail_reward_login_required')
  }
  const accountId = actor.accountId
  const accessible = getAccessibleMessage(actor, input.messageId, now)
  const database = ensureAccountStoreAttached()
  const stateKey = stateRecipientKey(actor, accessible)
  const deleted = database.prepare(`
    SELECT deleted_at FROM player_mail_recipient_states
    WHERE message_id = ? AND recipient_key = ?
  `).get(input.messageId, stateKey) as { deleted_at: number | null } | undefined
  if (deleted && deleted.deleted_at !== null) {
    throw new PlayerContentServiceError('这封邮件已删除，不能领取其中的礼包', 409, 'mail_reward_deleted')
  }
  let claimedTalent: CloudReincarnationTalent | undefined
  let rewardId = ''
  let alreadyClaimed = false

  database.transaction(() => {
    const reward = database.prepare(`
      SELECT campaigns.reward_id, campaigns.talent_json, campaigns.eligibility_mode,
        campaigns.starts_at, campaigns.ends_at,
        targets.recipient_kind, targets.recipient_key
      FROM player_mail_reward_targets AS targets
      JOIN player_mail_reward_campaigns AS campaigns
        ON campaigns.reward_id = targets.reward_id
      WHERE targets.message_id = ?
    `).get(input.messageId) as RewardRow | undefined
    if (!reward) {
      throw new PlayerContentServiceError('这封邮件不是礼包邮件', 409, 'mail_not_reward')
    }
    if (reward.recipient_kind === 'account' && reward.recipient_key !== accountKey(accountId)) {
      throw new PlayerContentServiceError('该礼包不属于当前账号', 403, 'mail_reward_not_targeted')
    }
    rewardId = reward.reward_id
    const existing = database.prepare(`
      SELECT talent_json FROM player_mail_reward_claims
      WHERE reward_id = ? AND account_id = ?
    `).get(reward.reward_id, accountId) as { talent_json: string } | undefined
    if (existing) {
      alreadyClaimed = true
      claimedTalent = parseTalent(existing.talent_json)
      return
    }
    if (now < reward.starts_at) {
      throw new PlayerContentServiceError('礼包尚未开始领取', 409, 'mail_reward_not_started')
    }
    if (now >= reward.ends_at) {
      throw new PlayerContentServiceError('礼包已超过领取期限', 409, 'mail_reward_expired')
    }
    const account = database.prepare(`
      SELECT created_at, last_active_at FROM account_store.accounts WHERE id = ?
    `).get(accountId) as { created_at: number; last_active_at: number } | undefined
    if (!account) {
      throw new PlayerContentServiceError('登录账号不存在', 401, 'mailbox_identity_required')
    }
    const eligibilityError = rewardEligibilityError(
      reward.eligibility_mode,
      account,
      reward.starts_at,
      reward.ends_at,
      now,
    )
    if (eligibilityError) throw eligibilityError

    const talent = ReincarnationTalentSchema.parse(JSON.parse(reward.talent_json))
    const claimInsert = database.prepare(`
      INSERT INTO player_mail_reward_claims(
        reward_id, account_id, message_id, talent_id, talent_json, claimed_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(reward_id, account_id) DO NOTHING
    `).run(
      reward.reward_id,
      accountId,
      input.messageId,
      talent.id,
      JSON.stringify(talent),
      now,
    )
    if (claimInsert.changes === 0) {
      const concurrent = database.prepare(`
        SELECT talent_json FROM player_mail_reward_claims
        WHERE reward_id = ? AND account_id = ?
      `).get(reward.reward_id, accountId) as { talent_json: string } | undefined
      if (!concurrent) {
        throw new PlayerContentServiceError('礼包领取状态暂时无法确认', 503, 'mail_reward_claim_unconfirmed')
      }
      alreadyClaimed = true
      claimedTalent = parseTalent(concurrent.talent_json)
      return
    }
    const insertedClaim = database.prepare(`
      SELECT talent_json FROM player_mail_reward_claims
      WHERE reward_id = ? AND account_id = ?
    `).get(reward.reward_id, accountId) as { talent_json: string } | undefined
    if (!insertedClaim) {
      throw new PlayerContentServiceError('礼包领取状态暂时无法确认', 503, 'mail_reward_claim_unconfirmed')
    }
    if (insertedClaim.talent_json !== JSON.stringify(talent)) {
      alreadyClaimed = true
      claimedTalent = parseTalent(insertedClaim.talent_json)
      return
    }
    const added = addTalentToAttachedAccount(database, accountId, talent, now)
    if (!added) {
      const alreadyOwned = database.prepare(`
        SELECT data_json FROM account_store.account_reincarnation_talents
        WHERE account_id = ? AND talent_id = ?
      `).get(accountId, talent.id) as { data_json: string } | undefined
      if (alreadyOwned && JSON.stringify(JSON.parse(alreadyOwned.data_json)) !== JSON.stringify(talent)) {
        throw new PlayerContentServiceError('礼包天赋 ID 已对应不同内容', 409, 'mail_reward_talent_conflict')
      }
      if (!alreadyOwned) {
        throw new PlayerContentServiceError('轮回天赋栏位已满，请先腾出位置', 409, 'reincarnation_library_full')
      }
    }
    database.prepare(`
      INSERT INTO player_mail_recipient_states(message_id, recipient_key, read_at)
      VALUES (?, ?, ?)
      ON CONFLICT(message_id, recipient_key) DO UPDATE SET
        read_at = COALESCE(player_mail_recipient_states.read_at, excluded.read_at)
    `).run(input.messageId, stateKey, now)
    claimedTalent = talent
  })()

  return {
    updated: !alreadyClaimed,
    message: readMessageById(input.messageId, stateKey),
    claimedReward: claimedTalent,
    rewardId,
    alreadyClaimed,
    accountRevision: accountRevision(accountId),
  }
}
