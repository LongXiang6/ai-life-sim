/**
 * @module simulation-time-api.ts
 * @description 时间推进公开命令 —— UI 只提交选择键，由引擎统一处理步长与预生成失效
 * @mod mod-engine
 */

import type { TimeStep } from '@/foundation'
import {
  AVAILABLE_TIME_STEPS,
  decodeTimeStepKey,
  encodeTimeStepKey,
  type TimeStepOption,
} from '@/foundation/constants/time-steps'

import { useEngineStore } from '../store'
import { orchestrator } from '../subsystems/orchestrator-system'
import { clearPreGenQueue } from './pre-gen-queue'

export { AVAILABLE_TIME_STEPS, encodeTimeStepKey }
export type { TimeStepOption }

function sameTimeStep(a: TimeStep, b: TimeStep): boolean {
  return a.unit === b.unit && a.value === b.value
}

/** 设置推进步长；步长变化时由引擎统一抛弃预生成，避免页面层直接操作队列。 */
export function setSimulationTimeStep(step: TimeStep): void {
  const current = useEngineStore.getState().timeStep
  if (!sameTimeStep(current, step)) {
    clearPreGenQueue()
  }
  orchestrator.setTimeStep(step)
}

/** 接收 UI 选择键 `unit:value`，解码后交给引擎步长命令。 */
export function setSimulationTimeStepByKey(key: string): TimeStep {
  const step = decodeTimeStepKey(key)
  setSimulationTimeStep(step)
  return step
}
