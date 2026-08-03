/**
 * Purpose: Define narrative history, compression memory, and player direction records.
 * Owner: foundation:types
 * Responsibility: Persistable narrative event and memory shapes only.
 */

export type SummaryLevel = 1 | 2 | 3

export interface CompressedMemoryEvent {
  id: string
  timeSpan: string
  text: string
  occurrenceTime: string
  sourceEventIds: string[]
  sourceRounds: number[]
  initialWeight: number
  weightAnchorRound: number
  permanent: boolean
}

export interface CompressedSummaryItem {
  level: SummaryLevel
  startRound: number
  endRound: number
  content: string
  memoryEvents?: CompressedMemoryEvent[]
  rawCompressionResponse?: string
  archiveContent?: string
  sourceSummaryIds?: string[]
  createdRound?: number
  contextIds?: string[]
  startTotalDays?: number
  endTotalDays?: number
}

export interface CompressedSummaries {
  summaries: CompressedSummaryItem[]
}

export interface DeathCause {
  reason: string
  round: number
}

export interface WorldDirectionRecord {
  political?: string
  economic?: string
  military?: string
  cultural?: string
  environmental?: string
}

export interface YearEventKeyEvent {
  text: string
  importance: number
  entities?: string[]
}

export interface YearEvent {
  id: number
  contextId?: string
  totalDays?: number
  age: number
  totalMonths: number
  eraYear: number
  eraName: string
  displayEraName?: string
  displayEraYear?: number
  narrative: string
  digest?: string
  keyEvents?: YearEventKeyEvent[]
  importance?: 'HIGH' | 'NORMAL' | 'LOW'
  timeLabel: string
  dynamicAttrs?: Record<string, number>
  baseAttrChanges?: Record<string, number>
  isTimeSkip?: boolean
  timeSkipYears?: number
  isBranchPoint?: boolean
  branchTitle?: string
  branchOptions?: string[]
  /** 玩家对该分支已经确认的选择；压缩 AI 只读取已提交事实。 */
  resolvedChoice?: string
  /** 玩家确认分支选择时的回合。 */
  resolvedChoiceRound?: number
  isEnding?: boolean
  deathCause?: DeathCause
  worldDirection?: WorldDirectionRecord
}

export interface LongTermMemory {
  spouse?: { name: string; sinceRound: number; relationQuality: number; entityId?: string; contextId?: string }
  children?: Array<{ name: string; age: number; gender: string; entityId?: string; contextId?: string }>
  parents?: {
    father?: { name: string; age: number; isAlive: boolean }
    mother?: { name: string; age: number; isAlive: boolean }
  }
  faction?: { name: string; role: string; rank: number }
  titles?: string[]
  majorEvents: Array<{ round: number; description: string; category: string; contextId?: string }>
  relationships: Array<{ name: string; relation: string; quality: number; entityId?: string; contextId?: string }>
  locations?: string[]
  locationContexts?: Record<string, string>
  currentContextId?: string
  wealth?: { description: string; level: number }
  reputation?: Record<string, number>
  lastUpdated?: number
}

export type NarrativeDirection =
  | '战斗/征服'
  | '经商/积累'
  | '修炼/突破'
  | '社交/结盟'
  | '探索/冒险'
  | '经营/建设'
  | '学习/研究'
  | '日常/生活'
  | null
