/**
 * Purpose: Define client diagnostic levels and entry payloads.
 * Owner: core:logger
 * Responsibility: Client-log type contracts only; no console or network effects.
 */

import type { StoryRepetitionUsageMetric } from '../usage-metrics'

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ClientDiagnosticEntry {
  level: ClientLogLevel
  module: string
  message: string
  timestamp: number
  args?: unknown[]
  raw?: string
  error?: string
  errorName?: string
  stack?: string
  requestId?: string
  eventType?: 'log' | 'exception' | 'metric'
  context?: Record<string, unknown>
  metric?: StoryRepetitionUsageMetric
}
