/**
 * Purpose: Generate MOD control, subsystem, primary API, and secondary API importer sources.
 * Owner: code-generation
 * Responsibility: Importer source projection only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { GENERATED_BANNER } from './context.mjs'
import { readFile } from './source-analysis.mjs'

export function generateModControlImporters(modDirs) {
  const lines = modDirs.map(
    (name) => `  '${name}': () => import('@/mods/${name}/_internal/control') as Promise<Record<string, unknown>>,`,
  )
  return `${GENERATED_BANNER}

/** Factorio control.lua 等价 — 窄入口，仅 lifecycle（不含 index barrel） */
export const MOD_CONTROL_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
${lines.join('\n')}
}
`
}

/**
 * @param {string} className
 * @returns {string} kebab file stem under subsystems/ (e.g. CombatPowerSystem → combat-power-system)
 */
export function classNameToSubsystemFile(className) {
  return className
    .replace(/System$/, '-system')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * @param {string} modDir
 * @param {string} className
 * @returns {string | null} file stem under subsystems/ (without .ts)
 */
function resolveSubsystemFileStem(modDir, className) {
  const subDir = path.join(modDir, 'subsystems')
  if (!fs.existsSync(subDir)) return null
  for (const file of fs.readdirSync(subDir)) {
    if (!file.endsWith('.ts') || file === 'index.ts') continue
    const content = readFile(path.join(subDir, file))
    if (new RegExp(`export\\s+class\\s+${className}\\b`).test(content)) {
      return file.replace(/\.ts$/, '')
    }
  }
  const fallback = classNameToSubsystemFile(className)
  if (fs.existsSync(path.join(subDir, `${fallback}.ts`))) return fallback
  return null
}

/**
 * @param {string} modName
 * @param {string[]} classNames
 * @param {string} modDir
 * @returns {string | null} async importer block or null if no subsystems
 */
function buildSubsystemImporterBlock(modName, classNames, modDir) {
  const filtered = classNames.filter((c) => c !== 'OrchestratorSystem')
  if (filtered.length === 0) return null

  const importLines = []
  for (const className of filtered) {
    const fileStem = resolveSubsystemFileStem(modDir, className)
    if (!fileStem) {
      console.warn(`[generate-mod-wiring] ${modName}: 未找到子系统文件 ${className}`)
      continue
    }
    importLines.push(`    import('@/mods/${modName}/subsystems/${fileStem}'),`)
  }
  if (importLines.length === 0) return null

  const vars = importLines.map((_, i) => `m${i}`).join(', ')
  const spreads = importLines.map((_, i) => `...m${i}`).join(', ')

  return `  '${modName}': async () => {
    const [${vars}] = await Promise.all([
${importLines.join('\n')}
    ])
    return { ${spreads} }
  },`
}

/**
 * @param {Array<{ name: string, classNames: string[], modDir: string }>} entries
 */
export function generateModSubsystemImporters(entries) {
  if (entries.length === 0) {
    return `${GENERATED_BANNER}

/** 子系统按文件 import（registerAllSubsystems 专用，不经过 subsystems/index barrel） */
export const MOD_SUBSYSTEM_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {}
`
  }

  const blocks = entries
    .map((e) => buildSubsystemImporterBlock(e.name, e.classNames, e.modDir))
    .filter(Boolean)

  return `${GENERATED_BANNER}

/** 子系统按文件 import（registerAllSubsystems 专用，不经过 subsystems/index barrel） */
export const MOD_SUBSYSTEM_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
${blocks.join('\n')}
}
`
}

export function generateModImporters(modDirs) {
  const lines = modDirs.map(
    (name) => `  '${name}': () => import('@/mods/${name}') as Promise<Record<string, unknown>>,`,
  )
  return `${GENERATED_BANNER}

/** 全部 MOD index.ts import — Remote API 注册专用（非 lifecycle / 非子系统注册） */
export const MOD_API_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
${lines.join('\n')}
}

/** @deprecated 使用 MOD_CONTROL_IMPORTERS（lifecycle）或 MOD_API_IMPORTERS（Remote） */
export const MOD_IMPORTERS = MOD_API_IMPORTERS
`
}

/**
 * @param {Record<string, string[]>} secondaryMap modName → secondaryPublicEntries（不含 .ts）
 * @returns {string}
 */
export function generateModSecondaryApiImporters(secondaryMap) {
  const modNames = Object.keys(secondaryMap).sort()
  if (modNames.length === 0) {
    return `${GENERATED_BANNER}

/** manifest.secondaryPublicEntries — Remote API 注册补充（与 index.ts 合并） */
export const MOD_SECONDARY_API_IMPORTERS: Record<string, readonly (() => Promise<Record<string, unknown>>)[]> = {}
`
  }

  const blocks = modNames.map((modName) => {
    const lines = secondaryMap[modName].map((entry) => {
      const importPath = entry.replace(/\.ts$/, '')
      return `    () => import('@/mods/${modName}/${importPath}') as Promise<Record<string, unknown>>,`
    })
    return `  '${modName}': [\n${lines.join('\n')}\n  ],`
  })

  return `${GENERATED_BANNER}

/** manifest.secondaryPublicEntries — Remote API 注册补充（与 index.ts 合并） */
export const MOD_SECONDARY_API_IMPORTERS: Record<string, readonly (() => Promise<Record<string, unknown>>)[]> = {
${blocks.join('\n')}
}
`
}

export function generateModImportersReExport() {
  return `${GENERATED_BANNER}

/** @deprecated 实现已迁至 core/mod-loader/mod-importers.generated.ts */
export { MOD_IMPORTERS } from '@/core/mod-loader/mod-importers.generated'
`
}

/**
 * @param {Record<string, Record<string, string>>} compatMap modName → otherMod → import path
 */
