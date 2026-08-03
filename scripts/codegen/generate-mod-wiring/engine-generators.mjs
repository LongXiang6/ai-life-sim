/**
 * Purpose: Generate subsystem aliases and the mod-engine singleton registry source.
 * Owner: code-generation
 * Responsibility: Engine subsystem source projection only.
 */

import { GENERATED_BANNER } from './context.mjs'
import { classNameToSubsystemFile } from './importer-generators.mjs'

export function generateSubsystemAliases(allAliases) {
  const entries = Object.entries(allAliases).sort(([a], [b]) => a.localeCompare(b))
  const lines = entries.map(([className, exportName]) => `  ${className}: '${exportName}',`)
  return `${GENERATED_BANNER}

/** 子系统类名 → index.ts 单例导出名（与默认 camelCase 不一致时的别名） */
export const SUBSYSTEM_SINGLETON_ALIASES: Record<string, string> = {
${lines.length ? lines.join('\n') : '  // 无别名'}
}
`
}

export function generateEngineSubsystems(manifestClasses, singletonMap) {
  const importLines = []
  const exportNames = new Set()
  const mapEntries = []

  // OrchestratorSystem 是 registry 的消费者，如果出现在 registry 的 import 链中会形成循环依赖
  const EXCLUDED_CLASSES = new Set(['OrchestratorSystem'])
  const excludedComments = []

  for (const className of manifestClasses) {
    if (EXCLUDED_CLASSES.has(className)) {
      excludedComments.push(`  // ${className}: 排除（registry 消费者，避免循环依赖）`)
      continue
    }
    const singleton = singletonMap.get(className)
    if (!singleton) continue
    if (exportNames.has(singleton)) continue
    exportNames.add(singleton)

    const fileKebab = classNameToSubsystemFile(className)

    importLines.push(`import { ${className}, ${singleton} } from '../subsystems/${fileKebab}'`)
    mapEntries.push(`  ${className}: ${singleton},`)
  }

  const classNames = manifestClasses.filter((c) => singletonMap.has(c) && !EXCLUDED_CLASSES.has(c))
  const reExportNames = [...new Set([...classNames, ...exportNames])].sort()

  return `${GENERATED_BANNER}

${importLines.join('\n')}

/** mod-engine manifest 声明的子系统类名 → 运行时单例（OrchestratorSystem 因循环依赖排除） */
export const ENGINE_SUBSYSTEM_MAP = {
${excludedComments.join('\n')}
${mapEntries.join('\n')}
} as const

export {
${reExportNames.map((n) => `  ${n},`).join('\n')}
}
`
}
