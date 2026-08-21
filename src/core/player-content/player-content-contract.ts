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
])

export type CloudGameSavePayload = z.infer<typeof CloudGameSavePayloadSchema>
export type CloudManualSaveMetadata = z.infer<typeof CloudManualSaveMetadataSchema>
export type CloudManualSaveWrite = z.infer<typeof CloudManualSaveWriteSchema>
export type CloudGameRecordLeaderboard = z.infer<typeof CloudGameRecordLeaderboardSchema>
export type PortraitMailRequest = z.infer<typeof PortraitMailRequestSchema>
export type PlayerMailFolder = z.infer<typeof PlayerMailFolderSchema>
export type PlayerMailRecipient = z.infer<typeof PlayerMailRecipientSchema>
export type PlayerMailCommand = z.infer<typeof PlayerMailCommandSchema>

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
