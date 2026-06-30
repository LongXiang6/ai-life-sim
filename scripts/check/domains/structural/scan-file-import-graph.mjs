/**
 * @module scan-file-import-graph.mjs
 * @description 文件级 import 图循环检测（D-07）
 */

import fs from 'node:fs'
import path from 'node:path'
import { logFail, logRefactorHint, logDomainSummary } from '../../lib/quiet.mjs'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
const SRC = path.join(ROOT, 'src')

/** @param {string} dir @param {string[]} out */
function walkTsFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory() && ent.name !== 'node_modules' && !ent.name.startsWith('.')) {
      walkTsFiles(full, out)
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith('.generated.ts')) {
      out.push(full)
    }
  }
  return out
}

/** @param {string} content @param {string} fromFile */
function extractRelativeImports(content, fromFile) {
  const dir = path.dirname(fromFile)
  const deps = []
  for (const m of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const rel = m[1]
    const base = path.resolve(dir, rel)
    const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
    const hit = candidates.find((c) => fs.existsSync(c))
    if (hit) deps.push(path.normalize(hit))
  }
  return deps
}

/** @param {string} filePath */
function isWatchedFile(filePath) {
  const rel = path.relative(SRC, filePath).replace(/\\/g, '/')
  if (rel.includes('/subsystems/') && rel.endsWith('-system.ts')) return true
  if (rel.endsWith('world-init-bundle.ts')) return true
  if (rel.endsWith('subsystems/index.ts')) return true
  if (rel.endsWith('world-init-api.ts')) return true
  if (/\/mods\/mod-[^/]+\/index\.ts$/.test(rel)) return true
  return false
}

const allFiles = walkTsFiles(SRC).filter(isWatchedFile)
/** @type {Map<string, string[]>} */
const graph = new Map()

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8')
  graph.set(file, extractRelativeImports(content, file))
}

/** @type {string[][]} */
const cycles = []
const visited = new Set()
const stack = []
const inStack = new Set()

/** @param {string} node */
function dfs(node) {
  if (inStack.has(node)) {
    const idx = stack.indexOf(node)
    if (idx >= 0) cycles.push([...stack.slice(idx), node])
    return
  }
  if (visited.has(node)) return
  visited.add(node)
  inStack.add(node)
  stack.push(node)
  for (const next of graph.get(node) ?? []) {
    if (graph.has(next)) dfs(next)
  }
  stack.pop()
  inStack.delete(node)
}

for (const node of graph.keys()) dfs(node)

let failed = 0
const unique = new Set()
for (const cycle of cycles) {
  const key = cycle.map((f) => path.relative(SRC, f).replace(/\\/g, '/')).join(' -> ')
  if (unique.has(key)) continue
  unique.add(key)
  logFail(`[FAIL] 文件级循环依赖: ${key}`)
  failed++
}

// 高度数节点 — D-07 分级（barrel FAIL / 其余 HINT）
const BARREL_FAIL_IMPORTS = 10
const SYSTEM_FAIL_IMPORTS = 14
const HINT_IMPORTS = 5

for (const [file, deps] of graph) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/')
  const count = deps.length
  if (count < HINT_IMPORTS) continue

  const isSubsystemBarrel = /\/subsystems\/index\.ts$/.test(rel)
  const isSubsystemFile = rel.includes('/subsystems/') && rel.endsWith('-system.ts')

  if (isSubsystemBarrel) {
    if (count >= BARREL_FAIL_IMPORTS) {
      logFail(`[FAIL] [D-07] ${rel} — subsystems barrel ${count} 个相对 import（loader 已按文件 codegen，请删除 barrel 或拆 secondaryPublicEntries）`)
      failed++
    } else {
      logRefactorHint(`[REFACTOR-HINT] [D-07] ${rel} — ${count} 个相对 import，评估删除 barrel`)
    }
    continue
  }

  if (isSubsystemFile && count >= SYSTEM_FAIL_IMPORTS) {
    logFail(`[FAIL] [D-07] ${rel} — 子系统文件 ${count} 个相对 import，请提取 shared 模块`)
    failed++
    continue
  }

  logRefactorHint(`[REFACTOR-HINT] [D-07] ${rel} — ${count} 个相对 import，评估 barrel 拆分`)
}

if (failed === 0) {
  logDomainSummary('wiring-import-graph', 'PASS', `${graph.size} 个监视文件无环`)
} else {
  logDomainSummary('wiring-import-graph', 'FAIL', `${failed} 个环`)
  process.exit(1)
}
