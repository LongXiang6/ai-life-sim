/**
 * Purpose: Define public player-content schemas and data contracts.
 * Owner: core:player-content
 * Responsibility: Contract declarations only; persistence and lifecycle behavior remain in owning services.
 */

import { z } from 'zod'

import {
  CloudGameRecordSchema,
  ReincarnationTalentSchema,
  type CloudGameRecord,
  type CloudReincarnationTalent,
} from '@/core/account/account-contract'

export const CLOUD_MANUAL_SAVE_SCHEMA_VERSION = 1
export const CLOUD_MANUAL_SAVE_SLOT = 1
export const CLOUD_MANUAL_SAVE_MAX_BYTES = 64 * 1024 * 1024
export const CLOUD_MANUAL_SAVE_MAX_COMPRESSED_BYTES = 16 * 1024 * 1024
export const CLOUD_MANUAL_SAVE_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024

const SaveSegmentSchema = z.record(z.string(), z.unknown())

export const CloudGameSavePayloadSchema = z.object({
  engine: SaveSegmentSchema,
  character: SaveSegmentSchema,
  world: SaveSegmentSchema,
  orchestrator: SaveSegmentSchema.optional(),
}).strict()

export const CloudManualSaveMetadataSchema = z.object({
  schemaVersion: z.literal(CLOUD_MANUAL_SAVE_SCHEMA_VERSION),
  slot: z.literal(CLOUD_MANUAL_SAVE_SLOT),
  name: z.string().trim().min(1).max(120),
  worldName: z.string().max(200),
  characterName: z.string().max(100),
  totalRounds: z.number().int().min(0).max(1_000_000),
  gameVersion: z.string().trim().min(1).max(32),
  savedAt: z.number().int().nonnegative(),
}).strict()

export const CloudManualSaveWriteSchema = z.object({
  metadata: CloudManualSaveMetadataSchema,
  payload: CloudGameSavePayloadSchema,
}).strict()

export const CloudGameRecordLeaderboardSchema = CloudGameRecordSchema

export const PortraitMailRequestSchema = z.object({
  recordId: z.string().min(1).max(200),
  lifeSummary: z.string().trim().min(1).max(200_000),
}).strict()

export const PlayerMailFolderSchema = z.enum(['inbox', 'sent'])

export const PlayerMailRecipientSchema = z.object({
  type: z.enum(['account', 'diagnostic']),
  value: z.string().trim().min(1),
}).strict()

/** Developer-authored reward campaign eligibility is evaluated by the mailbox service. */
export const PlayerMailRewardEligibilityModeSchema = z.enum([
  'login-window',
  'registered-account',
])

export const PlayerMailRewardTargetKindSchema = z.enum(['account', 'broadcast'])

export const PlayerMailRewardCampaignSchema = z.object({
  rewardId: z.string().trim().min(1).max(200),
  talentId: z.string().trim().min(1).max(128),
  talent: ReincarnationTalentSchema,
  targetSignature: z.string().max(5000),
  title: z.string().min(1),
  body: z.string().min(1),
  eligibilityMode: PlayerMailRewardEligibilityModeSchema,
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
}).strict().superRefine((campaign, context) => {
  if (campaign.endsAt <= campaign.startsAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: '奖励活动结束时间必须晚于开始时间',
    })
  }
  if (campaign.talent.id !== campaign.talentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['talentId'],
      message: '奖励活动天赋 ID 与天赋内容不一致',
    })
  }
})

export const PlayerMailRewardTargetSchema = z.object({
  rewardId: z.string().trim().min(1).max(200),
  messageId: z.string().trim().min(1).max(200),
  recipientKind: PlayerMailRewardTargetKindSchema,
  recipientKey: z.string().trim().min(1).nullable(),
  recipientLabel: z.string().trim().min(1).nullable(),
}).strict().superRefine((target, context) => {
  const isBroadcast = target.recipientKind === 'broadcast'
  if (isBroadcast && (target.recipientKey !== null || target.recipientLabel !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipientKey'],
      message: '全体奖励目标不应绑定单一收件身份',
    })
  }
  if (!isBroadcast && (!target.recipientKey || !target.recipientLabel)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipientKey'],
      message: '定向奖励目标必须包含收件身份',
    })
  }
})

export const PlayerMailRewardClaimSchema = z.object({
  rewardId: z.string().trim().min(1).max(200),
  accountId: z.string().trim().min(1).max(200),
  messageId: z.string().trim().min(1).max(200).nullable(),
  talentId: z.string().trim().min(1).max(128),
  talent: ReincarnationTalentSchema,
  claimedAt: z.number().int().nonnegative(),
}).strict().superRefine((claim, context) => {
  if (claim.talent.id !== claim.talentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['talentId'],
      message: '领取记录天赋 ID 与天赋内容不一致',
    })
  }
})

export const PlayerMailCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    requestId: z.string().uuid(),
    recipient: PlayerMailRecipientSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    talent: ReincarnationTalentSchema.optional(),
  }).strict(),
  z.object({ action: z.literal('read'), messageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('delete'), messageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('accept-talent'), messageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('claim-reward'), messageId: z.string().uuid() }).strict(),
])

export type CloudGameSavePayload = z.infer<typeof CloudGameSavePayloadSchema>
export type CloudManualSaveMetadata = z.infer<typeof CloudManualSaveMetadataSchema>
export type CloudManualSaveWrite = z.infer<typeof CloudManualSaveWriteSchema>
export type CloudGameRecordLeaderboard = z.infer<typeof CloudGameRecordLeaderboardSchema>
export type PortraitMailRequest = z.infer<typeof PortraitMailRequestSchema>
export type PlayerMailFolder = z.infer<typeof PlayerMailFolderSchema>
export type PlayerMailRecipient = z.infer<typeof PlayerMailRecipientSchema>
export type PlayerMailCommand = z.infer<typeof PlayerMailCommandSchema>
export type PlayerMailRewardEligibilityMode = z.infer<typeof PlayerMailRewardEligibilityModeSchema>
export type PlayerMailRewardTargetKind = z.infer<typeof PlayerMailRewardTargetKindSchema>
export type PlayerMailRewardCampaign = z.infer<typeof PlayerMailRewardCampaignSchema>
export type PlayerMailRewardTarget = z.infer<typeof PlayerMailRewardTargetSchema>
export type PlayerMailRewardClaim = z.infer<typeof PlayerMailRewardClaimSchema>

export const PlayerMailRewardClaimStatusSchema = z.enum([
  'available',
  'claimed',
  'expired',
  'not-started',
  'not-eligible',
  'login-required',
])

export type PlayerMailRewardClaimStatus = z.infer<typeof PlayerMailRewardClaimStatusSchema>

export interface CloudManualSaveSummary extends CloudManualSaveMetadata {
  compressedBytes: number
  uncompressedBytes: number
  updatedAt: number
}

export interface LeaderboardProjection {
  score: number
  rounds: number
  recordId: string
  completedAt: number
}

export interface LeaderboardEntry extends LeaderboardProjection {
  rank: number
  username: string
  characterName: string
  worldName: string
  finalAge: number
  dimensions: CloudGameRecord['dimensions']
  endingReview: NonNullable<CloudGameRecord['endingReview']> & { verse: string }
  achievements: NonNullable<CloudGameRecord['achievements']>
  portraitAssetId: string | null
  portraitAssetUrl: string | null
}

export interface PlayerMailTalentAttachment {
  status: 'pending' | 'accepted' | 'returned'
  talent: CloudReincarnationTalent
  acceptedAt: number | null
  returnedAt: number | null
}

export interface PlayerMailRewardView {
  rewardId: string
  eligibilityMode: PlayerMailRewardEligibilityMode
  startsAt: number
  endsAt: number
  talent: CloudReincarnationTalent
  claimStatus: PlayerMailRewardClaimStatus
  claimedAt: number | null
}

export interface PlayerMailMessage {
  id: string
  kind: 'message' | 'portrait'
  senderLabel: string
  recipientLabel: string
  title: string
  body: string
  recordId: string | null
  assetId: string | null
  createdAt: number
  expiresAt: number
  readAt: number | null
  talent: PlayerMailTalentAttachment | null
  reward: PlayerMailRewardView | null
}

export interface PlayerMailMessageView extends PlayerMailMessage {
  assetUrl: string | null
}

export interface PlayerMailPage {
  messages: PlayerMailMessageView[]
  nextCursor: string | null
  unreadCount: number
  diagnosticCode: string
  accountRevision: number | null
  talentReconciliation: {
    removeTalentIds: string[]
    ownedTalents: CloudReincarnationTalent[]
  }
}

export interface PlayerMailCommandResult {
  updated: boolean
  message?: PlayerMailMessageView
  acceptedTalent?: CloudReincarnationTalent
  claimedReward?: CloudReincarnationTalent
  rewardId?: string
  alreadyClaimed?: boolean
  accountRevision: number | null
}

export interface LegendaryEncounterProjection {
  sourceRecordId: string
  characterName: string
  worldName: string
  endingReview: string
  achievements: NonNullable<CloudGameRecord['achievements']>
  selectedAt: number
}

export function isLeaderboardEligible(record: CloudGameRecordLeaderboard): boolean {
  const scoring = record.scoring
  return scoring?.version === 2
    && scoring.source === 'ai'
    && Number.isInteger(record.overallScore)
    && record.overallScore >= 0
    && record.overallScore <= 100
    && record.overallScore === scoring.score
    && record.rounds > 100
    && record.dimensions.length === 5
    && scoring.integrity.passed
    && Boolean(record.endingReview?.review.trim())
    && Boolean(record.endingReview?.verse?.trim())
}
