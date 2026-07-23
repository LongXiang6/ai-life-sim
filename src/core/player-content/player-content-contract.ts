import { z } from 'zod'

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

export const CloudGameRecordLeaderboardSchema = z.object({
  recordId: z.string().min(1).max(200),
  completedAt: z.number().int().nonnegative(),
  characterName: z.string().min(1).max(100),
  worldName: z.string().min(1).max(200),
  finalAge: z.number().finite().nonnegative(),
  rounds: z.number().int().nonnegative().max(1_000_000),
  overallScore: z.number().finite().min(0).max(100),
}).strict()

export const PortraitMailRequestSchema = z.object({
  recordId: z.string().min(1).max(200),
  lifeSummary: z.string().trim().min(1),
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
}

export function isLeaderboardEligible(record: CloudGameRecordLeaderboard): boolean {
  return record.rounds > 100 && record.overallScore > 97
}
