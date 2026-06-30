/**
 * @module remote-interface.ts
 * @description Remote Interface — 跨 MOD 请求/响应总线
 * @mod core
 *
 * 吸收 Factorio remote.add_interface / remote.call 设计。
 *
 * 自动注册：
 *   加载器在 MOD 初始化后，扫描 MOD 的 index.ts 导出，
 *   将其中所有非 Hook 函数自动注册为远程接口。
 *
 * 调用方无需 import：
 *   if (remote.has('mod-economy')) {
 *     const wealth = remote.call('mod-economy', 'getPlayerWealth')
 *   }
 */

import { isLikelyRemoteApiExport } from '../mod-loader/remote-api-filter'

/**
 * RemoteInterface — 跨 MOD 请求/响应总线
 *
 * 与 EventBus 的区别：
 *   - EventBus: 单向通知（emit → on），无返回值
 *   - RemoteInterface: 请求-响应模式（call → return），有返回值
 */
class RemoteInterface {
  /** MOD 名 → 函数名 → 函数引用 */
  private interfaces = new Map<string, Map<string, (...args: unknown[]) => unknown>>()

  /**
   * 自动注册（加载器调用，开发者无需手动调用）
   *
   * 扫描 MOD 导出的业务 API 函数（与 codegen REMOTE_API_CONTRACTS 同源过滤）。
   * 跳过 Hook、React 组件、类构造函数、PromptTemplate 对象等。
   *
   * @param modName - MOD 名称
   * @param api - MOD 的 index.ts 导出对象
   */
  autoRegister(modName: string, api: Record<string, unknown>): void {
    const iface = new Map<string, (...args: unknown[]) => unknown>()
    for (const [key, value] of Object.entries(api)) {
      if (typeof value === 'function' && isLikelyRemoteApiExport(key)) {
        iface.set(key, value as (...args: unknown[]) => unknown)
      }
    }
    if (iface.size > 0) {
      this.interfaces.set(modName, iface)
    }
  }

  /**
   * 手动注册单个函数（用于非 index.ts 导出的内部函数）
   *
   * @param modName - MOD 名称
   * @param fnName - 函数名
   * @param fn - 函数引用
   */
  register(modName: string, fnName: string, fn: (...args: unknown[]) => unknown): void {
    if (!this.interfaces.has(modName)) {
      this.interfaces.set(modName, new Map())
    }
    this.interfaces.get(modName)!.set(fnName, fn)
  }

  /**
   * 检查 MOD 是否存在远程接口
   */
  has(modName: string): boolean {
    return this.interfaces.has(modName)
  }

  /**
   * 检查 MOD 的指定函数是否存在
   */
  hasFunction(modName: string, fnName: string): boolean {
    return this.interfaces.get(modName)?.has(fnName) ?? false
  }

  /**
   * 调用远程接口
   *
   * @param modName - 目标 MOD 名称
   * @param fnName - 函数名
   * @param args - 参数
   * @returns 函数返回值
   * @throws 如果 MOD 或函数不存在
   */
  call<T = unknown>(modName: string, fnName: string, ...args: unknown[]): T {
    const fn = this.interfaces.get(modName)?.get(fnName)
    if (!fn) {
      throw new Error(`远程接口 ${modName}.${fnName} 不存在`)
    }
    return fn(...args) as T
  }

  /**
   * 安全调用远程接口（不存在时返回 undefined）
   *
   * @param modName - 目标 MOD 名称
   * @param fnName - 函数名
   * @param args - 参数
   * @returns 函数返回值或 undefined
   */
  tryCall<T = unknown>(modName: string, fnName: string, ...args: unknown[]): T | undefined {
    const fn = this.interfaces.get(modName)?.get(fnName)
    if (!fn) return undefined
    return fn(...args) as T
  }

  /**
   * 列出所有已注册的 MOD
   */
  list(): string[] {
    return Array.from(this.interfaces.keys())
  }

  /**
   * 列出 MOD 的所有远程函数名
   */
  listFunctions(modName: string): string[] {
    return Array.from(this.interfaces.get(modName)?.keys() ?? [])
  }
}

export const remote = new RemoteInterface()
