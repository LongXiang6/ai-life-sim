import {
  createExecutionOutcomeCodes,
} from '@/foundation'
import type {
  ExecutionFlowRegistration,
  ExecutionSequenceNode,
  ISubSystem,
  RoundContext,
} from '@/foundation'

export function createSubsystemAdvanceExecutionNodes(
  flow: ExecutionFlowRegistration,
  subsystems: readonly ISubSystem[],
  run: (subsystem: ISubSystem) => void,
): ExecutionSequenceNode<RoundContext>[] {
  const prepareId = `${flow.flowId}-prepare`
  const readyId = `${flow.flowId}-ready`
  const executeId = `${flow.flowId}-complete`
  const transitionId = `${flow.flowId}-transition`
  const finalizeId = `${flow.flowId}-finalize`
  const subsystemNodes = subsystems.map((subsystem, index): ExecutionSequenceNode<RoundContext> => ({
    id: `${flow.flowId}-${subsystem.id}`,
    owner: subsystem.mod,
    failureTarget: flow.failureTarget,
    phase: 'execute',
    dependsOn: [index === 0 ? readyId : `${flow.flowId}-${subsystems[index - 1].id}`],
    order: index,
    outcomes: createExecutionOutcomeCodes(flow.flowId, `${flow.flowId}-${subsystem.id}`),
    run: () => {
      run(subsystem)
      return { status: 'succeeded' }
    },
  }))

  return [
    {
      id: prepareId,
      owner: flow.owner,
      failureTarget: flow.failureTarget,
      phase: 'prepare',
      dependsOn: [],
      order: 0,
      outcomes: createExecutionOutcomeCodes(flow.flowId, prepareId),
      run: () => ({ status: 'succeeded' }),
    },
    {
      id: readyId,
      owner: flow.owner,
      failureTarget: flow.failureTarget,
      phase: 'ready',
      dependsOn: [prepareId],
      order: 0,
      outcomes: createExecutionOutcomeCodes(flow.flowId, readyId),
      run: () => ({ status: 'succeeded', message: '子系统任务已按活动清单排队' }),
    },
    ...subsystemNodes,
    {
      id: executeId,
      owner: flow.owner,
      failureTarget: flow.failureTarget,
      phase: 'execute',
      dependsOn: subsystemNodes.length > 0
        ? [subsystemNodes.at(-1)!.id]
        : [readyId],
      order: 1_000_000,
      outcomes: createExecutionOutcomeCodes(flow.flowId, executeId),
      run: () => ({ status: 'succeeded', message: '活动子系统执行结果已汇合' }),
    },
    {
      id: transitionId,
      owner: flow.owner,
      failureTarget: flow.failureTarget,
      phase: 'transition',
      dependsOn: [executeId],
      order: 0,
      outcomes: createExecutionOutcomeCodes(flow.flowId, transitionId),
      run: () => ({ status: 'succeeded', message: '子系统推进结果已返回编排器' }),
    },
    {
      id: finalizeId,
      owner: flow.owner,
      failureTarget: flow.failureTarget,
      phase: 'finalize',
      dependsOn: [transitionId],
      order: 0,
      outcomes: createExecutionOutcomeCodes(flow.flowId, finalizeId),
      run: () => ({ status: 'succeeded' }),
    },
  ]
}
