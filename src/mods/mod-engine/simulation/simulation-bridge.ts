/**
 * @module simulation-bridge.ts
 * @description 主线程 ↔ Simulation Worker 桥接 + UI 快照发布
 * @mod mod-engine
 */

import {
  evaluateCrossDomainDispatch,
  validateCrossDomainChangesInKernel,
  instructionsToChanges,
} from './simulation-kernel'
import type {
  CrossDomainEvalInput,
  CrossDomainEvalResult,
  SimulationSnapshot,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from './simulation-types'
import type { SubSystemChanges } from '@/foundation'

type SnapshotListener = (snapshot: SimulationSnapshot) => void

class SimulationBridge {
  private worker: Worker | null = null
  private workerReady = false
  private nextId = 1
  private pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (reason: Error) => void
  }>()
  private snapshot: SimulationSnapshot | null = null
  private listeners = new Set<SnapshotListener>()

  /** 懒加载 Worker（浏览器环境） */
  initWorker(): void {
    if (this.worker || typeof window === 'undefined' || typeof Worker === 'undefined') {
      return
    }
    try {
      this.worker = new Worker(new URL('./simulation.worker.ts', import.meta.url))
      this.worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
        const msg = event.data
        const entry = this.pending.get(msg.id)
        if (!entry) return
        this.pending.delete(msg.id)
        if (msg.type === 'ERROR') {
          entry.reject(new Error(msg.message))
          return
        }
        if (msg.type === 'EVAL_CROSS_DOMAIN_RESULT') {
          entry.resolve(msg.result)
          return
        }
        if (msg.type === 'VALIDATE_CROSS_DOMAIN_RESULT') {
          entry.resolve(msg.changes)
        }
      }
      this.worker.onerror = () => {
        this.workerReady = false
      }
      this.workerReady = true
    } catch {
      this.worker = null
      this.workerReady = false
    }
  }

  isWorkerActive(): boolean {
    return this.workerReady && this.worker !== null
  }

  private post<T>(request: SimulationWorkerRequest): Promise<T> {
    this.initWorker()
    if (!this.worker || !this.workerReady) {
      return Promise.reject(new Error('Simulation Worker 不可用'))
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.worker!.postMessage(request)
    })
  }

  async evalCrossDomain(input: CrossDomainEvalInput): Promise<CrossDomainEvalResult> {
    if (this.isWorkerActive()) {
      try {
        return await this.post<CrossDomainEvalResult>({
          id: this.nextId++,
          type: 'EVAL_CROSS_DOMAIN',
          payload: input,
        })
      } catch {
        // Worker 失败 → 主线程降级
      }
    }
    return evaluateCrossDomainDispatch(input)
  }

  async validateCrossDomainChanges(changes: SubSystemChanges[]): Promise<SubSystemChanges[]> {
    if (this.isWorkerActive()) {
      try {
        return await this.post<SubSystemChanges[]>({
          id: this.nextId++,
          type: 'VALIDATE_CROSS_DOMAIN',
          changes,
        })
      } catch {
        // 降级
      }
    }
    return validateCrossDomainChangesInKernel(changes)
  }

  /** 跨域评估 + 转 changes（供 orchestrator 使用） */
  async evalCrossDomainChanges(
    input: CrossDomainEvalInput,
    sourceEventId: string,
  ): Promise<{ changes: SubSystemChanges[]; cooldowns: Record<string, number> }> {
    const result = await this.evalCrossDomain(input)
    const rawChanges = instructionsToChanges(result.instructions, sourceEventId)
    const changes = await this.validateCrossDomainChanges(rawChanges)
    return { changes, cooldowns: result.cooldowns }
  }

  publishSnapshot(snapshot: SimulationSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  getSnapshot(): SimulationSnapshot | null {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    if (this.snapshot) {
      listener(this.snapshot)
    }
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.workerReady = false
    this.pending.clear()
    this.listeners.clear()
  }
}

export const simulationBridge = new SimulationBridge()
