/**
 * Purpose: Aggregate registered check domains into one bounded local-check run and report.
 * Owner: quality:infrastructure
 * Responsibility: Run-level concurrency, report synthesis, and public terminal result only.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { DOMAINS } from '../../domains.mjs'
import {
  buildRefactorSignals,
  computeAtceRecommendation,
  detectRepeatOffenders,
} from '../atce-signals.mjs'
import { cleanupOldReports } from '../cleanup-reports.mjs'
import { writeCheckReport } from '../report.mjs'
import { inspectUpstreamStatuses } from './contracts.mjs'
import { runDomain } from './domain.mjs'
import { createSemaphore } from './execution.mjs'

function resolveParallelism(domainIds) {
  const available = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length
  const fallback = Math.max(1, Math.min(4, available))
  return Math.max(1, Math.min(
    Number.parseInt(process.env.CHECK_PARALLELISM ?? String(fallback), 10) || fallback,
    Math.max(1, domainIds.flatMap((domainId) => DOMAINS[domainId]?.steps ?? []).length),
  ))
}

/**
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} opts.profile
 * @param {string[]} opts.domainIds
 * @param {Record<string, string[]>} [opts.stepIdsByDomain]
 * @param {'all'|'critical'} [opts.selectionMode]
 * @param {boolean} [opts.quiet]
 * @param {string} [opts.modName]
 */
export async function runCheck({
  projectRoot,
  profile,
  domainIds,
  stepIdsByDomain,
  selectionMode = 'all',
  quiet = true,
  modName = '',
}) {
  const reportsDir = path.join(projectRoot, 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  cleanupOldReports(projectRoot)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const executionId = `${profile}-${timestamp}-${process.pid}`
  const parallelism = resolveParallelism(domainIds)
  const runWithPermit = createSemaphore(parallelism)
  const upstreamFeedback = inspectUpstreamStatuses(process.env.CHECK_UPSTREAM_STATUSES)

  const results = await Promise.all(domainIds.map(async (domainId) => {
    const result = await runDomain(domainId, {
      projectRoot,
      quiet,
      modName,
      logDir: reportsDir,
      timestamp,
      executionId,
      runWithPermit,
      upstreamFeedback,
      selectionMode,
      stepIds: stepIdsByDomain?.[domainId],
    })
    if (quiet) {
      const line = `[check:${domainId}] status=${result.statusCode} result=${result.resultCode} steps=${result.steps.length} durationMs=${result.durationMs}`
      if (result.status === 'PASS') console.log(line)
      else console.error(line)
    }
    return result
  }))

  const allErrorLines = results.flatMap((result) => result.errorLines ?? [])
  const allHintLines = results.flatMap((result) => result.hintLines ?? [])
  const refactorSignals = buildRefactorSignals(allErrorLines, allHintLines, results)
  const repeatOffenders = detectRepeatOffenders(reportsDir, refactorSignals)
  const runStatus = results.some((result) => result.status === 'FAIL') ? 'FAIL' : 'PASS'
  const atceRecommendation = computeAtceRecommendation(refactorSignals, repeatOffenders, runStatus)

  const { jsonPath, mdPath, payload } = writeCheckReport({
    projectRoot,
    profile,
    domains: results,
    refactorSignals,
    repeatOffenders,
    atceRecommendation,
  })

  const failed = results.filter((result) => result.status === 'FAIL')
  const runResultCode = failed.length === 0 ? 'checks-passed' : 'checks-failed'
  const summary = `[check] profile=${profile} status=${payload.status} code=${runResultCode} parallelism=${parallelism} domains=${results.length} fail=${failed.length} report=${path.relative(projectRoot, jsonPath).replace(/\\/g, '/')}`

  if (quiet) {
    if (payload.status === 'PASS') console.log(summary)
    else console.error(`${summary}\n  detail: ${path.relative(projectRoot, mdPath).replace(/\\/g, '/')}`)
  } else {
    console.log(summary)
  }

  return {
    executionId,
    exitCode: failed.length > 0 ? 1 : 0,
    statusCode: failed.length > 0 ? 'failed' : 'succeeded',
    resultCode: runResultCode,
    results,
    report: { jsonPath, mdPath },
  }
}
