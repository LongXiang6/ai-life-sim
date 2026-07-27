/**
 * @module pre-gen-activity-state.ts
 * @description 预生成执行状态 —— 分离“结果代次有效性”和“后台任务是否仍在运行”
 * @mod mod-engine
 */

/**
 * 预生成队列会被步长切换、分支选择等动作失效，但在途 AI 请求不会同步结束。
 * 该状态对象同时管理结果代次、在途请求取消和后台任务生命周期。
 * 失效会立即取消 AI 请求；主推进仍需等预览清理完成后再接管单写者。
 */
export class PreGenActivityState {
  private generation = 0
  private activeGeneration: number | null = null
  private activeController: AbortController | null = null
  private idleWaiters = new Set<() => void>()

  begin(): number {
    if (this.activeGeneration !== null) {
      throw new Error('[PreGen] 已有预生成执行，不能重复 begin')
    }
    const generation = ++this.generation
    this.activeGeneration = generation
    this.activeController = new AbortController()
    return generation
  }

  invalidate(): void {
    this.generation += 1
    this.activeController?.abort()
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation
  }

  isActive(): boolean {
    return this.activeGeneration !== null && this.activeGeneration === this.generation
  }

  /** 后台请求仍在执行；用于防止失效任务与新补池任务并发写 orchestrator。 */
  isRunning(): boolean {
    return this.activeGeneration !== null
  }

  getSignal(generation: number): AbortSignal | undefined {
    if (this.activeGeneration !== generation) return undefined
    return this.activeController?.signal
  }

  waitForIdle(): Promise<void> {
    if (!this.isRunning()) return Promise.resolve()
    return new Promise((resolve) => {
      this.idleWaiters.add(resolve)
    })
  }

  finish(generation: number): void {
    if (this.activeGeneration === generation) {
      this.activeGeneration = null
      this.activeController = null
      const waiters = [...this.idleWaiters]
      this.idleWaiters.clear()
      for (const resolve of waiters) resolve()
    }
  }
}
