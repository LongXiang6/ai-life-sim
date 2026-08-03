/**
 * Purpose: Generate MOD registry, Prompt, field, campaign, event, store, and Remote API contract sources.
 * Owner: code-generation
 * Responsibility: Declarative contract source projection and its source validation only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { parseSubsystemFieldContracts } from '../subsystem-field-contract-parser.mjs'
import { CHECK_ONLY, GENERATED_BANNER, MODS_DIR, ROOT } from './context.mjs'
import { readFile } from './source-analysis.mjs'

function sortModDirsForRegistry(modDirs) {
  return [...modDirs].sort((a, b) => {
    if (a === 'mod-engine') return -1
    if (b === 'mod-engine') return 1
    return a.localeCompare(b)
  })
}

/**
 * @param {string} modName
 * @returns {string}
 */
function toManifestImportName(modName) {
  if (modName === 'mod-npc') return 'modNPCManifest'
  const slug = modName.slice(4)
  const pascal = slug.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  return `mod${pascal}Manifest`
}

/**
 * @param {string[]} modDirs
 * @returns {string}
 */
export function generateModRegistry(modDirs) {
  const ordered = sortModDirsForRegistry(
    modDirs.filter((name) => fs.existsSync(path.join(MODS_DIR, name, 'manifest.ts'))),
  )
  const imports = ordered.map((name) => {
    const varName = toManifestImportName(name)
    return `import ${varName} from './${name}/manifest'`
  })
  const entries = ordered.map((name) => `  ${toManifestImportName(name)},`)
  return `${GENERATED_BANNER}

import type { ModManifest } from '@/foundation'

${imports.join('\n')}

/** 全部已注册 MOD 的 manifest（加载顺序由依赖图解析，此数组顺序仅用于注册） */
export const MOD_REGISTRY: ModManifest[] = [
${entries.join('\n')}
]
`
}

export function parsePromptContextFields() {
  const content = readFile(path.join(ROOT, 'src', 'foundation', 'types', 'narrative.types.ts'))
  const match = content.match(/interface PromptContext \{([\s\S]*?)\n\}/)
  if (!match) return []
  return [...match[1].matchAll(/^\s+(\w+)\??\s*:/gm)].map((m) => m[1])
}

export function parseNarrativePromptVars() {
  const content = readFile(path.join(ROOT, 'src', 'mods', 'mod-engine', 'prompts', 'narrative-prompt.ts'))
  const match = content.match(/variables:\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
}

/**
 * @param {string} content
 * @returns {{ mapKeys: string[], zodSchemas: Record<string, string[]> }}
 */
export function parseSubsystemFieldRegistry(content) {
  let zodSchemas
  try {
    zodSchemas = parseSubsystemFieldContracts(content)
  } catch (error) {
    console.error(`[generate-mod-wiring] SUBSYSTEM_FIELD_CONTRACTS 解析失败: ${error instanceof Error ? error.message : String(error)}`)
    if (CHECK_ONLY) process.exit(1)
    throw error
  }
  const mapKeys = Object.keys(zodSchemas)
  if (mapKeys.length === 0) {
    console.error('[generate-mod-wiring] 未解析到 SUBSYSTEM_FIELD_CONTRACTS')
    if (CHECK_ONLY) process.exit(1)
  }

  const requiredDerivations = [
    'buildSubsystemFieldMap(SUBSYSTEM_FIELD_CONTRACTS)',
    'buildSubsystemChangeSchemas(SUBSYSTEM_FIELD_CONTRACTS)',
  ]
  for (const marker of requiredDerivations) {
    if (!content.includes(marker)) {
      console.error(`[generate-mod-wiring] subsystem-field-registry.ts 缺少派生调用: ${marker}`)
      if (CHECK_ONLY) process.exit(1)
    }
  }

  return { mapKeys, zodSchemas }
}

/**
 * 从 manifest.stores 自动生成全量 store 导出
 * @param {string[]} modDirs
 * @param {Map<string, string[]>} modToStoreNames
 * @returns {string}
 */
export function generateAllStores(modDirs, modToStoreNames) {
  const exports = []

  for (const modName of modDirs) {
    const storeNames = modToStoreNames.get(modName) ?? []
    for (const storeName of storeNames) {
      exports.push(`export { ${storeName} } from '@/mods/${modName}/store'`)
    }
  }

  return `${GENERATED_BANNER}

${exports.join('\n')}
`
}

/**
 * 从 manifest.events 自动生成事件常量
 * 'mod-power-system:stage-breakthrough' → MOD_POWER_SYSTEM_STAGE_BREAKTHROUGH
 * @param {string[]} modDirs
 * @param {Map<string, { emits: string[], listens: string[] }>} modToEvents
 * @returns {string}
 */
export function generateEventsConstants(modDirs, modToEvents) {
  const allEvents = new Map() // eventName → constantName
  const lines = []

  for (const modName of modDirs) {
    const ev = modToEvents.get(modName)
    if (!ev) continue

    const allModEvents = [...ev.emits, ...ev.listens]
    if (allModEvents.length === 0) continue

    lines.push(`  // ${modName}`)
    for (const eventName of allModEvents) {
      const constName = eventName.toUpperCase().replace(/[:-]/g, '_')
      if (allEvents.has(eventName)) continue // deduplicate
      allEvents.set(eventName, constName)
      lines.push(`  ${constName}: '${eventName}',`)
    }
  }

  return `${GENERATED_BANNER}

/** 全项目事件常量（由 manifest.events 自动生成，勿手动编辑） */
export const EVENTS = {
${lines.join('\n')}
} as const
`
}

export function parseCampaignStageNames() {
  const content = readFile(path.join(ROOT, 'src', 'mods', 'mod-engine', 'campaigns', 'default', 'index.ts'))
  return [...content.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
}

/**
 * @param {string} manifestContent
 * @returns {string[] | null}
 */
export function parseCampaignHooksFromManifest(manifestContent) {
  const match = manifestContent.match(/campaignHooks:\s*\{[\s\S]*?stages:\s*\[([\s\S]*?)\]/)
  if (!match) return null
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/**
 * @param {string[]} manifestStages
 * @param {string[]} indexStages
 */
export function validateCampaignStages(manifestStages, indexStages) {
  if (!manifestStages || manifestStages.length === 0) {
    console.error('[generate-mod-wiring] mod-engine manifest 缺少 campaignHooks.stages')
    if (CHECK_ONLY) process.exit(1)
    return false
  }
  const manifestSet = manifestStages.join('|')
  const indexSet = indexStages.join('|')
  if (manifestSet !== indexSet) {
    console.error('[generate-mod-wiring] campaignHooks.stages 与 campaigns/default/index.ts 不一致')
    console.error(`  manifest: ${manifestStages.join(', ')}`)
    console.error(`  index.ts: ${indexStages.join(', ')}`)
    if (CHECK_ONLY) process.exit(1)
    return false
  }
  return true
}

/**
 * @param {string[]} ctxFields
 * @param {string[]} narrativeVars
 * @returns {string}
 */
export function generatePromptContextContract(ctxFields, narrativeVars) {
  return `${GENERATED_BANNER}

/** PromptContext 接口字段（codegen 自 foundation/types/narrative.types.ts） */
export const PROMPT_CONTEXT_FIELDS = ${JSON.stringify(ctxFields, null, 2)} as const

/** narrative-prompt 模板 variables[] */
export const NARRATIVE_PROMPT_VARIABLES = ${JSON.stringify(narrativeVars, null, 2)} as const
`
}

/**
 * @param {string[]} mapKeys
 * @param {Record<string, string[]>} zodSchemas
 * @returns {string}
 */
export function generateSubsystemFieldKeys(mapKeys, zodSchemas) {
  return `${GENERATED_BANNER}

/** SUBSYSTEM_FIELD_CONTRACTS 注册的子系统 id 列表 */
export const SUBSYSTEM_FIELD_REGISTRY_KEYS = ${JSON.stringify(mapKeys, null, 2)} as const

/** SUBSYSTEM_FIELD_CONTRACTS 各子系统字段（codegen 自动推导） */
export const SUBSYSTEM_ZOD_FIELD_KEYS: Record<string, readonly string[]> = ${JSON.stringify(zodSchemas, null, 2)} as const
`
}

/**
 * @param {string[]} stages
 * @returns {string}
 */
export function generateCampaignStages(stages) {
  return `${GENERATED_BANNER}

/** 默认 campaign 阶段名（codegen 自 campaigns/default/index.ts） */
export const DEFAULT_CAMPAIGN_STAGE_NAMES = ${JSON.stringify(stages, null, 2)} as const
`
}

export function generateRemoteContracts(contracts) {
  const entries = Object.entries(contracts).sort(([a], [b]) => a.localeCompare(b))
  const lines = entries.map(([mod, fns]) => {
    const fnList = fns.map((f) => `'${f}'`).join(', ')
    return `  '${mod}': [${fnList}],`
  })
  return `${GENERATED_BANNER}

/** 各 MOD index.ts 导出的 Remote API 函数名（供运行时契约校验） */
export const REMOTE_API_CONTRACTS: Record<string, readonly string[]> = {
${lines.join('\n')}
}
`
}

/** @param {string} filePath @param {string} content */
