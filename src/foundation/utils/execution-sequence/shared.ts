/**
 * Purpose: Centralize deterministic execution ordering and machine identifier validation primitives.
 * Owner: foundation:utils
 * Responsibility: Internal pure helpers only; public execution behavior belongs to sibling components.
 */

import type { ExecutionPhase } from '../../types/execution-sequence.types'

export const PHASE_ORDER: Record<ExecutionPhase, number> = {
  prepare: 0,
  ready: 1,
  execute: 2,
  transition: 3,
  finalize: 4,
}

const MACHINE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MACHINE_CODE_PATTERN = /^[a-z0-9]+(?:[a-z0-9:-]*[a-z0-9])?$/

export function compareAscii(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function assertMachineCode(value: string, label: string): void {
  if (!MACHINE_CODE_PATTERN.test(value)) {
    throw new Error(`[ExecutionSequence] ${label} "${value}" 必须为 ASCII 机器状态码`)
  }
}

export function assertMachineId(value: string, label: string): void {
  if (!MACHINE_ID_PATTERN.test(value)) {
    throw new Error(`[ExecutionSequence] ${label} "${value}" 必须为 ASCII kebab-case`)
  }
}
