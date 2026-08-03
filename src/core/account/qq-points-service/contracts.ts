/**
 * Purpose: Define QQ points request validation and result contracts.
 * Owner: core:account
 * Responsibility: Points protocol types only; balance and ledger state remain in repository components.
 */

import { z } from 'zod'

import { QqBotQqSchema } from '../qq-bot-integration/contracts'

const GroupKeySchema = z.string().regex(/^[1-9][0-9]{4,19}$/u, 'QQ群号格式无效')
const IdempotencyKeySchema = z.string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/u, '幂等键格式无效')

export const QqPointRequestSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('checkin'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
  }).strict(),
  z.object({
    operation: z.literal('balance'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
  }).strict(),
  z.object({
    operation: z.literal('leaderboard'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
    limit: z.number().int().min(1).max(20).default(10),
  }).strict(),
  z.object({
    operation: z.literal('transfer'),
    qq: QqBotQqSchema,
    targetQq: QqBotQqSchema,
    groupKey: GroupKeySchema,
    amount: z.number().int().min(1).max(1_000_000),
    idempotencyKey: IdempotencyKeySchema,
  }).strict(),
  z.object({
    operation: z.literal('adjust'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
    delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
    reason: z.string().trim().min(1).max(200),
    idempotencyKey: IdempotencyKeySchema,
  }).strict(),
])

export type QqPointRequest = z.infer<typeof QqPointRequestSchema>

export interface QqPointCheckinResult {
  operation: 'checkin'
  repeated: boolean
  localDate: string
  streak: number
  pointsAwarded: number
  balance: number
}

export interface QqPointBalanceResult {
  operation: 'balance'
  balance: number
  totalEarned: number
}

export interface QqPointLeaderboardResult {
  operation: 'leaderboard'
  items: Array<{ qq: string; balance: number; totalEarned: number }>
}

export interface QqPointTransferResult {
  operation: 'transfer'
  senderBalance: number
  recipientBalance: number
}

export interface QqPointAdjustResult {
  operation: 'adjust'
  balance: number
}

export type QqPointResult =
  | QqPointCheckinResult
  | QqPointBalanceResult
  | QqPointLeaderboardResult
  | QqPointTransferResult
  | QqPointAdjustResult
