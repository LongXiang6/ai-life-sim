/**
 * @module simulation-bridge.ts
 * @description 模拟快照发布与订阅
 * @mod mod-engine
 */

import type { SimulationSnapshot } from './simulation-types'

type SnapshotListener = (snapshot: SimulationSnapshot) => void

class SimulationBridge {
  private snapshot: SimulationSnapshot | null = null
  private listeners = new Set<SnapshotListener>()

  publishSnapshot(snapshot: SimulationSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch (error) {
        console.error('[SimulationBridge] 快照监听器异常:', error)
      }
    }
  }

  getSnapshot(): SimulationSnapshot | null {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    if (this.snapshot) {
      try {
        listener(this.snapshot)
      } catch (error) {
        console.error('[SimulationBridge] 初始快照监听器异常:', error)
      }
    }
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.snapshot = null
    this.listeners.clear()
  }
}

export const simulationBridge = new SimulationBridge()
