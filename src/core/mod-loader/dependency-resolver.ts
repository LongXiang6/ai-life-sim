/**
 * @module dependency-resolver.ts
 * @description 依赖解析器 V2 —— 深度排序 + `~/?/!` 前缀解析 + 循环依赖检测
 * @mod core
 *
 * 排序优先级（同入度节点）：
 *   1. dependencies 中声明了硬依赖 → 被依赖方先加载（拓扑已保证）
 *   2. 依赖链深度较浅者优先（吸收 Factorio "shorter dependency chains first"）
 *   3. provides/consumes 匹配度高者优先（能力提供方先加载）
 *   4. MOD 名称自然排序（稳定兜底）
 *
 * 彻底删除 loadOrder 字段的使用和校验。
 */

import type { ModManifest, ModDependency } from '@/foundation'

/** 拓扑排序结果 */
export interface ResolveResult {
  /** 排序后的 MOD 名称列表 */
  order: string[],
  /** 循环依赖列表 */
  cycles: string[][],
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
 * 计算 MOD 的依赖链深度（递归）
 *
 * 依赖链越浅越优先加载。
 */
function computeDependencyDepth(
  modName: string,
  manifests: ModManifest[],
  visited: Set<string> = new Set(),
): number {
  if (visited.has(modName)) return 0
  visited.add(modName)

  const manifest = manifests.find((m) => m.name === modName)
  if (!manifest || manifest.dependencies.length === 0) return 0

  let maxDepth = 0
  for (const depStr of manifest.dependencies) {
    const dep = parseDependency(depStr)
    // 只计算硬依赖的深度（软引用/可选/冲突不计算）
    if (dep.affectsLoadOrder) {
      const depth = computeDependencyDepth(dep.name, manifests, visited) + 1
      if (depth > maxDepth) maxDepth = depth
    }
  }
  return maxDepth
}

/**
 * 计算两个 MOD 的能力匹配分数
 *
 * 如果 A 提供了 B 消费的能力 → 分数高 → A 先加载（提供者先于消费者）。
 */
function computeCapabilityMatchScore(
  a: string,
  b: string,
  manifests: ModManifest[],
): number {
  const ma = manifests.find((m) => m.name === a)
  const mb = manifests.find((m) => m.name === b)
  if (!ma || !mb) return 0

  let score = 0
  for (const consume of mb.consumes) {
    if (ma.provides.includes(consume)) score++
  }
  return score
}

/**
 * 解析 MOD 加载顺序 V2
 *
 * 与 v1 相比：
 *   - 使用依赖链深度排序替代 loadOrder
 *   - 支持 `~/?/!` 前缀解析
 *   - 软引用/可选/冲突声明不影响拓扑排序
 *
 * @param manifests - MOD manifest 列表
 * @returns 拓扑排序结果（顺序 + 循环依赖列表）
 */
export function resolveDependenciesV2(
  manifests: ModManifest[],
): ResolveResult {
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const m of manifests) {
    inDegree.set(m.name, 0)
    dependents.set(m.name, [])
  }

  // 构建依赖图（仅硬依赖参与拓扑排序）
  for (const m of manifests) {
    for (const depStr of m.dependencies) {
      const dep = parseDependency(depStr)

      // 硬依赖 → 参与拓扑排序
      if (dep.affectsLoadOrder) {
        if (!dependents.has(dep.name)) {
          dependents.set(dep.name, [])
          if (!inDegree.has(dep.name)) {
            inDegree.set(dep.name, 0)
          }
        }
        dependents.get(dep.name)!.push(m.name)
        inDegree.set(m.name, (inDegree.get(m.name) ?? 0) + 1)
      }
    }
  }

  // 拓扑排序：从入度 0（无硬依赖）的节点开始
  const order: string[] = []
  const queue: string[] = []

  for (const [name, degree] of inDegree) {
    if (degree === 0 && manifests.some((m) => m.name === name)) {
      queue.push(name)
    }
  }

  while (queue.length > 0) {
    // 深度排序 + 能力匹配 + 名称兜底
    queue.sort((a, b) => {
      // 1. 依赖链深度越浅越优先
      const depthA = computeDependencyDepth(a, manifests)
      const depthB = computeDependencyDepth(b, manifests)
      if (depthA !== depthB) return depthA - depthB

      // 2. provides/consumes 匹配（消费方在后）
      const scoreA = computeCapabilityMatchScore(a, b, manifests)
      const scoreB = computeCapabilityMatchScore(b, a, manifests)
      if (scoreA !== scoreB) return scoreB - scoreA

      // 3. 名称自然排序（稳定兜底）
      return a.localeCompare(b)
    })

    const current = queue.shift()!
    order.push(current)

    // current 已加载 → 所有依赖 current 的 MOD 入度 -1
    for (const dependent of (dependents.get(current) ?? [])) {
      const deg = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, deg)
      if (deg === 0 && manifests.some((m) => m.name === dependent)) {
        queue.push(dependent)
      }
    }
  }

  // 循环依赖检测
  const cycles: string[][] = []
  const loaded = new Set(order)
  for (const m of manifests) {
    if (!loaded.has(m.name)) {
      const unresolvedDeps = m.dependencies
        .map((d) => parseDependency(d))
        .filter((d) => d.affectsLoadOrder && !loaded.has(d.name))
        .map((d) => d.name)
      cycles.push([m.name, ...unresolvedDeps])
    }
  }

  return { order, cycles }
}
