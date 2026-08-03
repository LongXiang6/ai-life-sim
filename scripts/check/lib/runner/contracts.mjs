/**
 * Purpose: Define deterministic local-check ordering, validation, status, and feedback contracts.
 * Owner: quality:infrastructure
 * Responsibility: Pure status classification and graph validation only.
 */

export const SUCCESS_STATUS_CODES = new Set(['succeeded', 'skipped'])
const VALID_STATUS_CODES = new Set([
  'ready',
  'running',
  'succeeded',
  'skipped',
  'blocked',
  'failed',
  'cancelled',
  'timed-out',
  'missing-status',
  'invalid-status',
])

function compareAscii(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function compareCheckSteps(left, right) {
  return left.order - right.order || compareAscii(left.id, right.id)
}

/** @param {string} text */
export function extractFailLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && (/\[FAIL\]|\[MISSING\]|FAILED|Error:|失败/u.test(line)))
}

/** @param {string} text */
export function extractHintLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && /\[(?:REFACTOR-HINT|OPTIMIZE)\]/u.test(line))
}

export function uniqueLines(lines) {
  return [...new Set(lines)]
}

export function buildPhaseFeedback(executionId, domainId, phase, order, statusCode, resultCode, evidence, durationMs = 0) {
  return {
    executionId,
    nodeId: `${domainId}:${phase}`,
    phase,
    order,
    statusCode,
    resultCode,
    durationMs: Math.round(durationMs),
    evidence,
  }
}

/**
 * @param {{ status?: unknown, signal?: string|null, error?: string, timedOut?: boolean }} result
 */
export function classifyStepProcessResult(result) {
  if (result.timedOut) {
    return { statusCode: 'timed-out', resultCode: 'deadline-exceeded' }
  }
  if (result.error) {
    return { statusCode: 'failed', resultCode: 'process-spawn-failed' }
  }
  if (result.status === null || typeof result.status === 'undefined') {
    if (result.signal) return { statusCode: 'cancelled', resultCode: 'process-signalled' }
    return { statusCode: 'missing-status', resultCode: 'process-closed-without-status' }
  }
  if (!Number.isInteger(result.status)) {
    return { statusCode: 'invalid-status', resultCode: 'process-returned-invalid-status' }
  }
  if (result.status === 0) {
    return { statusCode: 'succeeded', resultCode: 'checks-passed' }
  }
  return { statusCode: 'failed', resultCode: 'process-exit-nonzero' }
}

export function inspectUpstreamStatuses(rawValue) {
  if (!rawValue) {
    return {
      statusCode: 'skipped',
      resultCode: 'direct-check-invocation',
      statuses: {},
    }
  }
  let statuses
  try {
    statuses = JSON.parse(rawValue)
  } catch {
    return {
      statusCode: 'invalid-status',
      resultCode: 'upstream-status-json-invalid',
      statuses: {},
    }
  }
  if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) {
    return {
      statusCode: 'invalid-status',
      resultCode: 'upstream-status-object-invalid',
      statuses: {},
    }
  }
  for (const owner of ['lint', 'typescript']) {
    if (!(owner in statuses)) {
      return {
        statusCode: 'missing-status',
        resultCode: `upstream-status-missing-${owner}`,
        statuses,
      }
    }
    if (!VALID_STATUS_CODES.has(statuses[owner])) {
      return {
        statusCode: 'invalid-status',
        resultCode: `upstream-status-invalid-${owner}`,
        statuses,
      }
    }
    if (statuses[owner] !== 'succeeded') {
      return {
        statusCode: 'failed',
        resultCode: `upstream-status-not-succeeded-${owner}`,
        statuses,
      }
    }
  }
  return {
    statusCode: 'succeeded',
    resultCode: 'upstream-prerequisites-succeeded',
    statuses,
  }
}

/**
 * @param {readonly object[]} steps
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCheckSteps(steps) {
  const errors = []
  const byId = new Map()
  for (const step of steps) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(step.id ?? '')) {
      errors.push(`invalid step id: ${String(step.id)}`)
    }
    if (byId.has(step.id)) errors.push(`duplicate step id: ${step.id}`)
    else byId.set(step.id, step)
    if (!Number.isInteger(step.order)) errors.push(`invalid order for ${step.id}`)
    if (step.phase !== 'execute') errors.push(`invalid phase for ${step.id}: ${step.phase}`)
    if (!Array.isArray(step.dependsOn)) errors.push(`invalid dependencies for ${step.id}`)
    if (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0) {
      errors.push(`invalid timeout for ${step.id}`)
    }
  }

  for (const step of steps) {
    for (const dependencyId of step.dependsOn ?? []) {
      if (!byId.has(dependencyId)) errors.push(`missing dependency for ${step.id}: ${dependencyId}`)
      if (dependencyId === step.id) errors.push(`self dependency for ${step.id}`)
    }
  }

  const visiting = new Set()
  const visited = new Set()
  function visit(stepId) {
    if (visiting.has(stepId)) {
      errors.push(`cyclic dependency at ${stepId}`)
      return
    }
    if (visited.has(stepId)) return
    visiting.add(stepId)
    const step = byId.get(stepId)
    for (const dependencyId of step?.dependsOn ?? []) visit(dependencyId)
    visiting.delete(stepId)
    visited.add(stepId)
  }
  for (const step of steps) visit(step.id)

  return { valid: errors.length === 0, errors: uniqueLines(errors) }
}
