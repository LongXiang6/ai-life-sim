/**
 * @module narrative-background-result-inbox.ts
 * @description 叙事后台 AI 结果的版本化、幂等、有序收件箱
 * @mod mod-engine
 */

export const NARRATIVE_BACKGROUND_ANALYSIS_KINDS = [
  'basic-attribute',
  'data-analysis',
  'event-recognition',
  'macro-impact',
] as const

export type NarrativeBackgroundAnalysisKind =
  typeof NARRATIVE_BACKGROUND_ANALYSIS_KINDS[number]

export interface NarrativeBackgroundAnalysisIdentity {
  schemaVersion: 1
  kind: NarrativeBackgroundAnalysisKind
  lifeRunId: string
  roundSequence: number
  narrativeId: string
  inputHash: string
}

export type NarrativeBackgroundAnalysisStatus = 'pending' | 'succeeded' | 'failed'

export interface NarrativeBackgroundAnalysisRecord<TResult = unknown> {
  identity: NarrativeBackgroundAnalysisIdentity
  status: NarrativeBackgroundAnalysisStatus
  registeredAt: number
  completedAt?: number
  result?: TResult
  error?: string
  consumed: boolean
}

export type NarrativeBackgroundInboxCode =
  | 'registered'
  | 'duplicate-registration'
  | 'identity-mismatch'
  | 'accepted'
  | 'duplicate-terminal-result'
  | 'missing-registration'

function assertIdentity(identity: NarrativeBackgroundAnalysisIdentity): void {
  if (identity.schemaVersion !== 1) throw new Error('后台分析身份版本无效')
  if (!NARRATIVE_BACKGROUND_ANALYSIS_KINDS.includes(identity.kind)) {
    throw new Error(`后台分析类型无效：${String(identity.kind)}`)
  }
  if (!identity.lifeRunId.trim()) throw new Error('后台分析缺少 lifeRunId')
  if (!Number.isSafeInteger(identity.roundSequence) || identity.roundSequence <= 0) {
    throw new Error('后台分析回合序号无效')
  }
  if (!identity.narrativeId.trim()) throw new Error('后台分析缺少 narrativeId')
  if (!identity.inputHash.trim()) throw new Error('后台分析缺少 inputHash')
}

function recordKey(identity: Pick<
  NarrativeBackgroundAnalysisIdentity,
  'kind' | 'lifeRunId' | 'roundSequence' | 'narrativeId'
>): string {
  return [
    identity.lifeRunId,
    identity.kind,
    identity.roundSequence,
    identity.narrativeId,
  ].join(':')
}

function sameIdentity(
  left: NarrativeBackgroundAnalysisIdentity,
  right: NarrativeBackgroundAnalysisIdentity,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.lifeRunId === right.lifeRunId
    && left.roundSequence === right.roundSequence
    && left.narrativeId === right.narrativeId
    && left.inputHash === right.inputHash
}

/** 输入仅使用已稳定排序的 Prompt 分段；FNV-1a 用于身份校验，不承担安全用途。 */
export function createNarrativeBackgroundInputHash(
  kind: NarrativeBackgroundAnalysisKind,
  userSegments: readonly string[],
): string {
  const source = `${kind}\u0000${userSegments.join('\u0001')}`
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export class NarrativeBackgroundResultInbox {
  private readonly records = new Map<string, NarrativeBackgroundAnalysisRecord>()

  register(identity: NarrativeBackgroundAnalysisIdentity): NarrativeBackgroundInboxCode {
    assertIdentity(identity)
    const key = recordKey(identity)
    const existing = this.records.get(key)
    if (existing) {
      return sameIdentity(existing.identity, identity)
        ? 'duplicate-registration'
        : 'identity-mismatch'
    }
    this.records.set(key, {
      identity: structuredClone(identity),
      status: 'pending',
      registeredAt: Date.now(),
      consumed: false,
    })
    return 'registered'
  }

  succeed<TResult>(
    identity: NarrativeBackgroundAnalysisIdentity,
    result: TResult,
  ): NarrativeBackgroundInboxCode {
    return this.finish(identity, { status: 'succeeded', result: structuredClone(result) })
  }

  fail(
    identity: NarrativeBackgroundAnalysisIdentity,
    error: unknown,
  ): NarrativeBackgroundInboxCode {
    return this.finish(identity, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  drainTerminal<TResult = unknown>(
    kind: NarrativeBackgroundAnalysisKind,
    lifeRunId: string,
  ): NarrativeBackgroundAnalysisRecord<TResult>[] {
    const ordered = [...this.records.values()]
      .filter((record) => (
        record.identity.kind === kind
        && record.identity.lifeRunId === lifeRunId
        && !record.consumed
      ))
      .sort((left, right) => (
        left.identity.roundSequence - right.identity.roundSequence
        || left.identity.narrativeId.localeCompare(right.identity.narrativeId)
      ))

    const drained: NarrativeBackgroundAnalysisRecord<TResult>[] = []
    for (const record of ordered) {
      if (record.status === 'pending') break
      record.consumed = true
      drained.push(structuredClone(record) as NarrativeBackgroundAnalysisRecord<TResult>)
    }
    return drained
  }

  getRecords(): NarrativeBackgroundAnalysisRecord[] {
    return [...this.records.values()].map((record) => structuredClone(record))
  }

  discardNarrative(lifeRunId: string, narrativeId: string): void {
    for (const [key, record] of this.records) {
      if (
        record.identity.lifeRunId === lifeRunId
        && record.identity.narrativeId === narrativeId
      ) {
        this.records.delete(key)
      }
    }
  }

  reset(): void {
    this.records.clear()
  }

  private finish(
    identity: NarrativeBackgroundAnalysisIdentity,
    terminal: Pick<NarrativeBackgroundAnalysisRecord, 'status' | 'result' | 'error'>,
  ): NarrativeBackgroundInboxCode {
    assertIdentity(identity)
    const record = this.records.get(recordKey(identity))
    if (!record) return 'missing-registration'
    if (!sameIdentity(record.identity, identity)) return 'identity-mismatch'
    if (record.status !== 'pending') return 'duplicate-terminal-result'

    record.status = terminal.status
    record.completedAt = Date.now()
    if (terminal.result !== undefined) record.result = terminal.result
    if (terminal.error !== undefined) record.error = terminal.error
    return 'accepted'
  }
}
