/**
 * Purpose: Validate execution graph dependencies and produce a deterministic topological order.
 * Owner: foundation:utils
 * Responsibility: General graph validation, parallel-group validation, and ordering only.
 */

import type {
  ExecutionNodeDescriptor,
  ResolveExecutionOrderOptions,
} from '../../types/execution-sequence.types'
import { assertLifecycleShape } from './lifecycle-validation'
import { assertMachineId, compareAscii, PHASE_ORDER } from './shared'

export function compareExecutionNodes(
  left: Pick<ExecutionNodeDescriptor, 'id' | 'phase' | 'order'>,
  right: Pick<ExecutionNodeDescriptor, 'id' | 'phase' | 'order'>,
): number {
  const phaseDelta = PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase]
  if (phaseDelta !== 0) return phaseDelta
  if (left.order !== right.order) return left.order - right.order
  return compareAscii(left.id, right.id)
}

export function resolveExecutionOrder<T extends ExecutionNodeDescriptor>(
  nodes: readonly T[],
  options: ResolveExecutionOrderOptions = {},
): T[] {
  if (nodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图不得为空')
  }

  const byId = new Map<string, T>()
  for (const node of nodes) {
    assertMachineId(node.id, '节点标识')
    assertMachineId(node.owner, `节点 "${node.id}" 所有者`)
    assertMachineId(node.failureTarget, `节点 "${node.id}" 故障接收者`)
    if (node.parallelGroup !== undefined) {
      assertMachineId(node.parallelGroup, `节点 "${node.id}" 并行组`)
    }
    if (!Number.isInteger(node.order)) {
      throw new Error(`[ExecutionSequence] 节点 "${node.id}" order 必须为整数`)
    }
    if (byId.has(node.id)) {
      throw new Error(`[ExecutionSequence] 节点标识重复: ${node.id}`)
    }
    byId.set(node.id, node)
  }

  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const node of nodes) {
    inDegree.set(node.id, 0)
    dependents.set(node.id, [])
  }

  for (const node of nodes) {
    const seenDependencies = new Set<string>()
    for (const dependency of node.dependsOn) {
      if (dependency === node.id) {
        throw new Error(`[ExecutionSequence] 节点 "${node.id}" 不得依赖自身`)
      }
      if (seenDependencies.has(dependency)) {
        throw new Error(`[ExecutionSequence] 节点 "${node.id}" 重复声明依赖 "${dependency}"`)
      }
      seenDependencies.add(dependency)
      const dependencyNode = byId.get(dependency)
      if (!dependencyNode) {
        throw new Error(`[ExecutionSequence] 节点 "${node.id}" 依赖未声明节点 "${dependency}"`)
      }
      if (PHASE_ORDER[dependencyNode.phase] > PHASE_ORDER[node.phase]) {
        throw new Error(
          `[ExecutionSequence] 节点 "${node.id}" 不得依赖后续阶段 "${dependency}"`,
        )
      }
      dependents.get(dependency)?.push(node.id)
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1)
    }
  }

  const parallelGroups = new Map<string, T[]>()
  for (const node of nodes) {
    if (!node.parallelGroup) continue
    const group = parallelGroups.get(node.parallelGroup) ?? []
    group.push(node)
    parallelGroups.set(node.parallelGroup, group)
  }
  for (const [groupId, group] of parallelGroups) {
    if (group.length < 2) {
      throw new Error(`[ExecutionSequence] 并行组 "${groupId}" 至少需要两个节点`)
    }
    const [first] = group
    const expectedDependencies = [...first.dependsOn].sort(compareAscii)
    for (const node of group.slice(1)) {
      const dependencies = [...node.dependsOn].sort(compareAscii)
      if (
        node.phase !== first.phase
        || node.order !== first.order
        || dependencies.length !== expectedDependencies.length
        || dependencies.some((dependency, index) => dependency !== expectedDependencies[index])
      ) {
        throw new Error(
          `[ExecutionSequence] 并行组 "${groupId}" 必须位于同阶段、同依赖层并使用相同 order`,
        )
      }
    }
    const groupIds = new Set(group.map((node) => node.id))
    for (const node of group) {
      const internalDependencies = node.dependsOn.filter((dependency) => groupIds.has(dependency))
      if (internalDependencies.length > 0) {
        throw new Error(
          `[ExecutionSequence] 并行组 "${groupId}" 的节点不得相互依赖: ${node.id} -> ${internalDependencies.join(', ')}`,
        )
      }
    }
    const sameLayerPeers = nodes.filter((node) => {
      const dependencies = [...node.dependsOn].sort(compareAscii)
      return node.phase === first.phase
        && node.order === first.order
        && dependencies.length === expectedDependencies.length
        && dependencies.every((dependency, index) => dependency === expectedDependencies[index])
    })
    if (sameLayerPeers.some((node) => node.parallelGroup !== groupId)) {
      throw new Error(
        `[ExecutionSequence] 并行组 "${groupId}" 所在同级节点必须全部声明同一并行组`,
      )
    }
  }

  if (options.requireLifecyclePhases) {
    assertLifecycleShape(nodes)
  }

  const ready = nodes.filter((node) => inDegree.get(node.id) === 0)
  const ordered: T[] = []
  while (ready.length > 0) {
    ready.sort(compareExecutionNodes)
    const current = ready.shift()!
    ordered.push(current)
    const nextIds = [...(dependents.get(current.id) ?? [])].sort(compareAscii)
    for (const nextId of nextIds) {
      const nextDegree = (inDegree.get(nextId) ?? 1) - 1
      inDegree.set(nextId, nextDegree)
      if (nextDegree === 0) {
        ready.push(byId.get(nextId)!)
      }
    }
  }

  if (ordered.length !== nodes.length) {
    const unresolved = nodes
      .filter((node) => !ordered.some((orderedNode) => orderedNode.id === node.id))
      .map((node) => node.id)
      .sort(compareAscii)
    throw new Error(`[ExecutionSequence] 检测到循环依赖: ${unresolved.join(' -> ')}`)
  }

  for (const [groupId, group] of parallelGroups) {
    const positions = group
      .map((node) => ordered.findIndex((orderedNode) => orderedNode.id === node.id))
      .sort((left, right) => left - right)
    if (positions.at(-1)! - positions[0] + 1 !== positions.length) {
      throw new Error(`[ExecutionSequence] 并行组 "${groupId}" 必须在确定性执行序中形成连续单元`)
    }
  }

  return ordered
}
