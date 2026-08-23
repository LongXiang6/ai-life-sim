/**
 * Purpose: Define shared internal mailbox identities and persisted row shapes.
 * Owner: core:player-content
 * Responsibility: Mailbox type contracts only; no state reads or writes.
 */

export interface PlayerMailboxIdentity {
  accountId?: string
  username?: string
  diagnosticCode?: string
  deviceProvenanceId?: string
}

export interface PlayerMailboxActor {
  accountId: string | null
  diagnosticCode: string | null
  primaryKey: string
  primaryLabel: string
  keys: string[]
}

export interface StoredMailRow {
  id: string
  kind: 'message' | 'portrait'
  sender_label: string
  recipient_label: string | null
  title: string
  body: string
  record_id: string | null
  asset_id: string | null
  created_at: number
  expires_at: number
  read_at: number | null
  talent_status: 'pending' | 'accepted' | 'returned' | null
  talent_json: string | null
  accepted_at: number | null
  returned_at: number | null
  reward_id: string | null
  reward_talent_id: string | null
  reward_talent_json: string | null
  reward_eligibility_mode: 'login-window' | 'registered-account' | null
  reward_starts_at: number | null
  reward_ends_at: number | null
  reward_claimed_at: number | null
  reward_target_kind: 'account' | 'broadcast' | null
}

export interface StoredAttachmentRow {
  message_id: string
  talent_id: string
  talent_json: string
  sender_key: string
  status: 'pending' | 'accepted' | 'returned'
  accepted_by_key: string | null
  accepted_at: number | null
  returned_at: number | null
}
