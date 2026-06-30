/**
 * @module simulation-types.ts
 * @description Simulation Worker 消息协议
 * @mod mod-engine
 */

import type { SubSystemChanges } from '@/foundation'

import type { CrossDomainEvalInput, CrossDomainEvalResult } from './simulation-kernel'
import type { DomainEvent, SubsystemInstruction } from '../helpers/cross-domain-rules'

export interface SimulationSnapshot {
  round: number
  totalRounds: number
  status: string
  subsystemSummaries: Record<string, string>
  updatedAt: number
}

export type SimulationWorkerRequest =
  | { id: number; type: 'EVAL_CROSS_DOMAIN'; payload: CrossDomainEvalInput }
  | { id: number; type: 'VALIDATE_CROSS_DOMAIN'; changes: SubSystemChanges[] }

export type SimulationWorkerResponse =
  | { id: number; type: 'EVAL_CROSS_DOMAIN_RESULT'; result: CrossDomainEvalResult }
  | { id: number; type: 'VALIDATE_CROSS_DOMAIN_RESULT'; changes: SubSystemChanges[] }
  | { id: number; type: 'ERROR'; message: string }

export type { DomainEvent, SubsystemInstruction, CrossDomainEvalInput, CrossDomainEvalResult }
