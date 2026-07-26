import { z } from 'zod'

import {
  advanceNarrativeMemoryDatabase,
  searchNarrativeMemoryDatabase,
  syncNarrativeMemoryDatabase,
} from '@/core/storage/narrative-memory-store'

const memoryEventSchema = z.object({
  id: z.string().min(1),
  timeSpan: z.string(),
  text: z.string(),
  occurrenceTime: z.string(),
  sourceEventIds: z.array(z.string()),
  sourceRounds: z.array(z.number().int()),
  initialWeight: z.number().int().min(1).max(10),
  weightAnchorRound: z.number().int().nonnegative(),
  permanent: z.boolean(),
}).strict()

const summarySchema = z.object({
  level: z.number().int().min(1).max(3),
  startRound: z.number().int().positive(),
  endRound: z.number().int().positive(),
  createdRound: z.number().int().positive().optional(),
  content: z.string(),
  archiveContent: z.string().optional(),
  memoryEvents: z.array(memoryEventSchema).optional(),
  rawCompressionResponse: z.string().optional(),
  sourceSummaryIds: z.array(z.string()).optional(),
  contextIds: z.array(z.string()).optional(),
  startTotalDays: z.number().optional(),
  endTotalDays: z.number().optional(),
}).strict()

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sync'),
    lifeRunId: z.string().min(1).max(160),
    currentRound: z.number().int().nonnegative(),
    summaries: z.array(summarySchema),
  }).strict(),
  z.object({
    action: z.literal('advance'),
    lifeRunId: z.string().min(1).max(160),
    currentRound: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    action: z.literal('search'),
    lifeRunId: z.string().min(1).max(160),
    currentRound: z.number().int().nonnegative(),
    terms: z.array(z.string()).max(64),
  }).strict(),
])

export async function POST(request: Request): Promise<Response> {
  try {
    const body = requestSchema.parse(await request.json())
    if (body.action === 'sync') {
      syncNarrativeMemoryDatabase({
        ...body,
        summaries: body.summaries.map((summary) => ({
          ...summary,
          level: summary.level as 1 | 2 | 3,
        })),
      })
      return Response.json({ ok: true, action: body.action })
    }
    if (body.action === 'advance') {
      advanceNarrativeMemoryDatabase(body)
      return Response.json({ ok: true, action: body.action })
    }
    return Response.json({ ok: true, action: body.action, results: searchNarrativeMemoryDatabase(body) })
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 })
  }
}
