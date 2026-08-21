/**
 * Purpose: Run the single ordered life-settlement flow from frozen evidence to final review.
 * Owner: core:scoring
 * Responsibility: Score-to-review dependency, terminal state, and execution diagnostics only.
 */

import {
  EXECUTION_FLOWS,
  recordExecutionSequenceResult,
} from '@/core'
import {
  createExecutionOutcomeCodes,
  executionSequenceError,
  runExecutionSequence,
} from '@/foundation'
import type {
  LifeScoringAuditSnapshot,
  LifeScoringEvidence,
  LifeScoringResult,
} from '@/foundation'

import { generateEndingReview, type EndingReview, type EndingReviewEvidence } from './game-over-review'
import { generateLifeScore } from './game-over-score-generation'

export interface GameOverSettlementSnapshot {
  requestKey: string
  lifeRunId: string
  round: number
  characterName: string
  worldName: string
  finalAge: number
  died: boolean
  evidence: readonly LifeScoringEvidence[]
  audit: LifeScoringAuditSnapshot
}

export interface GameOverSettlementResult {
  completedAt: number
  score: LifeScoringResult
  review: EndingReview
}

export type GameOverSettlementStage = 'preparing' | 'scoring' | 'reviewing' | 'finalizing'

interface GameOverSettlementContext {
  snapshot: GameOverSettlementSnapshot
  score: LifeScoringResult | null
  review: EndingReview | null
  onStage?: (stage: GameOverSettlementStage) => void
  onScore?: (score: LifeScoringResult) => void
}

function buildReviewEvidence(
  snapshot: GameOverSettlementSnapshot,
  score: LifeScoringResult,
): EndingReviewEvidence[] {
  return [
    ...snapshot.evidence,
    ...score.dimensions.map((dimension) => ({
      id: `dimension:${dimension.id}`,
      kind: 'dimension' as const,
      content: `${dimension.label}（${dimension.value}）：${dimension.description} ${dimension.comment}`,
    })),
  ]
}

export async function runGameOverSettlement(
  snapshot: GameOverSettlementSnapshot,
  callbacks?: {
    onStage?: (stage: GameOverSettlementStage) => void
    onScore?: (score: LifeScoringResult) => void
  },
): Promise<GameOverSettlementResult> {
  const flow = EXECUTION_FLOWS.lifeSettlement
  const context: GameOverSettlementContext = {
    snapshot,
    score: null,
    review: null,
    onStage: callbacks?.onStage,
    onScore: callbacks?.onScore,
  }
  const outcomes = (nodeId: string) => createExecutionOutcomeCodes(flow.flowId, nodeId)
  const result = await runExecutionSequence({
    flow,
    executionId: `${flow.flowId}:${snapshot.lifeRunId}:${snapshot.round}:${Date.now()}`,
    context,
    nodes: [
      {
        id: 'prepare-life-settlement',
        owner: flow.owner,
        failureTarget: flow.failureTarget,
        phase: 'prepare',
        dependsOn: [],
        order: 0,
        outcomes: outcomes('prepare-life-settlement'),
        run: async (current) => {
          current.onStage?.('preparing')
          const evidenceIds = current.snapshot.evidence.map((item) => item.id.trim())
          if (!current.snapshot.requestKey.trim() || !current.snapshot.lifeRunId.trim()) {
            return { status: 'failed', message: '人生结算缺少稳定运行标识' }
          }
          if (current.snapshot.round < 0 || evidenceIds.length === 0) {
            return { status: 'failed', message: '人生结算缺少完整经历证据' }
          }
          if (evidenceIds.some((id) => !id) || new Set(evidenceIds).size !== evidenceIds.length) {
            return { status: 'failed', message: '人生结算证据编号为空或重复' }
          }
          return { status: 'succeeded' }
        },
      },
      {
        id: 'queue-life-settlement',
        owner: flow.owner,
        failureTarget: flow.failureTarget,
        phase: 'ready',
        dependsOn: ['prepare-life-settlement'],
        order: 0,
        outcomes: outcomes('queue-life-settlement'),
        run: async () => ({ status: 'succeeded', message: '五维评分与结尾评语已按依赖排队' }),
      },
      {
        id: 'generate-life-score',
        owner: 'core-scoring',
        failureTarget: flow.failureTarget,
        phase: 'execute',
        dependsOn: ['queue-life-settlement'],
        order: 100,
        outcomes: outcomes('generate-life-score'),
        run: async (current) => {
          current.onStage?.('scoring')
          current.score = await generateLifeScore(current.snapshot)
          current.onScore?.(current.score)
          return { status: 'succeeded', value: current.score }
        },
      },
      {
        id: 'generate-ending-review',
        owner: 'mod-pages',
        failureTarget: flow.failureTarget,
        phase: 'execute',
        dependsOn: ['generate-life-score'],
        order: 200,
        outcomes: outcomes('generate-ending-review'),
        run: async (current) => {
          if (!current.score) return { status: 'blocked', message: '五维评分尚未完成' }
          current.onStage?.('reviewing')
          current.review = await generateEndingReview({
            lifeRunId: current.snapshot.lifeRunId,
            round: current.snapshot.round,
            characterName: current.snapshot.characterName,
            worldName: current.snapshot.worldName,
            finalAge: current.snapshot.finalAge,
            died: current.snapshot.died,
            evidence: buildReviewEvidence(current.snapshot, current.score),
          })
          return { status: 'succeeded', value: current.review }
        },
      },
      {
        id: 'commit-life-settlement',
        owner: flow.owner,
        failureTarget: flow.failureTarget,
        phase: 'transition',
        dependsOn: ['generate-ending-review'],
        order: 300,
        outcomes: outcomes('commit-life-settlement'),
        run: async (current) => current.score && current.review
          ? { status: 'succeeded' }
          : { status: 'failed', message: '人生结算结果未完整汇合' },
      },
      {
        id: 'finalize-life-settlement',
        owner: flow.owner,
        failureTarget: flow.failureTarget,
        phase: 'finalize',
        dependsOn: ['commit-life-settlement'],
        order: 400,
        outcomes: outcomes('finalize-life-settlement'),
        run: async (current) => {
          current.onStage?.('finalizing')
          return current.score && current.review
            ? { status: 'succeeded' }
            : { status: 'failed', message: '人生结算结束条件未满足' }
        },
      },
    ],
  })
  recordExecutionSequenceResult(result)
  if (result.status !== 'succeeded' || !context.score || !context.review) {
    throw executionSequenceError(result)
  }
  return { completedAt: Date.now(), score: context.score, review: context.review }
}
