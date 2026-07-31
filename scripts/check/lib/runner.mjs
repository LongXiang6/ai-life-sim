#!/usr/bin/env node
/**
 * @module runner.mjs
 * @description 按域运行检测步骤；静默模式下仅 FAIL 上控制台，完整日志写入 reports/
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DOMAINS } from '../domains.mjs'
import { cleanupOldReports } from './cleanup-reports.mjs'
import { writeCheckReport } from './report.mjs'
import {
  buildRefactorSignals,
  detectRepeatOffenders,
  computeAtceRecommendation,
} from './atce-signals.mjs'

/** @param {string} text */
function extractFailLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && (/\[FAIL\]|\[MISSING\]|FAILED|Error:|失败/.test(l)))
}

/** @param {string} text */
function extractHintLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && /\[REFACTOR-HINT\]/.test(l))
}

/**
 * @param {string} domainId
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {boolean} opts.quiet
 * @param {string} [opts.modName]
 * @param {string} opts.logDir
 * @param {string} opts.timestamp
 */
export function runDomain(domainId, opts) {
  const domain = DOMAINS[domainId]
  if (!domain) throw new Error(`Unknown domain: ${domainId}`)

  const logFile = path.join(opts.logDir, `check-log-${domainId}-${opts.timestamp}.txt`)
  fs.writeFileSync(logFile, `# Domain: ${domainId} (${domain.label})\n`, 'utf8')

  let exitCode = 0
  const errorLines = []
  const hintLines = []

  for (const step of domain.steps) {
    /** @type {string[]} */
    let args = [...(step.args ?? [])]

    if (step.platforms && !step.platforms.includes(process.platform)) {
      fs.appendFileSync(
        logFile,
        `\n--- SKIP ${step.cmd} ${args.join(' ')} (platform ${process.platform}) ---\n`,
        'utf8',
      )
      if (!opts.quiet) {
        console.log(`[check:${domainId}] SKIP ${step.cmd} on ${process.platform}`)
      }
      continue
    }

    if (step.cmd === 'node') {
      args = [
        '--no-warnings=ExperimentalWarning',
        '--loader',
        pathToFileURL(path.join(opts.projectRoot, 'scripts', 'check', 'lib', 'typescript-loader.mjs')).href,
        ...args,
      ]
    }

    if (opts.modName && domainId === 'mod') {
      args = [...args, '-ModName', opts.modName]
    }

    const env = {
      ...process.env,
      CHECK_QUIET: opts.quiet ? '1' : '0',
      ...(step.env ?? {}),
    }

    const result = spawnSync(step.cmd, args, {
      cwd: opts.projectRoot,
      env,
      encoding: 'utf8',
    })

    const stdout = result.stdout ?? ''
    const stderr = result.stderr ?? ''
    const combined = `${stdout}${stderr}`

    fs.appendFileSync(
      logFile,
      `\n--- ${step.cmd} ${args.join(' ')} (exit ${result.status ?? 1}) ---\n${combined}\n`,
      'utf8',
    )

    const fails = extractFailLines(combined)
    const hints = extractHintLines(combined)
    errorLines.push(...fails)
    hintLines.push(...hints)

    if (result.status !== 0) {
      exitCode = result.status ?? 1
      if (opts.quiet) {
        for (const line of fails) {
          process.stderr.write(`${line}\n`)
        }
        if (fails.length === 0 && combined.trim()) {
          process.stderr.write(`${combined.trim()}\n`)
        }
      } else if (combined.trim()) {
        process.stdout.write(combined)
      }
    } else if (!opts.quiet && combined.trim()) {
      process.stdout.write(combined)
    }
  }

  return {
    domain: domainId,
    label: domain.label,
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    exitCode,
    logFile,
    errorLines: [...new Set(errorLines)].slice(0, 80),
    hintLines: [...new Set(hintLines)].slice(0, 80),
  }
}

/**
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} opts.profile
 * @param {string[]} opts.domainIds
 * @param {boolean} [opts.quiet]
 * @param {string} [opts.modName]
 */
export function runCheck({ projectRoot, profile, domainIds, quiet = true, modName = '' }) {
  const reportsDir = path.join(projectRoot, 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  cleanupOldReports(projectRoot)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const results = []

  for (const id of domainIds) {
    const result = runDomain(id, {
      projectRoot,
      quiet,
      modName,
      logDir: reportsDir,
      timestamp,
    })
    results.push(result)

    if (quiet) {
      const detail = result.status === 'PASS' ? `${domainIds.length > 1 ? '' : 'see reports/'}` : `${result.errorLines.length || 1} issue(s)`
      const line = `[check:${id}] ${result.status}${detail ? ` — ${detail}` : ''}`
      if (result.status === 'PASS') console.log(line)
      else console.error(line)
    }
  }

  const allErrorLines = results.flatMap((r) => r.errorLines ?? [])
  const allHintLines = results.flatMap((r) => r.hintLines ?? [])
  const refactorSignals = buildRefactorSignals(allErrorLines, allHintLines, results)
  const repeatOffenders = detectRepeatOffenders(reportsDir, refactorSignals)
  const runStatus = results.some((r) => r.status === 'FAIL') ? 'FAIL' : 'PASS'
  const atceRecommendation = computeAtceRecommendation(refactorSignals, repeatOffenders, runStatus)

  const { jsonPath, mdPath, payload } = writeCheckReport({
    projectRoot,
    profile,
    domains: results,
    refactorSignals,
    repeatOffenders,
    atceRecommendation,
  })

  const failed = results.filter((r) => r.status === 'FAIL')
  const summary = `[check] profile=${profile} status=${payload.status} atce=${atceRecommendation} domains=${results.length} fail=${failed.length} report=${path.relative(projectRoot, jsonPath).replace(/\\/g, '/')}`

  if (quiet) {
    if (payload.status === 'PASS') console.log(summary)
    else console.error(`${summary}\n  detail: ${path.relative(projectRoot, mdPath).replace(/\\/g, '/')}`)
  } else {
    console.log(summary)
  }

  if (failed.length > 0) process.exit(1)
}
