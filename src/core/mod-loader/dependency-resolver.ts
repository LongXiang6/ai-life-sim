/**
 * @module dependency-resolver.ts
 * @description 依赖解析器 V2 —— 硬依赖拓扑 + 显式 order + 循环依赖检测
 * @mod core
 *
 * 排序优先级（同入度节点）：
 *   1. dependencies 中声明了硬依赖 → 被依赖方先加载（拓扑已保证）
 *   2. 当前已就绪节点按 manifest.order 从小到大
 *   3. order 相同时按 MOD 名称 ASCII 升序
 *
 * 彻底删除 loadOrder 字段的使用和校验。
 */

import { resolveExecutionOrder } from '@/foundation'
import type { ModManifest, ModDependency } from '@/foundation'

/** 拓扑排序结果 */
export interface ResolveResult {
  /** 排序后的 MOD 名称列表 */
  order: string[],
  /** 循环依赖列表 */
  cycles: string[][],
  /** 声明错误（重复标识、非法 order 等） */
  errors: string[],
}

/**
 * 剥离依赖前缀，返回 MOD 名称；无前缀时返回 null
 *
 * 同时支持带空格（`~ mod-xxx`）与紧凑写法（`~mod-xxx`）。
 */
function stripDependencyPrefix(
  depStr: string,
  prefix: '~' | '?' | '!',
): string | null {
  if (depStr.startsWith(`${prefix} `)) {
    return depStr.slice(prefix.length + 1)
  }
  if (depStr.startsWith(prefix) && depStr.length > prefix.length) {
    return depStr.slice(prefix.length)
  }
  return null
}

/**
 * 解析依赖字符串前缀
 *
 *   'mod-world'       → { name: 'mod-world', type: 'required', affectsLoadOrder: true }
 *   '? mod-culture'   → { name: 'mod-culture', type: 'optional', affectsLoadOrder: false }
 *   '?mod-culture'    → 同上（紧凑写法）
 *   '! mod-politics'  → { name: 'mod-politics', type: 'incompatible', affectsLoadOrder: false }
 *   '~ mod-economy'   → { name: 'mod-economy', type: 'soft', affectsLoadOrder: false }
 *   '~mod-economy'    → 同上（紧凑写法）
 *
 * @param depStr - 依赖声明字符串
 * @returns 解析后的 ModDependency
 */
export function parseDependency(depStr: string): ModDependency {
  const softName = stripDependencyPrefix(depStr, '~')
  if (softName !== null) {
    return { name: softName, type: 'soft', affectsLoadOrder: false }
  }

  const optionalName = stripDependencyPrefix(depStr, '?')
  if (optionalName !== null) {
    return { name: optionalName, type: 'optional', affectsLoadOrder: false }
  }

  const incompatibleName = stripDependencyPrefix(depStr, '!')
  if (incompatibleName !== null) {
    return { name: incompatibleName, type: 'incompatible', affectsLoadOrder: false }
  }

  return { name: depStr, type: 'required', affectsLoadOrder: true }
}

/**
 * 解析 MOD 加载顺序 V2
 *
 * 与 v1 相比：
 *   - 使用显式 order 排序同一依赖层
 *   - 支持 `~/?/!` 前缀解析
 *   - 软引用/可选/冲突声明不影响拓扑排序
 *
 * @param manifests - MOD manifest 列表
 * @returns 拓扑排序结果（顺序 + 循环依赖列表）
 */
export function resolveDependenciesV2(
  manifests: ModManifest[],
): ResolveResult {
  const available = new Set(manifests.map((manifest) => manifest.name))
  const nodes = manifests.map((manifest) => ({
    id: manifest.name,
    owner: 'core-mod-loader',
    failureTarget: 'core-mod-loader',
    phase: 'execute' as const,
    dependsOn: manifest.dependencies
      .map((dependency) => parseDependency(dependency))
      .filter((dependency) => dependency.affectsLoadOrder && available.has(dependency.name))
      .map((dependency) => dependency.name),
    order: manifest.order,
  }))

  try {
    return {
      order: resolveExecutionOrder(nodes).map((node) => node.id),
      cycles: [],
      errors: [],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('循环依赖')) {
      const unresolved = message.split(':').at(-1)?.trim().split(' -> ').filter(Boolean) ?? []
      return { order: [], cycles: unresolved.length > 0 ? [unresolved] : [], errors: [] }
    }
    return { order: [], cycles: [], errors: [message] }
  }
}
