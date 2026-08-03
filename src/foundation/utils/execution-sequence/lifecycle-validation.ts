/**
 * Purpose: Validate the required five-phase lifecycle shape and unique terminal node.
 * Owner: foundation:utils
 * Responsibility: Lifecycle topology invariants only; general graph ordering is handled separately.
 */

import type {
  ExecutionNodeDescriptor,
  ExecutionPhase,
} from '../../types/execution-sequence.types'

export function assertLifecycleShape<T extends ExecutionNodeDescriptor>(nodes: readonly T[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const prepareNodes = nodes.filter((node) => node.phase === 'prepare')
  const readyNodes = nodes.filter((node) => node.phase === 'ready')
  const executeNodes = nodes.filter((node) => node.phase === 'execute')
  const transitionNodes = nodes.filter((node) => node.phase === 'transition')
  const finalizeNodes = nodes.filter((node) => node.phase === 'finalize')
  if (prepareNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 prepare 节点')
  }
  if (readyNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 ready 节点（就绪排队阶段）')
  }
  if (executeNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 execute 节点')
  }
  if (transitionNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 transition 节点（阻塞/等待过渡阶段）')
  }
  if (finalizeNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 finalize 节点')
  }
  if (!prepareNodes.some((node) => node.dependsOn.length === 0)) {
    throw new Error('[ExecutionSequence] prepare 阶段必须包含无依赖的入口节点')
  }

  const previousPhase: Partial<Record<ExecutionPhase, ExecutionPhase>> = {
    ready: 'prepare',
    execute: 'ready',
    transition: 'execute',
    finalize: 'transition',
  }
  const reachesPhase = (
    node: T,
    targetPhase: ExecutionPhase,
    visiting: Set<string> = new Set(),
  ): boolean => {
    if (node.phase === targetPhase) return true
    if (visiting.has(node.id)) return false
    visiting.add(node.id)
    return node.dependsOn.some((dependency) => {
      const dependencyNode = byId.get(dependency)
      return dependencyNode !== undefined && reachesPhase(dependencyNode, targetPhase, visiting)
    })
  }

  for (const node of [...readyNodes, ...executeNodes, ...transitionNodes, ...finalizeNodes]) {
    const dependencyPhase = previousPhase[node.phase]
    if (dependencyPhase && !node.dependsOn.some((dependency) => {
      const dependencyNode = byId.get(dependency)
      return dependencyNode !== undefined && reachesPhase(dependencyNode, dependencyPhase)
    })) {
      throw new Error(
        `[ExecutionSequence] ${node.phase} 节点 "${node.id}" 必须由 ${dependencyPhase} 阶段释放`,
      )
    }
  }
  if (finalizeNodes.some((node) => 'optional' in node && node.optional === true)) {
    throw new Error('[ExecutionSequence] finalize 节点不得为可选')
  }

  const dependents = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      dependents.get(dependency)?.push(node.id)
    }
  }
  for (const node of nodes) {
    if ((dependents.get(node.id) ?? []).length === 0 && node.phase !== 'finalize') {
      throw new Error(`[ExecutionSequence] 非 finalize 节点 "${node.id}" 没有后续节点`)
    }
  }

  const terminalNodes = nodes.filter((node) => (dependents.get(node.id) ?? []).length === 0)
  if (terminalNodes.length !== 1) {
    throw new Error(
      `[ExecutionSequence] 执行图必须有唯一终态节点，当前为 ${terminalNodes.length} 个: ${terminalNodes.map((node) => node.id).join(', ')}`,
    )
  }
}
