/**
 * Purpose: Define QQ Bot schemas and public integration result contracts.
 * Owner: core:account
 * Responsibility: QQ integration contracts only; no binding or authentication behavior.
 */

import { z } from 'zod'

export const QqBotQqSchema = z.string().regex(/^[1-9][0-9]{4,11}$/u, 'QQ 号格式无效')
export const QqBotBindRequestSchema = z.object({
  qq: QqBotQqSchema,
  code: z.string().trim().min(8).max(20),
}).strict()
export const QqBotAccountRequestSchema = z.object({ qq: QqBotQqSchema }).strict()

export interface QqLinkCodePayload {
  code: string
  expiresAt: number
}

export interface QqBotAccountStatus {
  linked: true
  username: string
  linkedAt: number
  lastActiveAt: number
  scheduledDeletionAt: number
  reincarnationTalentCount: number
  gameRecordCount: number
  pointsBalance: number
}

export interface QqBotProjectStatus {
  project: 'AI Life Sim'
  version: string
  latestUpdates: string[]
  capabilities: {
    optionalAccount: true
    cloudSync: true
    verifiedQqBinding: true
    sharedPoints: true
  }
}
