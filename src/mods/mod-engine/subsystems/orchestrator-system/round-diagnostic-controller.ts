/**
 * Purpose: Own one real round's diagnostic report and development-system event aggregation.
 * Owner: mod-engine
 * Responsibility: Record diagnostic phases and adoption, compression, quality, and auto-save outcomes.
 */

import {
  drainDevelopmentSystemEvents,
  recordDevelopmentSystemEvent,
  type DevelopmentSystemStatus,
} from '@/core/logger/development-system-diagnostic'
import type {
  NarrativeDiagnosticPhase,
  NarrativeRoundAdoption,
  NarrativeRoundOutcomeReport,
} from '@/core/logger/narrative-round-diagnostic'

interface RoundDiagnosticContext {
  lifeRunId: string
  preview: boolean
}

export class RoundDiagnosticController {
  private report: NarrativeRoundOutcomeReport | null = null

  constructor(private readonly getContext: () => RoundDiagnosticContext) {}

  private emptyAdoption(): NarrativeRoundAdoption {
    return {
      responseReceived: false,
      narrativeAdopted: false,
      structuredDataPresent: false,
      structuredDataAccepted: false,
      requestedChangeCount: 0,
      committedChangeCount: 0,
      rejectedChangeCount: 0,
      rejectedReasons: [],
      narrativeChars: 0,
    }
  }

  begin(round: number): void {
    const context = this.getContext()
    if (context.preview) return
    const startedAt = Date.now()
    this.report = {
      schemaVersion: 1,
      lifeRunId: context.lifeRunId,
      round,
      executionKind: 'real',
      status: 'failed',
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      phases: [],
      adoption: this.emptyAdoption(),
    }
    this.recordSystem('orchestrator', 'round-started', 'ok')
  }

  finish(status: 'completed' | 'failed', error?: unknown): void {
    if (this.getContext().preview || !this.report) return
    this.report.status = status
    this.report.completedAt = Date.now()
    this.report.durationMs = Math.max(0, this.report.completedAt - this.report.startedAt)
    if (error) {
      this.report.error = {
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    }
    this.recordSystem(
      'orchestrator',
      status === 'completed' ? 'round-completed' : 'round-failed',
      status === 'completed' ? 'ok' : 'error',
      { durationMs: this.report.durationMs },
      error,
    )
  }

  recordSystem(
    system: string,
    event: string,
    status: DevelopmentSystemStatus,
    details?: Record<string, unknown>,
    error?: unknown,
  ): void {
    if (this.getContext().preview || !this.report) return
    recordDevelopmentSystemEvent({
      system,
      event,
      status,
      lifeRunId: this.report.lifeRunId,
      round: this.report.round,
      details,
      error,
    })
  }

  pushPhase(phase: NarrativeDiagnosticPhase): void {
    if (this.getContext().preview || !this.report) return
    this.report.phases.push(phase)
    this.recordSystem(
      'orchestrator-stage',
      phase.name,
      phase.status === 'completed'
        ? 'ok'
        : phase.status === 'failed'
          ? 'error'
          : phase.status,
      { durationMs: phase.durationMs, ...(phase.details ?? {}) },
      phase.error,
    )
  }

  noteNarrativeQuality(details: Record<string, unknown>): void {
    if (this.getContext().preview || !this.report) return
    this.report.quality = { ...(this.report.quality ?? {}), ...details }
    this.recordSystem('narrative-quality', 'quality-evaluated', 'ok', details)
  }

  setRoundAdoption(adoption: Partial<NarrativeRoundAdoption>): void {
    if (this.getContext().preview || !this.report) return
    this.report.adoption = {
      ...this.report.adoption,
      ...adoption,
      rejectedReasons: adoption.rejectedReasons ?? this.report.adoption.rejectedReasons,
    }
    this.recordSystem(
      'round-commit',
      adoption.narrativeAdopted === false ? 'narrative-not-adopted' : 'adoption-updated',
      adoption.rejectedChangeCount && adoption.rejectedChangeCount > 0 ? 'warning' : 'ok',
      { ...adoption },
    )
  }

  setCompression(details: Record<string, unknown>): void {
    if (this.getContext().preview || !this.report) return
    this.report.compression = { ...(this.report.compression ?? {}), ...details }
    const status = details.status === 'failed'
      ? 'error'
      : details.status === 'skipped'
        ? 'skipped'
        : details.status === 'pending'
          ? 'warning'
          : 'ok'
    this.recordSystem('summary-compressor', 'compression-state', status, details)
  }

  setAutoSave(details: Record<string, unknown>): void {
    if (this.getContext().preview || !this.report) return
    this.report.autoSave = { ...(this.report.autoSave ?? {}), ...details }
    const status = details.status === 'failed'
      ? 'error'
      : details.status === 'skipped'
        ? 'skipped'
        : details.status === 'pending'
          ? 'warning'
          : 'ok'
    this.recordSystem('auto-save', 'save-state', status, details)
  }

  getLastReport(): NarrativeRoundOutcomeReport | null {
    if (!this.report) return null
    const captured = drainDevelopmentSystemEvents(this.report.lifeRunId, this.report.round)
    if (captured.length > 0) {
      this.report.systemEvents = [...(this.report.systemEvents ?? []), ...captured]
    }
    return structuredClone(this.report)
  }
}
