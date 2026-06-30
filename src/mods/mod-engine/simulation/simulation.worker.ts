/**
 * @module simulation.worker.ts
 * @description 模拟 Worker —— 跨域评估与变更校验（CPU 隔离）
 * @mod mod-engine
 */

import {
  evaluateCrossDomainDispatch,
  validateCrossDomainChangesInKernel,
} from './simulation-kernel'
import type { SimulationWorkerRequest, SimulationWorkerResponse } from './simulation-types'

const ctx = self as unknown as Worker

ctx.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const msg = event.data
  try {
    if (msg.type === 'EVAL_CROSS_DOMAIN') {
      const result = evaluateCrossDomainDispatch(msg.payload)
      const response: SimulationWorkerResponse = {
        id: msg.id,
        type: 'EVAL_CROSS_DOMAIN_RESULT',
        result,
      }
      ctx.postMessage(response)
      return
    }

    if (msg.type === 'VALIDATE_CROSS_DOMAIN') {
      const changes = validateCrossDomainChangesInKernel(msg.changes)
      const response: SimulationWorkerResponse = {
        id: msg.id,
        type: 'VALIDATE_CROSS_DOMAIN_RESULT',
        changes,
      }
      ctx.postMessage(response)
      return
    }
  } catch (e) {
    const response: SimulationWorkerResponse = {
      id: msg.id,
      type: 'ERROR',
      message: e instanceof Error ? e.message : String(e),
    }
    ctx.postMessage(response)
  }
}

export {}
