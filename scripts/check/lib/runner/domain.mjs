/**
 * Purpose: Run one registered check domain through prepare, ready, execute, transition, and finalize.
 * Owner: quality:infrastructure
 * Responsibility: One domain lifecycle and its log/result projection only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { DOMAINS } from '../../domains.mjs'
import {
  SUCCESS_STATUS_CODES,
  buildPhaseFeedback,
  uniqueLines,
  validateCheckSteps,
} from './contracts.mjs'
import {
  executeCheckGraph,
  publicStepResult,
  runDomainStep,
} from './execution.mjs'

/**
 * @param {string} domainId
 * @param {object} opts
 */
export async function runDomain(domainId, opts) {
  const domainStartedAt = performance.now()
  const domain = DOMAINS[domainId]
  if (!domain) throw new Error(`Unknown domain: ${domainId}`)

  const requestedStepIds = opts.stepIds ? new Set(opts.stepIds) : null
  const unknownStepIds = requestedStepIds
    ? [...requestedStepIds].filter((stepId) => !domain.steps.some((step) => step.id === stepId))
    : []
  const selectedSteps = requestedStepIds
    ? domain.steps.filter((step) => requestedStepIds.has(step.id))
    : [...domain.steps]
  const validation = validateCheckSteps(selectedSteps)
  if (!SUCCESS_STATUS_CODES.has(opts.upstreamFeedback.statusCode)) {
    validation.valid = false
    validation.errors.push(`upstream prerequisite rejected: ${opts.upstreamFeedback.resultCode}`)
  }
  if (unknownStepIds.length > 0) {
    validation.valid = false
    validation.errors.push(`unknown selected steps: ${unknownStepIds.join(',')}`)
  }

  const logFile = path.join(opts.logDir, `check-log-${domainId}-${opts.timestamp}.txt`)
  const phaseResults = []
  phaseResults.push(buildPhaseFeedback(
    opts.executionId,
    domainId,
    'prepare',
    10,
    validation.valid ? 'succeeded' : 'failed',
    validation.valid ? 'execution-graph-valid' : 'execution-graph-invalid',
    {
      selectedStepIds: selectedSteps.map((step) => step.id),
      errors: validation.errors,
      upstream: opts.upstreamFeedback,
    },
  ))

  if (!validation.valid) {
    for (const [phase, order] of [['ready', 20], ['execute', 30], ['transition', 40]]) {
      phaseResults.push(buildPhaseFeedback(
        opts.executionId,
        domainId,
        phase,
        order,
        'blocked',
        'prepare-not-succeeded',
        { prepareStatusCode: 'failed' },
      ))
    }
    phaseResults.push(buildPhaseFeedback(
      opts.executionId,
      domainId,
      'finalize',
      50,
      'failed',
      'domain-validation-failed',
      { errors: validation.errors },
    ))
    fs.writeFileSync(logFile, `# Domain: ${domainId} (${domain.label})\n${validation.errors.join('\n')}\n`, 'utf8')
    return {
      domain: domainId,
      label: domain.label,
      status: 'FAIL',
      statusCode: 'failed',
      resultCode: 'domain-validation-failed',
      exitCode: 1,
      durationMs: Math.round(performance.now() - domainStartedAt),
      logFile,
      errorLines: validation.errors,
      hintLines: [],
      phaseResults,
      steps: [],
    }
  }

  phaseResults.push(buildPhaseFeedback(
    opts.executionId,
    domainId,
    'ready',
    20,
    selectedSteps.length > 0 ? 'succeeded' : 'skipped',
    selectedSteps.length > 0 ? 'steps-queued' : 'no-steps-selected',
    { queuedStepCount: selectedSteps.length },
  ))

  const executeStartedAt = performance.now()
  const stepResults = selectedSteps.length > 0
    ? await executeCheckGraph(
      selectedSteps,
      (step) => runDomainStep(domainId, step, opts),
      { executionId: opts.executionId, domainId },
    )
    : []
  const executeDurationMs = performance.now() - executeStartedAt
  const failedSteps = stepResults.filter((result) => !SUCCESS_STATUS_CODES.has(result.statusCode))
  phaseResults.push(buildPhaseFeedback(
    opts.executionId,
    domainId,
    'execute',
    30,
    failedSteps.length === 0 ? 'succeeded' : 'failed',
    failedSteps.length === 0 ? 'selected-checks-completed' : 'selected-checks-failed',
    {
      completedStepCount: stepResults.length,
      failedStepIds: failedSteps.map((result) => result.nodeId),
    },
    executeDurationMs,
  ))

  const allErrorLines = uniqueLines(stepResults.flatMap((result) => result.errorLines ?? []))
  const allHintLines = uniqueLines(stepResults.flatMap((result) => result.hintLines ?? []))
  phaseResults.push(buildPhaseFeedback(
    opts.executionId,
    domainId,
    'transition',
    40,
    failedSteps.length === 0 ? 'succeeded' : 'failed',
    failedSteps.length === 0 ? 'results-aggregated' : 'failure-results-aggregated',
    { errorCount: allErrorLines.length, hintCount: allHintLines.length },
  ))

  const domainStatusCode = failedSteps.length === 0 ? 'succeeded' : 'failed'
  const domainResultCode = failedSteps.length === 0 ? 'domain-checks-passed' : 'domain-checks-failed'
  phaseResults.push(buildPhaseFeedback(
    opts.executionId,
    domainId,
    'finalize',
    50,
    domainStatusCode,
    domainResultCode,
    { terminalPublished: true },
  ))

  const logParts = [`# Domain: ${domainId} (${domain.label})`]
  for (const result of stepResults) {
    logParts.push(
      '',
      `--- ${result.nodeId} status=${result.statusCode} result=${result.resultCode} durationMs=${result.durationMs} ---`,
      `${result.stdout}${result.stderr}`.trimEnd(),
    )
  }
  fs.writeFileSync(logFile, `${logParts.join('\n')}\n`, 'utf8')

  if (!opts.quiet) {
    for (const result of stepResults) {
      const output = `${result.stdout}${result.stderr}`.trim()
      console.log(`[${result.nodeId}] status=${result.statusCode} result=${result.resultCode} durationMs=${result.durationMs}`)
      if (output) process.stdout.write(`${output}\n`)
    }
  } else {
    for (const result of failedSteps) {
      const output = `${result.stdout}${result.stderr}`.trim()
      if (output) process.stderr.write(`${output}\n`)
    }
  }

  const exitCode = failedSteps
    .map((result) => result.evidence?.exitCode)
    .find((code) => Number.isInteger(code) && code !== 0) ?? (failedSteps.length > 0 ? 1 : 0)
  return {
    domain: domainId,
    label: domain.label,
    status: failedSteps.length === 0 ? 'PASS' : 'FAIL',
    statusCode: domainStatusCode,
    resultCode: domainResultCode,
    exitCode,
    durationMs: Math.round(performance.now() - domainStartedAt),
    logFile,
    errorLines: allErrorLines,
    hintLines: allHintLines,
    phaseResults,
    steps: stepResults.map(publicStepResult),
  }
}
