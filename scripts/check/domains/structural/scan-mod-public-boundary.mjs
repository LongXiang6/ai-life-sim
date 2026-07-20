#!/usr/bin/env node
/**
 * @module scan-mod-public-boundary.mjs
 * @description 跨 MOD public boundary 扫描：只允许 index.ts、manifest.secondaryPublicEntries、生成器/显式债务清单。
 */
import fs from 'node:fs'
import path from 'node:path'
import { isQuiet, logFail, logOk, logRefactorHint, logDomainSummary } from '../../lib/quiet.mjs'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
const SRC = path.join(ROOT, 'src')
const MODS = path.join(SRC, 'mods')
const rulesPath = path.join(ROOT, 'scripts/check/rules/architecture-rules.json')
const archRules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
const declaredServerOnlyEntries = new Map()

/** @param {string} rel */
function normalizeRel(rel) {
  return rel.replace(/\\/g, '/')
}

/** @param {string} dir @param {string[]} out */
function walkTsFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory() && !ent.name.startsWith('.') && ent.name !== 'node_modules') {
      walkTsFiles(full, out)
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) {
      out.push(full)
    }
  }
  return out
}

/** @param {string} content */
function extractModImports(content) {
  const imports = []
  const patterns = [
    /(?:from\s*|import\s*\(\s*)['"](@\/mods\/(mod-[a-z0-9-]+)(?:\/([^'"]+))?)['"]/g,
    /export\s+[^'"\n]*from\s*['"](@\/mods\/(mod-[a-z0-9-]+)(?:\/([^'"]+))?)['"]/g,
  ]
  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      imports.push({ spec: match[1], targetMod: match[2], subpath: match[3] ?? '' })
    }
  }
  return imports
}

/** @param {string} rel */
function sourceModName(rel) {
  return rel.match(/^src\/mods\/(mod-[a-z0-9-]+)\//)?.[1] ?? null
}

/** @param {string} rel */
function isGeneratedBoundaryException(rel) {
  if (rel.endsWith('.generated.ts')) return true
  return (archRules.generatedPublicBoundaryExceptions ?? []).some((prefix) => rel.startsWith(prefix))
}

/** @param {string} subpath */
function normalizeSubpath(subpath) {
  return subpath.replace(/\.(ts|tsx)$/, '').replace(/\/index$/, '')
}

/** @param {string} targetMod @param {string} subpath */
function isAllowedSecondaryEntry(targetMod, subpath) {
  const allowed = archRules.allowedSecondaryPublicImports?.[targetMod] ?? []
  const serverOnly = archRules.allowedServerOnlyPublicImports?.[targetMod] ?? []
  const normalized = normalizeSubpath(subpath)
  if (allowed.includes(normalized)) return true
  return serverOnly.includes(normalized)
    && declaredServerOnlyEntries.get(targetMod)?.has(normalized) === true
}


/** @param {string} rel @param {string} subpath */
function isStoreRegistryException(rel, subpath) {
  return (archRules.storeRegistryPublicBoundaryExceptions ?? []).some((item) => (
    item.file === rel && normalizeSubpath(subpath) === item.allowedSubpath
  ))
}

/** @param {string} rel @param {string} spec */
function debtEntry(rel, spec) {
  return (archRules.allowedCrossModDeepImports ?? []).find((item) => item.file === rel && item.import === spec)
}

let failed = 0
let debt = 0
const seen = new Set()

for (const entry of fs.readdirSync(MODS, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('mod-')) continue
  const manifestPath = path.join(MODS, entry.name, 'manifest.ts')
  if (!fs.existsSync(manifestPath)) continue
  const manifest = fs.readFileSync(manifestPath, 'utf8')
  const match = manifest.match(/serverOnlyPublicEntries:\s*\[([\s\S]*?)\]/)
  if (!match) continue
  const declared = new Set(
    [...match[1].matchAll(/['"]([^'"]+)['"]/g)]
      .map((item) => normalizeSubpath(item[1])),
  )
  declaredServerOnlyEntries.set(entry.name, declared)

  const allowed = new Set(archRules.allowedServerOnlyPublicImports?.[entry.name] ?? [])
  for (const subpath of declared) {
    if (!allowed.has(subpath)) {
      logFail(`[FAIL] [A-02] ${entry.name} serverOnlyPublicEntries 未登记架构规则: ${subpath}`)
      failed++
      continue
    }
    const sourcePath = path.join(MODS, entry.name, `${subpath}.ts`)
    if (!fs.existsSync(sourcePath)) {
      logFail(`[FAIL] [A-02] ${entry.name} serverOnlyPublicEntries 文件不存在: ${subpath}.ts`)
      failed++
      continue
    }
    const source = fs.readFileSync(sourcePath, 'utf8')
    if (!/import\s+['"]server-only['"]/.test(source)) {
      logFail(`[FAIL] [A-02] ${entry.name}/${subpath}.ts 缺少 server-only 硬门禁`)
      failed++
    }
    const generatedSecondaryPath = path.join(SRC, 'core', 'mod-loader', 'mod-secondary-api-importers.generated.ts')
    if (fs.existsSync(generatedSecondaryPath)) {
      const generated = fs.readFileSync(generatedSecondaryPath, 'utf8')
      if (generated.includes(`@/mods/${entry.name}/${subpath}`)) {
        logFail(`[FAIL] [A-02] ${entry.name}/${subpath} 被错误写入浏览器 Remote API wiring`)
        failed++
      }
    }
  }
}

for (const file of walkTsFiles(SRC)) {
  const rel = normalizeRel(path.relative(ROOT, file))
  if (isGeneratedBoundaryException(rel)) continue

  const fromMod = sourceModName(rel)
  const content = fs.readFileSync(file, 'utf8')
  for (const imp of extractModImports(content)) {
    if (!imp.subpath) continue
    if (fromMod && fromMod === imp.targetMod) continue

    const normalizedSubpath = normalizeSubpath(imp.subpath)
    if (normalizedSubpath === 'index') continue
    if (isAllowedSecondaryEntry(imp.targetMod, imp.subpath)) continue
    if (isStoreRegistryException(rel, imp.subpath)) continue

    const key = `${rel}|${imp.spec}`
    if (seen.has(key)) continue
    seen.add(key)

    const allowedDebt = debtEntry(rel, imp.spec)
    if (allowedDebt) {
      debt++
      if (!isQuiet()) {
        logRefactorHint(`[REFACTOR-HINT] [A-02] ${rel} — ${imp.spec}（历史债务: ${allowedDebt.reason ?? '待收敛'}）`)
      }
      continue
    }

    logFail(`[FAIL] [A-02] ${rel} — 跨 MOD deep import ${imp.spec}；改走 @/mods/${imp.targetMod}、secondaryPublicEntries、serverOnlyPublicEntries、事件或 Store selector`)
    failed++
  }
}

if (failed > 0) {
  logDomainSummary('mod-public-boundary', 'FAIL', `${failed} 项`)
  process.exit(1)
}

const detail = debt > 0 ? `无新增违规; ${debt} 项历史债务已登记` : '无跨 MOD deep import 违规'
logOk(`[OK] MOD public boundary ${detail}`)
logDomainSummary('mod-public-boundary', 'PASS', detail)
