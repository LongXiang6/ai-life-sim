import { z } from 'zod'

import {
  CloudGameRecordSchema,
  type CloudGameRecord,
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

export type CloudGameSavePayload = z.infer<typeof CloudGameSavePayloadSchema>
export type CloudManualSaveMetadata = z.infer<typeof CloudManualSaveMetadataSchema>
export type CloudManualSaveWrite = z.infer<typeof CloudManualSaveWriteSchema>
export type CloudGameRecordLeaderboard = z.infer<typeof CloudGameRecordLeaderboardSchema>
export type PortraitMailRequest = z.infer<typeof PortraitMailRequestSchema>

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
  endingReview: NonNullable<CloudGameRecord['endingReview']>
  achievements: NonNullable<CloudGameRecord['achievements']>
  portraitAssetId: string | null
  portraitAssetUrl: string | null
}

export interface PlayerMailMessage {
  id: string
  kind: 'portrait'
  recordId: string
  title: string
  body: string
  assetId: string | null
  createdAt: number
  readAt: number | null
  status: 'processing' | 'failed' | 'ready'
  errorCode?: string
}

export interface PlayerMailMessageView extends PlayerMailMessage {
  assetUrl: string | null
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
  return Number.isInteger(record.overallScore)
    && record.overallScore > 97
    && record.overallScore <= 100
    && record.scoring?.validCompletedLife === true
    && record.scoring.integrity.passed
    && (record.overallScore < 100 || record.scoring.integrity.perfectGatePassed)
    && Boolean(record.endingReview?.review.trim())
}
