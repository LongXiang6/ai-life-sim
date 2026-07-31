import { z } from 'zod'

import { assertSameOrigin, jsonNoStore } from '@/core/account/account-http'
import { appendNarrativeRoundOutcome } from '@/core/logger/narrative-round-archive'
import { DEVELOPMENT_INCIDENT_CATEGORIES } from '@/core/logger/development-system-diagnostic'
import { appendDevelopmentSystemEvents } from '@/core/logger/development-system-diagnostic.server'
import {
  appendServerLogEntry,
  getServerRequestSource,
  queryServerLogEntries,
} from '@/core/logger/server-log-store'
import { readBoundedRequestBody } from '@/core/player-content/player-content-http'

export const runtime = 'nodejs'

const PhaseSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['completed', 'failed', 'skipped', 'warning']),
  durationMs: z.number().finite().nonnegative(),
  details: z.record(z.string(), z.unknown()).optional(),
  error: z.object({
    name: z.string().optional(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
}).strict()

const DevelopmentSystemEventSchema = z.object({
  schemaVersion: z.literal(1),
  timestamp: z.number().int().nonnegative(),
  system: z.string().min(1),
  event: z.string().min(1),
  status: z.enum(['ok', 'warning', 'error', 'skipped']),
  lifeRunId: z.string().optional(),
  round: z.number().int().positive().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  category: z.enum(DEVELOPMENT_INCIDENT_CATEGORIES).optional(),
  execution: z.object({
    flowId: z.string().min(1),
    executionId: z.string().min(1),
    department: z.string().min(1),
    subsystem: z.string().min(1),
    component: z.string().min(1),
    phase: z.enum(['prepare', 'ready', 'execute', 'transition', 'finalize']),
    sequence: z.number().int().positive(),
    status: z.enum([
      'ready', 'running', 'succeeded', 'skipped', 'blocked', 'failed', 'cancelled',
      'timed-out', 'missing-status', 'invalid-status', 'duplicate-status',
    ]),
    code: z.string().min(1),
    owner: z.string().min(1),
    failureTarget: z.string().min(1),
    nextNodeIds: z.array(z.string()),
    terminal: z.boolean(),
  }).strict().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  error: z.object({
    name: z.string().optional(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
}).strict()

const OutcomeSchema = z.object({
  schemaVersion: z.literal(1),
  lifeRunId: z.string().regex(/^[a-zA-Z0-9._-]+$/u),
  round: z.number().int().positive(),
  executionKind: z.enum(['real', 'preview']),
  status: z.enum(['completed', 'failed']),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  durationMs: z.number().finite().nonnegative(),
  phases: z.array(PhaseSchema).max(128),
  adoption: z.object({
    responseReceived: z.boolean(),
    narrativeAdopted: z.boolean(),
    structuredDataPresent: z.boolean(),
    structuredDataAccepted: z.boolean(),
    requestedChangeCount: z.number().int().nonnegative(),
    committedChangeCount: z.number().int().nonnegative(),
    rejectedChangeCount: z.number().int().nonnegative(),
    rejectedReasons: z.array(z.string()),
    narrativeId: z.string().optional(),
    narrativeChars: z.number().int().nonnegative(),
  }).strict(),
  quality: z.record(z.string(), z.unknown()).optional(),
  compression: z.record(z.string(), z.unknown()).optional(),
  autoSave: z.record(z.string(), z.unknown()).optional(),
  systemEvents: z.array(DevelopmentSystemEventSchema).max(512).optional(),
  error: z.object({
    name: z.string().optional(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
}).strict()

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const raw = await readBoundedRequestBody(request, 4 * 1024 * 1024)
    const report = OutcomeSchema.parse(JSON.parse(raw.toString('utf8')))
    const source = getServerRequestSource(request)
    const requestId = `narrative-round-commit:${report.lifeRunId}:${report.round}`
    const existing = queryServerLogEntries({ requestId, limit: 1 }).total > 0
    if (!existing) {
      const written = await appendServerLogEntry({
        id: requestId,
        entryType: 'narrative-round-commit',
        category: 'narrative-rounds',
        level: report.status === 'completed' && report.adoption.narrativeAdopted ? 'info' : 'warn',
        module: 'round-diagnostic',
        message: report.status === 'completed' ? 'narrative-round-outcome' : 'narrative-round-failed',
        requestId,
        source,
        round: report.round,
        callKind: 'round-outcome',
        meta: {
          lifeRunId: report.lifeRunId,
          round: report.round,
          status: report.status,
          narrativeAdopted: report.adoption.narrativeAdopted,
          repairAttempts: report.quality?.repairAttempts,
        },
        payload: { outcome: report },
      })
      if (!written) return jsonNoStore({ error: '回合诊断写入失败' }, { status: 500 })
    }
    const recordedAt = Date.now()
    await appendNarrativeRoundOutcome({ report, recordedAt })
    if (!existing) {
      await appendDevelopmentSystemEvents([
        ...(report.systemEvents ?? []),
        {
          schemaVersion: 1,
          timestamp: recordedAt,
          system: 'round-outcome-api',
          event: 'outcome-recorded',
          status: report.status === 'completed' && report.adoption.narrativeAdopted ? 'ok' : 'error',
          lifeRunId: report.lifeRunId,
          round: report.round,
          durationMs: report.durationMs,
          details: {
            adopted: report.adoption.narrativeAdopted,
            structuredDataAccepted: report.adoption.structuredDataAccepted,
            phaseCount: report.phases.length,
          },
          ...(report.error ? { error: report.error } : {}),
        },
      ]).catch((diagnosticError) => {
        console.error('[round-outcome] 开发系统诊断写入失败', diagnosticError)
      })
    }
    return jsonNoStore({ recorded: true, requestId, duplicate: existing })
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500
    return jsonNoStore({ error: error instanceof Error ? error.message : '回合诊断写入失败' }, { status })
  }
}
