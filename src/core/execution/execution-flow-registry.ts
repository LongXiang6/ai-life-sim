/**
 * Purpose: Register the project's active cross-component execution flows.
 * Owner: core:execution
 * Responsibility: Stable flow identity and ownership metadata only.
 */

import type { ExecutionFlowRegistration } from '@/foundation'

function registerFlow(
  registration: ExecutionFlowRegistration,
): Readonly<ExecutionFlowRegistration> {
  return Object.freeze({ ...registration })
}

/** 项目活动执行流的唯一登记目录。运行入口与发布门禁共同消费这些登记项。 */
export const EXECUTION_FLOWS = Object.freeze({
  narrativeRound: registerFlow({
    flowId: 'narrative-round',
    owner: 'mod-engine',
    failureTarget: 'mod-engine',
    department: 'mod-engine',
    subsystem: 'orchestrator-system',
  }),
  lifeSettlement: registerFlow({
    flowId: 'life-settlement',
    owner: 'core-scoring',
    failureTarget: 'core-scoring',
    department: 'core',
    subsystem: 'life-scoring',
  }),
  subsystemAdvance: registerFlow({
    flowId: 'subsystem-advance',
    owner: 'mod-engine',
    failureTarget: 'mod-engine',
    department: 'mod-engine',
    subsystem: 'subsystem-runtime',
  }),
  worldInit: registerFlow({
    flowId: 'world-init',
    owner: 'mod-world',
    failureTarget: 'mod-world',
    department: 'mod-world',
    subsystem: 'world-init-pipeline',
  }),
  modInitialization: registerFlow({
    flowId: 'mod-initialization',
    owner: 'core-mod-loader',
    failureTarget: 'core-mod-loader',
    department: 'core',
    subsystem: 'mod-loader',
  }),
  modStateLoad: registerFlow({
    flowId: 'mod-state-load',
    owner: 'core-mod-loader',
    failureTarget: 'core-mod-loader',
    department: 'core',
    subsystem: 'mod-loader',
  }),
  modConfigurationChange: registerFlow({
    flowId: 'mod-configuration-change',
    owner: 'core-mod-loader',
    failureTarget: 'core-mod-loader',
    department: 'core',
    subsystem: 'mod-loader',
  }),
} satisfies Record<string, Readonly<ExecutionFlowRegistration>>)

export function listExecutionFlowRegistrations(): Readonly<ExecutionFlowRegistration>[] {
  return Object.values(EXECUTION_FLOWS)
}
