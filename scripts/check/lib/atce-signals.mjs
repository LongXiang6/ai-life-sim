/**
 * @module atce-signals.mjs
 * @description 从扫描结果提取 ATCE 信号：refactorSignals、repeatOffenders、atceRecommendation
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REGISTRY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../rules/registry.json')

/** @returns {Record<string, { refactorHint?: string, atceTrigger?: boolean, tier?: string }>} */
function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')).rules ?? {}
}

/** @param {string} line */
function extractRuleId(line) {
  const bracket = line.match(/\[([A-Z]-\d{2}|D-\d{2}|B-\d{2}|P-\d{2})\]/)
  if (bracket) return bracket[1]
  const see = line.match(/见 (A-\d{2})/)
  if (see) return see[1]
  if (/eager singleton|A-14/i.test(line)) return 'A-14'
  if (/orchestrator|A-15/i.test(line)) return 'A-15'
  if (/createInitialState|A-16/i.test(line)) return 'A-16'
  if (/world-init-bundle|barrel|A-01/i.test(line)) return 'A-01'
  if (/循环依赖|import 图|D-07/i.test(line)) return 'D-07'
  return null
}

/** @param {string} line */
function extractFile(line) {
  const m = line.match(/\[REFACTOR-HINT\]\s*\[[\w-]+\]\s*([\w./-]+\.(?:ts|tsx))/i)
  if (m) return m[1]
  const m2 = line.match(/(?:\[FAIL\]\s*)?(?:\[[\w-]+\]\s*)?([\w./-]+\.(?:ts|tsx|ps1))/i)
  return m2?.[1] ?? ''
}

/** @param {string} line */
function extractModule(line) {
  const m = line.match(/src\/mods\/(mod-[a-z0-9-]+)/)
  return m?.[1] ?? 'global'
}

/** @param {string} line */
function extractHintMessage(line) {
  const m = line.match(/\[REFACTOR-HINT\][^\n]*—\s*(.+)$/)
  return m?.[1]?.trim() ?? line.slice(0, 200)
}

/**
 * @param {string[]} errorLines
 * @param {string[]} hintLines
 * @param {Array<{ domain: string, errorLines?: string[], hintLines?: string[] }>} domainResults
 */
export function buildRefactorSignals(errorLines, hintLines, domainResults) {
  const registry = loadRegistry()
  const lines = [...errorLines, ...hintLines]
  for (const d of domainResults) {
    if (d.errorLines) lines.push(...d.errorLines)
    if (d.hintLines) lines.push(...d.hintLines)
  }

  const signals = []
  const seen = new Set()
  for (const line of lines) {
    const ruleId = extractRuleId(line)
    if (!ruleId) continue
    const isHint = /\[REFACTOR-HINT\]/.test(line)
    const key = `${isHint ? 'hint' : 'fail'}|${ruleId}|${extractFile(line)}`
    if (seen.has(key)) continue
    seen.add(key)
    const meta = registry[ruleId] ?? {}
    signals.push({
      ruleId,
      file: extractFile(line),
      module: extractModule(line),
      tier: meta.tier ?? 'unknown',
      severity: isHint ? 'hint' : 'fail',
      refactorHint: isHint ? extractHintMessage(line) : (meta.refactorHint ?? '见 anti-patterns / registry.json'),
      excerpt: line.slice(0, 200),
    })
  }
  return signals
}

/**
 * @param {string} reportsDir
 * @param {number} maxAgeDays
 */
function loadHistoricalFailureCounts(reportsDir, maxAgeDays = 30) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  if (!fs.existsSync(reportsDir)) return counts

  const cutoff = Date.now() - maxAgeDays * 86400000
  for (const name of fs.readdirSync(reportsDir)) {
    if (!name.endsWith('.json')) continue
    if (!name.startsWith('checker-') && !name.startsWith('check-run-')) continue
    const full = path.join(reportsDir, name)
    if (fs.statSync(full).mtimeMs < cutoff) continue
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'))
      if (data.Results) {
        for (const r of data.Results) {
          if (r.Level !== 'ERROR') continue
          const key = `${r.Rule}|${r.Module || 'global'}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      if (data.refactorSignals) {
        for (const s of data.refactorSignals) {
          if (s.severity === 'hint') continue
          const key = `${s.ruleId}|${s.module || 'global'}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    } catch {
      // skip corrupt
    }
  }
  return counts
}

/**
 * @param {string} reportsDir
 * @param {ReturnType<typeof buildRefactorSignals>} currentSignals
 */
export function detectRepeatOffenders(reportsDir, currentSignals) {
  const historical = loadHistoricalFailureCounts(reportsDir)
  const offenders = []

  for (const sig of currentSignals.filter((s) => s.severity !== 'hint')) {
    const key = `${sig.ruleId}|${sig.module}`
    const prior = historical.get(key) ?? 0
    const total = prior + 1
    if (total >= 2) {
      offenders.push({
        ruleId: sig.ruleId,
        module: sig.module,
        occurrences: total,
        message: `同 Rule+Module 第 ${total} 次 — decision-tree 默认 L3 + 重构`,
      })
    }
  }
  return offenders
}

/**
 * @param {ReturnType<typeof buildRefactorSignals>} refactorSignals
 * @param {ReturnType<typeof detectRepeatOffenders>} repeatOffenders
 * @param {'PASS'|'FAIL'} runStatus
 */
export function computeAtceRecommendation(refactorSignals, repeatOffenders, runStatus) {
  if (repeatOffenders.length > 0) return 'REFACTOR_MANDATORY'
  if (runStatus === 'FAIL') {
    const structural = refactorSignals.some((s) => s.tier === 'structural' && s.severity === 'fail')
    return structural ? 'REFACTOR' : 'REVIEW'
  }
  const structuralHints = refactorSignals.filter((s) => s.severity === 'hint' && s.tier === 'structural')
  if (structuralHints.length > 0) return 'REVIEW'
  if (refactorSignals.some((s) => s.severity === 'fail')) return 'REVIEW'
  return 'PATCH_OK'
}
