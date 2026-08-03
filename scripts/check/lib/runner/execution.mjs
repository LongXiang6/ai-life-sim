/**
 * Purpose: Execute validated local-check nodes with bounded concurrency and process deadlines.
 * Owner: quality:infrastructure
 * Responsibility: Semaphore, process lifecycle, and one check-node execution only.
 */

import { spawn } from 'node:child_process'

import {
  SUCCESS_STATUS_CODES,
  classifyStepProcessResult,
  compareCheckSteps,
  extractFailLines,
  extractHintLines,
  validateCheckSteps,
} from './contracts.mjs'

export function createSemaphore(limit) {
  let active = 0
  const queue = []

  function release() {
    active -= 1
    const next = queue.shift()
    if (next) next()
  }

  return async function runWithPermit(action) {
    if (active >= limit) {
      await new Promise((resolve) => queue.push(resolve))
    }
    active += 1
    try {
      return await action()
    } finally {
      release()
    }
  }
}

/**
 * @param {readonly object[]} steps
 * @param {(step: object) => Promise<object>} executor
 * @param {{ executionId?: string, domainId?: string }} [options]
 */
export async function executeCheckGraph(steps, executor, options = {}) {
  const ordered = [...steps].sort(compareCheckSteps)
  const validation = validateCheckSteps(ordered)
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '))
  }

  const executionId = options.executionId ?? 'check-test'
  const domainId = options.domainId ?? 'check-test'
  const results = new Map()
  const pending = new Map(ordered.map((step) => [step.id, step]))

  while (pending.size > 0) {
    for (const step of [...pending.values()].sort(compareCheckSteps)) {
      const failedDependency = step.dependsOn
        .map((dependencyId) => results.get(dependencyId))
        .find((dependency) => dependency && !SUCCESS_STATUS_CODES.has(dependency.statusCode))
      if (!failedDependency) continue
      pending.delete(step.id)
      results.set(step.id, {
        executionId,
        nodeId: `${domainId}:${step.id}`,
        phase: step.phase,
        order: step.order,
        statusCode: 'blocked',
        resultCode: 'dependency-not-succeeded',
        durationMs: 0,
        evidence: { dependencyNodeId: failedDependency.nodeId, dependencyStatusCode: failedDependency.statusCode },
        stdout: '',
        stderr: '',
      })
    }

    const ready = [...pending.values()]
      .filter((step) => step.dependsOn.every((dependencyId) => results.has(dependencyId)))
      .sort(compareCheckSteps)
    if (ready.length === 0) {
      if (pending.size === 0) break
      throw new Error(`check graph stalled: ${[...pending.keys()].join(',')}`)
    }

    const serial = ready.find((step) => step.parallel !== true)
    const batch = serial ? [serial] : ready
    for (const step of batch) pending.delete(step.id)
    const completed = await Promise.all(batch.map((step) => executor(step)))
    for (let index = 0; index < batch.length; index += 1) {
      results.set(batch[index].id, completed[index])
    }
  }

  return ordered.map((step) => results.get(step.id))
}

function runStepAsync(step, args, opts) {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    const child = spawn(step.cmd, args, {
      cwd: opts.projectRoot,
      env: opts.env,
    })
    let stdout = ''
    let stderr = ''
    let finished = false
    let timedOut = false

    function finish(result) {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      resolve({
        ...result,
        stdout,
        stderr,
        timedOut,
        durationMs: performance.now() - startedAt,
      })
    }

    const timeout = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else {
        child.kill('SIGTERM')
      }
    }, step.timeoutMs)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => finish({ status: null, signal: null, error: error.message }))
    child.on('close', (status, signal) => finish({ status, signal }))
  })
}

export function publicStepResult(result) {
  const { stdout: _stdout, stderr: _stderr, ...publicResult } = result
  return publicResult
}

export async function runDomainStep(domainId, step, opts) {
  const nodeId = `${domainId}:${step.id}`
  if (step.platforms && !step.platforms.includes(process.platform)) {
    return {
      executionId: opts.executionId,
      nodeId,
      phase: step.phase,
      order: step.order,
      statusCode: 'skipped',
      resultCode: 'platform-not-applicable',
      durationMs: 0,
      evidence: { platform: process.platform, allowedPlatforms: step.platforms },
      stdout: '',
      stderr: '',
    }
  }

  const args = [...(step.args ?? [])]
  if (opts.modName && domainId === 'mod') args.push('-ModName', opts.modName)
  const env = {
    ...process.env,
    CHECK_QUIET: opts.quiet ? '1' : '0',
    CHECK_STEP_MODE: opts.selectionMode,
    ...(step.env ?? {}),
  }
  const raw = await opts.runWithPermit(() => runStepAsync(step, args, {
    projectRoot: opts.projectRoot,
    env,
  }))
  const classification = classifyStepProcessResult(raw)
  const combined = `${raw.stdout ?? ''}${raw.stderr ?? ''}`
  const errorLines = extractFailLines(combined)
  const hintLines = extractHintLines(combined)
  return {
    executionId: opts.executionId,
    nodeId,
    phase: step.phase,
    order: step.order,
    statusCode: classification.statusCode,
    resultCode: classification.resultCode,
    durationMs: Math.round(raw.durationMs),
    evidence: {
      command: step.cmd,
      args,
      exitCode: Number.isInteger(raw.status) ? raw.status : null,
      signal: raw.signal ?? null,
      errorCount: errorLines.length,
      hintCount: hintLines.length,
      outputChars: combined.length,
    },
    errorLines,
    hintLines,
    stdout: raw.stdout ?? '',
    stderr: raw.stderr ?? '',
  }
}
