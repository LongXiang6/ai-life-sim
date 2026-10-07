/**
 * Purpose: Persist development-system events in the canonical SQLite log store.
 * Owner: core:logger
 * Responsibility: Normalize execution diagnostics into one durable log row per event.
 */

import 'server-only'

import type { DevelopmentSystemEvent } from './development-system-diagnostic'
import { appendServerLogEntry } from './server-log-store'
import type { ServerRequestSource } from './server-log-safety'

function levelOf(status: DevelopmentSystemEvent['status']): 'info' | 'warn' | 'error' {
  if (status === 'error') return 'error'
  if (status === 'warning') return 'warn'
  return 'info'
}

export async function appendDevelopmentSystemEvents(
  events: readonly DevelopmentSystemEvent[],
  source?: ServerRequestSource,
): Promise<void> {
  await Promise.all(events.map(async (event) => {
    const details = event.details ?? {}
    const requestId = typeof details.requestId === 'string' ? details.requestId : undefined
    await appendServerLogEntry({
      createdAt: event.timestamp,
      clientTimestamp: event.timestamp,
      entryType: 'development-event',
      category: event.category ?? 'development',
      level: levelOf(event.status),
      module: event.system,
      message: event.event,
      event: event.event,
      requestId,
      source,
      round: event.round,
      error: event.error?.message,
      stack: event.error?.stack,
      meta: {
        status: event.status,
        ...(event.category ? { category: event.category } : {}),
        ...(event.lifeRunId ? { lifeRunId: event.lifeRunId } : {}),
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        ...details,
      },
      payload: event,
    })
  }))
}
