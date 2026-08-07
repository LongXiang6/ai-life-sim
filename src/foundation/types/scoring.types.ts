export type ScoringEvidenceKind =
  | 'attributes'
  | 'journey'
  | 'choices'
  | 'achievements'
  | 'completion'

export type ScoringCurveId =
  | 'growth'
  | 'agency'
  | 'journey'
  | 'impact'

export interface WorldScoringDimension {
  id: string
  label: string
  description: string
  weight: number
  evidenceKinds: ScoringEvidenceKind[]
  curveId: ScoringCurveId
}

export interface WorldScoringProfile {
  profileVersion: 1
  worldId: string
  dimensions: WorldScoringDimension[]
}

/** 单轮状态迁移的可复算证据；不包含正文或 Prompt。 */
export interface NarrativeTransitionAuditSnapshot {
  schemaVersion: 1
  round: number
  narrativeId: string
  validatedWritePath: boolean
  interceptorPassed: boolean
  intentValidationPassed: boolean
  historicalCommitPassed: boolean
  structuredDataPresent: boolean
  structuredDataAccepted: boolean
  requestedChangeCount: number
  committedChangeCount: number
  rejectedChangeCount: number
  trusted: boolean
  validationClean: boolean
  reasons: string[]
}

/** 结算时固化的评分输入；服务端用它重新执行同一套本地算法。 */
export interface LifeScoringAuditSnapshot {
  schemaVersion: 1
  lifeRunId: string
  committedRounds: number
  narrativeIds: string[]
  resolvedChoiceCount: number
  achievementIds: string[]
  completed: boolean
  terminalCommitted: boolean
  stateTransitionsTrusted: boolean
  hasValidationFailure: boolean
  transitionAudits: NarrativeTransitionAuditSnapshot[]
}
