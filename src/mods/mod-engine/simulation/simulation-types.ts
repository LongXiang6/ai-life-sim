/**
 * @module simulation-types.ts
 * @description 页面可订阅的模拟快照契约
 * @mod mod-engine
 */

export interface SimulationSnapshot {
  round: number
  totalRounds: number
  status: string
  subsystemSummaries: Record<string, string>
  updatedAt: number
}
