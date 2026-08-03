/**
 * Purpose: Discover and generate MOD compatibility and migration importer sources.
 * Owner: code-generation
 * Responsibility: Compatibility and storage-migration import maps only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { GENERATED_BANNER, MODS_DIR } from './context.mjs'

export function generateCompatImporters(compatMap) {
  const modEntries = Object.entries(compatMap).sort(([a], [b]) => a.localeCompare(b))
  if (modEntries.length === 0) {
    return `${GENERATED_BANNER}

/** MOD 兼容层静态 import 映射（Next.js 需静态可分析路径） */
export const COMPAT_IMPORTERS: Record<string, Record<string, () => Promise<Record<string, unknown>>>> = {}
`
  }

  const blocks = modEntries.map(([modName, others]) => {
    const lines = Object.entries(others)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([otherMod, importPath]) =>
          `    '${otherMod}': () => import('${importPath}') as Promise<Record<string, unknown>>,`,
      )
    return `  '${modName}': {\n${lines.join('\n')}\n  },`
  })

  return `${GENERATED_BANNER}

/** MOD 兼容层静态 import 映射（Next.js 需静态可分析路径） */
export const COMPAT_IMPORTERS: Record<string, Record<string, () => Promise<Record<string, unknown>>>> = {
${blocks.join('\n')}
}
`
}

/**
 * @param {Record<string, Record<string, string>>} migrationMap modName → stepKey → import path
 */
export function generateMigrationImporters(migrationMap) {
  const modEntries = Object.entries(migrationMap).sort(([a], [b]) => a.localeCompare(b))
  if (modEntries.length === 0) {
    return `${GENERATED_BANNER}

/** MOD 存储迁移静态 import 映射（Next.js 需静态可分析路径） */
export const MIGRATION_IMPORTERS: Record<string, Record<string, () => Promise<{ migrate?: (old: unknown) => unknown }>>> = {}
`
  }

  const blocks = modEntries.map(([modName, steps]) => {
    const lines = Object.entries(steps)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([stepKey, importPath]) =>
          `    '${stepKey}': () => import('${importPath}') as Promise<{ migrate?: (old: unknown) => unknown }>,`,
      )
    return `  '${modName}': {\n${lines.join('\n')}\n  },`
  })

  return `${GENERATED_BANNER}

/** MOD 存储迁移静态 import 映射（Next.js 需静态可分析路径） */
export const MIGRATION_IMPORTERS: Record<string, Record<string, () => Promise<{ migrate?: (old: unknown) => unknown }>>> = {
${blocks.join('\n')}
}
`
}

/** @param {string[]} modDirs */
export function scanCompatibilityFiles(modDirs) {
  /** @type {Record<string, Record<string, string>>} */
  const map = {}
  for (const modName of modDirs) {
    const compatDir = path.join(MODS_DIR, modName, 'compatibility')
    if (!fs.existsSync(compatDir)) continue
    for (const file of fs.readdirSync(compatDir)) {
      if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue
      const otherMod = file.replace(/\.ts$/, '')
      if (!/^mod-[a-z]+(-[a-z0-9]+)*$/.test(otherMod)) continue
      if (!map[modName]) map[modName] = {}
      map[modName][otherMod] = `@/mods/${modName}/compatibility/${otherMod}`
    }
  }
  return map
}

/** @param {string[]} modDirs */
export function scanMigrationFiles(modDirs) {
  /** @type {Record<string, Record<string, string>>} */
  const map = {}
  for (const modName of modDirs) {
    const migDir = path.join(MODS_DIR, modName, 'migrations')
    if (!fs.existsSync(migDir)) continue
    for (const file of fs.readdirSync(migDir)) {
      if (!/^\d+\.\d+\.\d+-\d+\.\d+\.\d+\.ts$/.test(file)) continue
      const stepKey = file.replace(/\.ts$/, '')
      if (!map[modName]) map[modName] = {}
      map[modName][stepKey] = `@/mods/${modName}/migrations/${stepKey}`
    }
  }
  return map
}
