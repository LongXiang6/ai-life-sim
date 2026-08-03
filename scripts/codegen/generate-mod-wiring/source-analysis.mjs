/**
 * Purpose: Read MOD source and derive manifest, subsystem, and Remote API metadata.
 * Owner: code-generation
 * Responsibility: Source discovery and deterministic metadata extraction only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { MODS_DIR } from './context.mjs'

export function listModDirs() {
  return fs.readdirSync(MODS_DIR)
    .filter((name) => name.startsWith('mod-') && fs.statSync(path.join(MODS_DIR, name)).isDirectory())
    .sort()
}

/** @param {string} filePath */
export function readFile(filePath) {
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

/**
 * @param {string} manifestContent
 * @returns {string[]}
 */
export function parseManifestSubsystems(manifestContent) {
  const match = manifestContent.match(/subsystems:\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
}

/**
 * @param {string} manifestContent
 * @returns {{ emits: string[], listens: string[] }}
 */
export function parseManifestEvents(manifestContent) {
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
export function parseManifestStores(manifestContent) {
  const match = manifestContent.match(/stores:\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
}

/**
 * @param {string} manifestContent
 * @param {string} fieldName
 * @returns {{ declared: boolean, values: string[] }}
 */
export function parseManifestStringArray(manifestContent, fieldName) {
  const match = manifestContent.match(new RegExp(`\\b${fieldName}:\\s*\\[([\\s\\S]*?)\\]`))
  if (!match) return { declared: false, values: [] }
  return {
    declared: true,
    values: [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]),
  }
}

/**
 * @param {string} manifestContent
 * @param {string[]} inferred
 * @returns {{ declared: boolean, values: string[] }}
 */
export function resolveRemoteApiContract(manifestContent, inferred) {
  const explicit = parseManifestStringArray(manifestContent, 'remoteApi')
  return explicit.declared
    ? { declared: true, values: [...new Set(explicit.values)].sort() }
    : { declared: false, values: [...new Set(inferred)].sort() }
}

/**
 * @param {string} modDir
 * @returns {Map<string, string>} className → singletonExportName
 */
export function scanSubsystemSingletons(modDir) {
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
export function buildSubsystemAliases(modDir, classNames) {
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
export function extractRemoteApiExports(indexContent) {
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
export function assertRemoteApiExtractionIsLineEndingAgnostic() {
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

/** manifest.remoteApi 是显式 allowlist；空数组必须关闭自动推导。 */
export function assertExplicitRemoteApiPrecedence() {
  const inferred = ['autoDiscovered', 'secondaryExport']
  const cases = [
    { manifest: 'export default defineMod({})', expected: inferred },
    { manifest: 'export default defineMod({ remoteApi: [] })', expected: [] },
    { manifest: "export default defineMod({ remoteApi: ['declaredOnly'] })", expected: ['declaredOnly'] },
  ]

  for (const testCase of cases) {
    const actual = resolveRemoteApiContract(testCase.manifest, inferred).values
    if (actual.length !== testCase.expected.length
      || actual.some((name, index) => name !== testCase.expected[index])) {
      throw new Error(`[generate-mod-wiring] manifest.remoteApi 优先级回归: ${JSON.stringify(actual)}`)
    }
  }
}

/**
 * @param {string} modName
 * @param {string} className
 * @param {Map<string, string>} engineSingletons
 * @returns {string | null}
 */
