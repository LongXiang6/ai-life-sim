/**
 * @module pre-gen-activity-state.ts
 * @description 预生成执行状态 —— 分离“结果代次有效性”和“后台任务是否仍在运行”
 * @mod mod-engine
 */

/**
 * 预生成队列会被步长切换、分支选择等动作失效，但在途 AI 请求不会同步结束。
 * 该状态对象保证失效只废弃结果，不会提前释放 orchestrator 单写者。
 */
export class PreGenActivityState {
  private generation = 0
  private activeGeneration: number | null = null

  begin(): number {
    if (this.activeGeneration !== null) {
      throw new Error('[PreGen] 已有预生成执行，不能重复 begin')
    }
    const generation = ++this.generation
    this.activeGeneration = generation
    return generation
  }

  invalidate(): void {
    this.generation += 1
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation
  }

  isActive(): boolean {
    return this.activeGeneration !== null
  }

  finish(generation: number): void {
    if (this.activeGeneration === generation) {
      this.activeGeneration = null
    }
  }
}
