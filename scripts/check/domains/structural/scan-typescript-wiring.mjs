/**
 * @module scan-typescript-wiring.mjs
 * @description TS 接线扫描：codegen 契约 + 源码交叉校验 + REFACTOR-HINT（A-01 重 barrel 等）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logOk, logFail, logRefactorHint, logDomainSummary } from '../../lib/quiet.mjs'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)

const REQUIRED_GENERATED = [
  'src/mods/registry.generated.ts',
  'src/core/mod-loader/mod-control-importers.generated.ts',
  'src/core/mod-loader/mod-subsystem-importers.generated.ts',
  'src/core/mod-loader/mod-importers.generated.ts',
  'src/mods/mod-engine/bootstrap/mod-importers.generated.ts',
  'src/mods/mod-engine/bootstrap/prompt-context-contract.generated.ts',
  'src/mods/mod-engine/helpers/subsystem-field-keys.generated.ts',
  'src/mods/mod-engine/campaigns/default/stages.generated.ts',
  'src/core/mod-loader/remote-contracts.generated.ts',
  'src/core/mod-loader/compat-importers.generated.ts',
  'src/core/mod-loader/migration-importers.generated.ts',
]

const ORCHESTRATOR_REQUIRED_CALLS = [
  'buildCoreMemory',
  'buildForeshadowingText',
  'detectForeshadowing',
  'buildRichPrompt',
  'assemblePromptContext',
]

/** @param {string} rel */
function readRel(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

/** @param {string} content @param {string} constName */
function parseJsonStringArray(content, constName) {
  const match = content.match(new RegExp(`export const ${constName}[\\s\\S]*?=\\s*(\\[[\\s\\S]*?\\])\\s*as const`))
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

let failed = 0
let hintCount = 0

for (const rel of REQUIRED_GENERATED) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) {
    logFail(`[MISSING] ${rel} — run npm run generate:wiring`)
    failed++
  }
}

if (failed > 0) process.exit(1)

const fieldKeysGen = readRel('src/mods/mod-engine/helpers/subsystem-field-keys.generated.ts')
const fieldRegistry = readRel('src/mods/mod-engine/helpers/subsystem-field-registry.ts')
const genKeys = parseJsonStringArray(fieldKeysGen, 'SUBSYSTEM_FIELD_REGISTRY_KEYS')
const mapBlock = fieldRegistry.slice(
  fieldRegistry.indexOf('export const SUBSYSTEM_FIELD_MAP'),
  fieldRegistry.indexOf('export const SUBSYSTEM_CHANGE_SCHEMAS'),
)
const sourceKeys = [...mapBlock.matchAll(/^\s+'([^']+)':\s*\{/gm)].map((m) => m[1])

if (!genKeys || genKeys.join('|') !== sourceKeys.join('|')) {
  logFail('[FAIL] SUBSYSTEM_FIELD_REGISTRY_KEYS 与 SUBSYSTEM_FIELD_MAP 漂移')
  failed++
} else {
  logOk('[OK] subsystem field keys 与 registry 一致')
}

const zodBlock = fieldRegistry.slice(fieldRegistry.indexOf('export const SUBSYSTEM_CHANGE_SCHEMAS'))
const zodIds = [...zodBlock.matchAll(/^\s+'([^']+)':\s*z\.object/gm)].map((m) => m[1])
if (genKeys && zodIds.join('|') !== genKeys.join('|')) {
  logFail('[FAIL] SUBSYSTEM_CHANGE_SCHEMAS 子系统 id 与 generated keys 不一致')
  failed++
} else {
  logOk('[OK] Zod schema 子系统 id 与 generated keys 一致')
}

const stagesGen = readRel('src/mods/mod-engine/campaigns/default/stages.generated.ts')
const campaignIndex = readRel('src/mods/mod-engine/campaigns/default/index.ts')
const genStages = parseJsonStringArray(stagesGen, 'DEFAULT_CAMPAIGN_STAGE_NAMES')
const indexStages = [...campaignIndex.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])

if (!genStages || genStages.join('|') !== indexStages.join('|')) {
  logFail('[FAIL] DEFAULT_CAMPAIGN_STAGE_NAMES 与 campaigns/default/index.ts 漂移')
  failed++
} else {
  logOk('[OK] campaign stages 与 index.ts 一致')
}

const orchestrator = readRel('src/mods/mod-engine/subsystems/orchestrator-system.ts')
let orchMissing = 0
for (const method of ORCHESTRATOR_REQUIRED_CALLS) {
  if (!new RegExp(`\\b${method}\\s*\\(`).test(orchestrator)) {
    logFail(`[FAIL] orchestrator-system.ts 缺少 ${method}()`)
    orchMissing++
    failed++
  }
}
if (orchMissing === 0) {
  logOk('[OK] orchestrator 叙事关键方法齐全')
}

const subsystemIndexFiles = []
function walkSubsystems(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory() && ent.name === 'subsystems') {
      const idx = path.join(full, 'index.ts')
      if (fs.existsSync(idx)) subsystemIndexFiles.push(idx)
    } else if (ent.isDirectory() && ent.name.startsWith('mod-')) {
      walkSubsystems(full)
    }
  }
}
walkSubsystems(path.join(ROOT, 'src/mods'))
let eagerSingletonViolations = 0
for (const idxPath of subsystemIndexFiles) {
  const rel = path.relative(ROOT, idxPath).replace(/\\/g, '/')
  const content = fs.readFileSync(idxPath, 'utf8')
  if (/export\s+const\s+\w+\s*=\s*new\s+\w+System\s*\(\s*\)/.test(content)) {
    logFail(`[FAIL] ${rel} 含顶层子系统 eager singleton（见 A-14）`)
    eagerSingletonViolations++
    failed++
  }
}
if (eagerSingletonViolations === 0 && subsystemIndexFiles.length > 0) {
  logOk('[OK] 子系统 index 无顶层 eager singleton')
}

const worldInitBundle = readRel('src/mods/mod-world/world-init-bundle.ts')
if (/import\s*\{[^}]*\borchestrator\b[^}]*\}\s*from\s*'@\/mods\/mod-engine'/.test(worldInitBundle)) {
  logFail('[FAIL] world-init-bundle.ts 静态 import orchestrator（见 A-15，应运行期 dynamic import）')
  failed++
} else {
  logOk('[OK] world-init-bundle 未静态 import orchestrator')
}

const archRules = JSON.parse(readRel('scripts/check/rules/architecture-rules.json'))
const allowedOrchestratorMods = new Set(archRules.forbiddenStaticOrchestratorImportMods ?? ['mod-engine'])
const orchestratorAllowMods = new Set(archRules.orchestratorStaticImportAllowMods ?? [])
let orchestratorStaticViolations = 0
function walkModTs(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory() && !ent.name.startsWith('.') && ent.name !== 'node_modules') {
      walkModTs(full)
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) {
      const rel = path.relative(ROOT, full).replace(/\\/g, '/')
      const modMatch = rel.match(/^src\/mods\/(mod-[a-z0-9-]+)\//)
      if (!modMatch || allowedOrchestratorMods.has(modMatch[1]) || orchestratorAllowMods.has(modMatch[1])) continue
      const content = fs.readFileSync(full, 'utf8')
      if (/import\s*\{[^}]*\borchestrator\b[^}]*\}\s*from\s*'@\/mods\/mod-engine'/.test(content)) {
        logFail(`[FAIL] ${rel} 静态 import orchestrator（见 A-15）`)
        orchestratorStaticViolations++
        failed++
      }
    }
  }
}
walkModTs(path.join(ROOT, 'src/mods'))
if (orchestratorStaticViolations === 0) {
  logOk('[OK] 非 mod-engine 无静态 orchestrator import')
}

const modWorldIndex = readRel('src/mods/mod-world/index.ts')
if (/from\s*['"]\.\/world-init-bundle['"]/.test(modWorldIndex)) {
  logFail('[FAIL] mod-world/index.ts 仍 re-export world-init-bundle（见 A-01 barrel 分层）')
  failed++
} else {
  logOk('[OK] mod-world/index.ts 未 re-export world-init-bundle')
}

const storeAccessPatterns = archRules.constructorStoreAccessPatterns ?? []
let constructorStoreViolations = 0
function walkSubsystemFiles(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory() && ent.name.startsWith('mod-')) {
      const subDir = path.join(full, 'subsystems')
      if (fs.existsSync(subDir)) {
        for (const sf of fs.readdirSync(subDir)) {
          if (!sf.endsWith('-system.ts')) continue
          const rel = path.relative(ROOT, path.join(subDir, sf)).replace(/\\/g, '/')
          const content = fs.readFileSync(path.join(subDir, sf), 'utf8')
          const initBlock = content.match(/createInitialState\s*\([^)]*\)\s*(?::[^{]+)?\{([\s\S]*?)\n\s*\}/)
          const fieldInit = content.match(/private\s+\w+[^=]*=\s*this\.createInitialState\s*\(\s*\)/)
          if (!fieldInit && !initBlock) continue
          const scanText = initBlock ? initBlock[1] : ''
          for (const pat of storeAccessPatterns) {
            if (new RegExp(pat).test(scanText)) {
              logFail(`[FAIL] ${rel} createInitialState 含构造期 Store/校准读取（见 A-16）`)
              constructorStoreViolations++
              failed++
              break
            }
          }
        }
      }
      walkSubsystemFiles(full)
    }
  }
}
walkSubsystemFiles(path.join(ROOT, 'src/mods'))
if (constructorStoreViolations === 0) {
  logOk('[OK] 子系统 createInitialState 无构造期 Store 读取')
}

const templatePath = path.join(ROOT, '..', '.agents/skills/mod-dev-skill/templates/subsystem.template.ts')
if (fs.existsSync(templatePath)) {
  const tpl = fs.readFileSync(templatePath, 'utf8')
  const markers = archRules.templateRequiredMarkers ?? []
  const missingMarkers = markers.filter((m) => !tpl.includes(m))
  if (missingMarkers.length > 0) {
    logFail(`[FAIL] subsystem.template.ts 缺少标记: ${missingMarkers.join(', ')}`)
    failed++
  } else {
    logOk('[OK] subsystem.template.ts 含 §8.4 标记')
  }
}

const contract = readRel('src/mods/mod-engine/bootstrap/prompt-context-contract.generated.ts')
const ctxFields = parseJsonStringArray(contract, 'PROMPT_CONTEXT_FIELDS')
const narrativeVars = parseJsonStringArray(contract, 'NARRATIVE_PROMPT_VARIABLES')
if (ctxFields && narrativeVars) {
  const missing = narrativeVars.filter((v) => !ctxFields.includes(v))
  if (missing.length > 0) {
    logFail(`[FAIL] narrative 模板变量不在 PromptContext: ${missing.join(', ')}`)
    failed++
  } else {
    logOk('[OK] PromptContext ↔ narrative-prompt 契约一致')
  }
}

// --- A-01 / A-14（FAIL — Factorio control/prototype 纪律）---
const ruleFailSeen = new Set()

/** @param {string} rule @param {string} rel @param {string} msg */
function failOnce(rule, rel, msg) {
  const key = `${rule}|${rel}|${msg.slice(0, 40)}`
  if (ruleFailSeen.has(key)) return
  ruleFailSeen.add(key)
  logFail(`[FAIL] [${rule}] ${rel} — ${msg}`)
  failed++
}

for (const ent of fs.readdirSync(path.join(ROOT, 'src/mods'), { withFileTypes: true })) {
  if (!ent.isDirectory() || !ent.name.startsWith('mod-')) continue
  const indexPath = path.join(ROOT, 'src/mods', ent.name, 'index.ts')
  if (!fs.existsSync(indexPath)) continue
  const rel = path.relative(ROOT, indexPath).replace(/\\/g, '/')
  const content = fs.readFileSync(indexPath, 'utf8')
  const controlPath = path.join(ROOT, 'src/mods', ent.name, '_internal', 'control.ts')
  if (!fs.existsSync(controlPath)) {
    failOnce('A-17', rel.replace('index.ts', '_internal/control.ts'), '缺少 Factorio control.lua 等价文件 _internal/control.ts')
  }

  if (/from\s*['"]\.\/subsystems['"]/.test(content)) {
    failOnce('A-01', rel, 'index re-export 子系统 barrel — 子系统由 registerAllSubsystems + subsystems/ 加载')
  }
  if (/from\s*['"]\.\/subsystems\/[^'"]+['"]/.test(content)) {
    failOnce('A-01', rel, 'index 从 subsystems/ 直接导出 — 使用 secondaryPublicEntries 或 subsystems/ 路径')
  }
  if (/export\s*\{[^}]*\b(orchestrator|timeSystem|narrativeParser|summaryCompressor)\b[^}]*\}\s*from\s*['"]\.\/subsystems/.test(content)) {
    failOnce('A-14', rel, 'index 导出子系统运行时单例 — 拆到 engine-api.ts 或 secondaryPublicEntries')
  }
  if (/from\s*['"]\.\/.*-bundle['"]/.test(content)) {
    failOnce('A-01', rel, 'index re-export 重 bundle — 应拆到 secondaryPublicEntries')
  }
  if (/export\s*\{[^}]*\blifecycle\b[^}]*\}/.test(content)) {
    failOnce('A-17', rel, 'index 导出 lifecycle — 应仅在 _internal/control.ts')
  }
  if (/export\s+\*\s+from/.test(content)) {
    failOnce('A-01', rel, 'index 使用 export * — 改为具名导出或移除不必要的 re-export')
  }
}

const hintSeen = new Set()

/** @param {string} rule @param {string} rel @param {string} msg */
function hintOnce(rule, rel, msg) {
  const key = `${rule}|${rel}|${msg.slice(0, 40)}`
  if (hintSeen.has(key)) return
  hintSeen.add(key)
  logRefactorHint(`[REFACTOR-HINT] [${rule}] ${rel} — ${msg}`)
  hintCount++
}

const slicesPath = path.join(ROOT, 'src/core/global-store/slices/index.ts')
if (fs.existsSync(slicesPath)) {
  const slices = fs.readFileSync(slicesPath, 'utf8')
  for (const m of slices.matchAll(/from\s*'(@\/mods\/mod-[^/]+)(\/[^']*)?'/g)) {
    const base = m[1]
    const sub = m[2] ?? ''
    if (sub !== '/store') {
      hintOnce('A-13', 'src/core/global-store/slices/index.ts', `import ${base}${sub} — slices 应只 import 各 MOD store.ts`)
    }
  }
}

if (failed > 0) {
  logDomainSummary('wiring', 'FAIL', `${failed} 项`)
  process.exit(1)
}

const passDetail = hintCount > 0 ? `codegen 一致; ${hintCount} refactor hint(s) in log` : 'codegen 接线一致'
logDomainSummary('wiring', 'PASS', passDetail)
