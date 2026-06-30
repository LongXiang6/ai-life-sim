/**
 * @module event-bus.ts
 * @description 事件总线 —— 发布/订阅模式，跨 MOD 松耦合通信
 * @mod core
 *
 * 规范来源：mod-specification.md §6 MOD 间通信协议
 */

type EventHandler = (...args: unknown[]) => void

/** 事件总线 */
class EventBus {
  private listeners = new Map<string, Set<EventHandler>>()

  /** 订阅事件，返回取消订阅函数 */
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)

    // 返回取消订阅函数
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }

  /** 取消订阅（规范 §5.1：IEventBus.off 方法） */
  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  /** 发布事件（规范 §6.2：emit(event, data?: unknown)） */
  emit(event: string, data?: unknown): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (e) {
          console.error(`[EventBus] 事件 "${event}" 处理异常:`, e)
        }
      }
    }
  }

  /** 取消所有监听 */
  clear(): void {
    this.listeners.clear()
  }

  /** 获取已注册的事件名列表 */
  getEvents(): string[] {
    return [...this.listeners.keys()]
  }
}

/** 全局单例 */
export const eventBus = new EventBus()
