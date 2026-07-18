/**
 * @module generate-mod-wiring.mjs
 * @description 自动生成 MOD 接线文件（importers / 子系统别名 / 引擎子系统 / Remote API 契约）
 *
 * 用法:
 *   node scripts/codegen/generate-mod-wiring.mjs          # 写入生成文件
 *   node scripts/codegen/generate-mod-wiring.mjs --check  # 仅校验，有漂移则 exit 1
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
const MODS_DIR = path.join(ROOT, 'src', 'mods')
const CHECK_ONLY = process.argv.includes('--check')

const GENERATED_BANNER = `/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */`

/** @returns {string[]} */
function listModDirs() {
  return fs.readdirSync(MODS_DIR)
    .filter((name) => name.startsWith('mod-') && fs.statSync(path.join(MODS_DIR, name)).isDirectory())
    .sort()
}

/** @param {string} filePath */
function readFile(filePath) {
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

/**
 * @param {string} manifestContent
 * @returns {string[]}
 */
function parseManifestSubsystems(manifestContent) {
  const match = manifestContent.match(/subsystems:\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
}

/**
 * @param {string} manifestContent
 * @returns {{ emits: string[], listens: string[] }}
 */
function parseManifestEvents(manifestContent) {
  const result = { emits: [], listens: [] }
  const emitsMatch = manifestContent.match(/emits:\s*\[([\s\S]*?)\]/)
  if (emitsMatch) {
    result.emits = [...emitsMatch[1].matchAll(/'([\w:-]+)'/g)].map((m) => m[1])
  }
  const listensMatch = manifestContent.match(/listens:\s*\[([\s\S]*?)\]/)
  if (listensMatch) {
    result.listens = [...listensMatch[1].matchAll(/'([\w:-]+)'/g)].map((m) => m[1])
  }
  return result
}

/**
 * @param {string} manifestContent
 * @returns {string[]}
 */
function parseManifestPrompts(manifestContent) {
  const match = manifestContent.match(/prompts:\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1])
}

/**
 * @param {string} manifestContent
 * @returns {string[]}
 */
function parseManifestStores(manifestContent) {
  const match = manifestContent.match(/stores:\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
}

/**
 * @param {string} modDir
 * @returns {Map<string, string>} className → singletonExportName
 */
function scanSubsystemSingletons(modDir) {
  const map = new Map()
  const subDir = path.join(modDir, 'subsystems')
  if (!fs.existsSync(subDir)) return map

  const files = fs.readdirSync(subDir).filter((f) => f.endsWith('.ts'))
  const re = /export\s+const\s+(\w+)\s*=\s*new\s+(\w+)\s*\(/g

  for (const file of files) {
    const content = readFile(path.join(subDir, file))
    for (const m of content.matchAll(re)) {
      map.set(m[2], m[1])
    }
  }
  return map
}

/**
 * @param {string} className
 * @returns {string}
 */
function defaultCamelCase(className) {
  return className.charAt(0).toLowerCase() + className.slice(1)
}

/**
 * @param {string} modDir
 * @param {string[]} classNames
 * @returns {Record<string, string>}
 */
function buildSubsystemAliases(modDir, classNames) {
  const singletons = scanSubsystemSingletons(modDir)
  /** @type {Record<string, string>} */
  const aliases = {}

  for (const className of classNames) {
    const singletonName = singletons.get(className)
    if (!singletonName) continue
    const expected = defaultCamelCase(className)
    if (singletonName !== expected) {
      aliases[className] = singletonName
    }
  }
  return aliases
}

/**
 * @param {string} block
 * @returns {string}
 */
function stripLineComments(block) {
  return block
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isLikelyRemoteFunction(name) {
  if (!name || name.startsWith('use') || name.startsWith('_')) return false
  if (name === 'default' || name === 'lifecycle') return false
  if (name.endsWith('System')) return false
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return false
  // React 组件多为 PascalCase，Remote 只注册业务 API 函数
  if (/^[A-Z]/.test(name) && !name.endsWith('Prompt')) return false
  // PromptTemplate 对象（narrativePrompt 等）；buildXxxPrompt 函数保留
  if (name.endsWith('Prompt') && !name.startsWith('build')) return false
  if (name.endsWith('Schema')) return false
  if (['orchestrator', 'narrativeParser', 'summaryCompressor', 'timeSystem', 'memoryEngine',
    'subsystemRelevance', 'memoryLifecycle', 'memoryForgetting', 'causalDelay',
    'plotStructure', 'foreshadowing', 'coreMemory', 'simulationBridge'].includes(name)) {
    return false
  }
  return true
}

/**
 * @param {string} indexContent
 * @returns {string[]}
 */
function extractRemoteApiExports(indexContent) {
  const names = new Set()

  for (const m of indexContent.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
    if (isLikelyRemoteFunction(m[1])) names.add(m[1])
  }
  for (const m of indexContent.matchAll(/export\s+function\s+(\w+)/g)) {
    if (isLikelyRemoteFunction(m[1])) names.add(m[1])
  }
  for (const m of indexContent.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g)) {
    if (isLikelyRemoteFunction(m[1])) names.add(m[1])
  }
  for (const m of indexContent.matchAll(/export\s+const\s+(\w+)\s*=\s*async\s+function/g)) {
    if (isLikelyRemoteFunction(m[1])) names.add(m[1])
  }

  for (const m of indexContent.matchAll(/export\s*\{([^}]+)\}(?:\s*from\s*['"][^'"]+['"])?/g)) {
    const lineStart = indexContent.lastIndexOf('\n', m.index ?? 0) + 1
    const linePrefix = indexContent.slice(lineStart, m.index)
    if (linePrefix.includes('export type')) continue

    const cleaned = stripLineComments(m[1])
    for (const part of cleaned.split(',')) {
      const raw = part.trim()
      if (!raw) continue
      const name = raw.split(/\s+as\s+/)[0].trim()
      if (name.startsWith('type ')) continue
      if (isLikelyRemoteFunction(name)) names.add(name)
    }
  }

  return [...names].sort()
}

/** 生成器必须在 Windows CRLF 与 Linux LF 工作副本中得到完全相同的 Remote 契约。 */
function assertRemoteApiExtractionIsLineEndingAgnostic() {
  const lfSource = `export {
  // 常量不属于 Remote API
  STATIC_VALUE,
  // 业务函数需要注册
  computeValue,
} from './public-api'
`
  const expected = ['computeValue']

  for (const source of [lfSource, lfSource.replaceAll('\n', '\r\n')]) {
    const actual = extractRemoteApiExports(source)
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
      throw new Error(`[generate-mod-wiring] Remote API 导出解析不支持当前换行格式: ${JSON.stringify(actual)}`)
    }
  }
}

/**
 * @param {string} modName
 * @param {string} className
 * @param {Map<string, string>} engineSingletons
 * @returns {string | null}
 */
function resolveEngineSingletonExport(modName, className, engineSingletons) {
  if (modName !== 'mod-engine') return null
  return engineSingletons.get(className) ?? null
}

function generateModControlImporters(modDirs) {
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
function classNameToSubsystemFile(className) {
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
function generateModSubsystemImporters(entries) {
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

function generateModImporters(modDirs) {
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
function generateModSecondaryApiImporters(secondaryMap) {
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

function generateModImportersReExport() {
  return `${GENERATED_BANNER}

/** @deprecated 实现已迁至 core/mod-loader/mod-importers.generated.ts */
export { MOD_IMPORTERS } from '@/core/mod-loader/mod-importers.generated'
`
}

/**
 * @param {Record<string, Record<string, string>>} compatMap modName → otherMod → import path
 */
function generateCompatImporters(compatMap) {
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
function generateMigrationImporters(migrationMap) {
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
function scanCompatibilityFiles(modDirs) {
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
function scanMigrationFiles(modDirs) {
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

function generateSubsystemAliases(allAliases) {
  const entries = Object.entries(allAliases).sort(([a], [b]) => a.localeCompare(b))
  const lines = entries.map(([className, exportName]) => `  ${className}: '${exportName}',`)
  return `${GENERATED_BANNER}

/** 子系统类名 → index.ts 单例导出名（与默认 camelCase 不一致时的别名） */
export const SUBSYSTEM_SINGLETON_ALIASES: Record<string, string> = {
${lines.length ? lines.join('\n') : '  // 无别名'}
}
`
}

function generateEngineSubsystems(manifestClasses, singletonMap) {
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
function generateModRegistry(modDirs) {
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

function parsePromptContextFields() {
  const content = readFile(path.join(ROOT, 'src', 'foundation', 'types', 'narrative.types.ts'))
  const match = content.match(/interface PromptContext \{([\s\S]*?)\n\}/)
  if (!match) return []
  return [...match[1].matchAll(/^\s+(\w+)\??\s*:/gm)].map((m) => m[1])
}

function parseNarrativePromptVars() {
  const content = readFile(path.join(ROOT, 'src', 'mods', 'mod-engine', 'prompts', 'narrative-prompt.ts'))
  const match = content.match(/variables:\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
}

/**
 * @param {string} content
 * @returns {Record<string, string[]>}
 */
function parseSubsystemFieldContracts(content) {
  const start = content.indexOf('export const SUBSYSTEM_FIELD_CONTRACTS')
  // 派生表标题在重写后可能被删除；以第一个派生导出作为稳定边界。
  const end = content.indexOf('export const SUBSYSTEM_FIELD_MAP', start)
  /** @type {Record<string, string[]>} */
  const contracts = {}
  if (start < 0 || end < 0) return contracts

  const lines = content.slice(start, end).split(/\r?\n/)
  let currentId = ''
  let inFields = false

  for (const line of lines) {
    const subsystemMatch = line.match(/^\s{2}'([^']+)':\s*\{/)
    if (subsystemMatch && !inFields) {
      currentId = subsystemMatch[1]
      contracts[currentId] = []
      continue
    }

    if (currentId && /^\s{4}fields:\s*\{/.test(line)) {
      inFields = true
      continue
    }

    if (inFields && /^\s{4}\},/.test(line)) {
      inFields = false
      currentId = ''
      continue
    }

    if (inFields && currentId) {
      const fieldMatch = line.match(/^\s{6}([A-Za-z]\w*):\s*\{/)
      if (fieldMatch) {
        contracts[currentId].push(fieldMatch[1])
      }
    }
  }

  return contracts
}

/**
 * @param {string} content
 * @returns {{ mapKeys: string[], zodSchemas: Record<string, string[]> }}
 */
function parseSubsystemFieldRegistry(content) {
  const zodSchemas = parseSubsystemFieldContracts(content)
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
 * 从 manifest.prompts 自动生成 ADAPTATION_PROMPT_MAP
 * 约定：prompt 名称 = 'adaptation-{subsystemId}-prompt'
 *       导出名 = 'adaptation{PascalCase(subsystemId)}Prompt'
 * @param {string[]} modDirs
 * @param {Map<string, string[]>} modToPromptNames
 * @returns {string}
 */
function generateAdaptationPromptRegistry(modDirs, modToPromptNames) {
  const imports = []
  const entries = []

  for (const modName of modDirs) {
    const promptNames = modToPromptNames.get(modName) ?? []
    const adaptationPrompts = promptNames.filter((p) => p.startsWith('adaptation-'))

    for (const promptName of adaptationPrompts) {
      // 提取 subsystemId：'adaptation-cultivation-prompt' → 'cultivation'
      let subsystemId = promptName.slice('adaptation-'.length)
      if (subsystemId.endsWith('-prompt')) {
        subsystemId = subsystemId.slice(0, -'-prompt'.length)
      }

      // kebab → PascalCase
      const pascalCase = subsystemId
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
      const exportName = `adaptation${pascalCase}Prompt`

      imports.push(`import { ${exportName} } from '@/mods/${modName}/prompts/${promptName}'`)
      entries.push(`  '${subsystemId}': ${exportName}`)
    }
  }

  return `${GENERATED_BANNER}

import type { PromptTemplate } from '@/foundation'

${imports.join('\n')}

/** 子系统 ID → adaptation PromptTemplate 映射（由 manifest.prompts 自动生成，勿手动编辑） */
export const ADAPTATION_PROMPT_MAP: Record<string, PromptTemplate> = {
${entries.join(',\n')}
}
`
}

/**
 * 从 manifest.stores 自动生成全量 store 导出
 * @param {string[]} modDirs
 * @param {Map<string, string[]>} modToStoreNames
 * @returns {string}
 */
function generateAllStores(modDirs, modToStoreNames) {
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
function generateEventsConstants(modDirs, modToEvents) {
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

function parseCampaignStageNames() {
  const content = readFile(path.join(ROOT, 'src', 'mods', 'mod-engine', 'campaigns', 'default', 'index.ts'))
  return [...content.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
}

/**
 * @param {string} manifestContent
 * @returns {string[] | null}
 */
function parseCampaignHooksFromManifest(manifestContent) {
  const match = manifestContent.match(/campaignHooks:\s*\{[\s\S]*?stages:\s*\[([\s\S]*?)\]/)
  if (!match) return null
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/**
 * @param {string[]} manifestStages
 * @param {string[]} indexStages
 */
function validateCampaignStages(manifestStages, indexStages) {
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
function generatePromptContextContract(ctxFields, narrativeVars) {
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
function generateSubsystemFieldKeys(mapKeys, zodSchemas) {
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
function generateCampaignStages(stages) {
  return `${GENERATED_BANNER}

/** 默认 campaign 阶段名（codegen 自 campaigns/default/index.ts） */
export const DEFAULT_CAMPAIGN_STAGE_NAMES = ${JSON.stringify(stages, null, 2)} as const
`
}

function generateRemoteContracts(contracts) {
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
function writeOrCheck(filePath, content) {
  const normalized = content.replace(/\r\n/g, '\n')
  if (CHECK_ONLY) {
    const existing = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
      : ''
    if (existing !== normalized) {
      console.error(`[generate-mod-wiring] 漂移: ${path.relative(ROOT, filePath)}`)
      console.error('  运行 npm run generate:wiring 更新')
      return false
    }
    return true
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, normalized, 'utf8')
  console.log(`[generate-mod-wiring] 写入 ${path.relative(ROOT, filePath)}`)
  return true
}

function main() {
  assertRemoteApiExtractionIsLineEndingAgnostic()
  const modDirs = listModDirs()
  /** @type {Record<string, string>} */
  const allAliases = {}
  /** @type {Record<string, string[]>} */
  const secondaryApiImporters = {}
  /** @type {Record<string, string[]>} */
  const remoteContracts = {}
  /** @type {string[]} */
  let engineManifestClasses = []
  /** @type {Map<string, string>} */
  const engineSingletons = new Map()
  /** @type {Map<string, string[]>} 记录各 MOD manifest.prompts 字段内容 */
  const modToPromptNames = new Map()
  /** @type {Map<string, string[]>} 记录各 MOD manifest.stores 字段内容 */
  const modToStoreNames = new Map()
  /** @type {Map<string, { emits: string[], listens: string[] }>} */
  const modToEvents = new Map()

  for (const modName of modDirs) {
    const modPath = path.join(MODS_DIR, modName)
    const manifestPath = path.join(modPath, 'manifest.ts')
    const manifestContent = readFile(manifestPath)
    if (!manifestContent) continue

    const subsystems = parseManifestSubsystems(manifestContent)
    const promptNames = parseManifestPrompts(manifestContent)
    if (promptNames.length > 0) modToPromptNames.set(modName, promptNames)
    const storeNames = parseManifestStores(manifestContent)
    if (storeNames.length > 0) modToStoreNames.set(modName, storeNames)
    const events = parseManifestEvents(manifestContent)
    if (events.emits.length > 0 || events.listens.length > 0) modToEvents.set(modName, events)
    const aliases = buildSubsystemAliases(modPath, subsystems)
    if (modName !== 'mod-engine') {
      Object.assign(allAliases, aliases)
    }

    const indexPath = path.join(modPath, 'index.ts')
    const remoteFnSet = new Set(extractRemoteApiExports(readFile(indexPath)))
    const secondaryMatch = manifestContent.match(/secondaryPublicEntries:\s*\[([\s\S]*?)\]/)
    if (secondaryMatch) {
      const entries = [...secondaryMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
      if (entries.length > 0) {
        secondaryApiImporters[modName] = entries
      }
      for (const entry of entries) {
        const entryPath = path.join(modPath, entry)
        const entryContent = readFile(entryPath)
        if (entryContent) {
          for (const fn of extractRemoteApiExports(entryContent)) {
            remoteFnSet.add(fn)
          }
        }
      }
    }
    const remoteFns = [...remoteFnSet].sort()
    if (remoteFns.length > 0) {
      remoteContracts[modName] = remoteFns
    }

    if (modName === 'mod-engine') {
      engineManifestClasses = subsystems
      const scanned = scanSubsystemSingletons(modPath)
      for (const [cls, singleton] of scanned) {
        engineSingletons.set(cls, singleton)
      }
    }
  }

  const ctxFields = parsePromptContextFields()
  const narrativeVars = parseNarrativePromptVars()
  const missingInCtx = narrativeVars.filter((v) => !ctxFields.includes(v))
  if (missingInCtx.length > 0) {
    console.error(`[generate-mod-wiring] narrative 模板变量不在 PromptContext 中: ${missingInCtx.join(', ')}`)
    if (CHECK_ONLY) process.exit(1)
  }

  const fieldRegistryPath = path.join(MODS_DIR, 'mod-engine', 'helpers', 'subsystem-field-registry.ts')
  const fieldRegistryContent = readFile(fieldRegistryPath)
  const { mapKeys, zodSchemas } = parseSubsystemFieldRegistry(fieldRegistryContent)

  const indexStages = parseCampaignStageNames()
  const engineManifestContent = readFile(path.join(MODS_DIR, 'mod-engine', 'manifest.ts'))
  const manifestStages = parseCampaignHooksFromManifest(engineManifestContent)
  validateCampaignStages(manifestStages, indexStages)

  const compatMap = scanCompatibilityFiles(modDirs)
  const migrationMap = scanMigrationFiles(modDirs)

  const subsystemEntries = []
  for (const name of modDirs) {
    if (name === 'mod-engine') continue
    const modPath = path.join(MODS_DIR, name)
    const manifestContent = readFile(path.join(modPath, 'manifest.ts'))
    const subs = parseManifestSubsystems(manifestContent)
    if (subs.length === 0) continue
    subsystemEntries.push({ name, classNames: subs, modDir: modPath })
  }

  const outputs = [
    [path.join(MODS_DIR, 'registry.generated.ts'), generateModRegistry(modDirs)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-control-importers.generated.ts'), generateModControlImporters(modDirs)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-subsystem-importers.generated.ts'), generateModSubsystemImporters(subsystemEntries)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-importers.generated.ts'), generateModImporters(modDirs)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-secondary-api-importers.generated.ts'), generateModSecondaryApiImporters(secondaryApiImporters)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'mod-importers.generated.ts'), generateModImportersReExport()],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'subsystem-aliases.generated.ts'), generateSubsystemAliases(allAliases)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'engine-subsystems.generated.ts'), generateEngineSubsystems(engineManifestClasses, engineSingletons)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'prompt-context-contract.generated.ts'), generatePromptContextContract(ctxFields, narrativeVars)],
    [path.join(MODS_DIR, 'mod-engine', 'helpers', 'subsystem-field-keys.generated.ts'), generateSubsystemFieldKeys(mapKeys, zodSchemas)],
    [path.join(MODS_DIR, 'mod-engine', 'campaigns', 'default', 'stages.generated.ts'), generateCampaignStages(indexStages)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'remote-contracts.generated.ts'), generateRemoteContracts(remoteContracts)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'compat-importers.generated.ts'), generateCompatImporters(compatMap)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'migration-importers.generated.ts'), generateMigrationImporters(migrationMap)],
    [path.join(MODS_DIR, 'mod-engine', 'helpers', 'adaptation-prompt-registry.generated.ts'), generateAdaptationPromptRegistry(modDirs, modToPromptNames)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'all-stores.generated.ts'), generateAllStores(modDirs, modToStoreNames)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'events.generated.ts'), generateEventsConstants(modDirs, modToEvents)],
  ]

  let ok = true
  for (const [filePath, content] of outputs) {
    if (!writeOrCheck(filePath, content)) ok = false
  }

  if (CHECK_ONLY) {
    if (!ok) process.exit(1)
    console.log('[generate-mod-wiring] 全部生成文件与源码一致')
    return
  }

  console.log(`[generate-mod-wiring] 完成: ${modDirs.length} MOD, ${Object.keys(allAliases).length} 别名, ${Object.keys(remoteContracts).length} Remote 契约`)
}

main()
