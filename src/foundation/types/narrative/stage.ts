/**
 * Purpose: Define the declarative narrative stage and stage-machine contracts.
 * Owner: foundation:types
 * Responsibility: Narrative stage execution shapes only; runtime orchestration belongs to mod-engine.
 */

import type { ExecutionPhase } from '../execution-sequence.types'
import type { RoundContext } from '../subsystem.types'

export interface NarrativeStage {
  name: string
  phase: ExecutionPhase
  dependsOn: readonly string[]
  order: number
  parallelGroup?: string
  owner: string
  failureTarget: string
  onEnter?: (ctx: RoundContext) => void | Promise<void>
  onUpdate?: (ctx: RoundContext) => void | Promise<void>
  shouldProceed?: (ctx: RoundContext) => boolean | Promise<boolean>
  onExit?: (ctx: RoundContext) => void | Promise<void>
  maxRounds?: number
}

export interface NarrativeStageMachine {
  stages: NarrativeStage[]
  currentIndex: number
  roundCount: number
  executeCurrentStage(context: RoundContext): void
  jumpTo(stageName: string): void
  isFinished(): boolean
}
