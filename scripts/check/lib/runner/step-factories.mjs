/**
 * Purpose: Build normalized Node.js and PowerShell check-step declarations.
 * Owner: quality:infrastructure
 * Responsibility: Check-step defaults and immutable command projection only.
 */

const DEFAULT_STEP_TIMEOUT_MS = 60_000
const TYPESCRIPT_LOADER_ARGS = [
  '--no-warnings=ExperimentalWarning',
  '--loader',
  './scripts/check/lib/typescript-loader.mjs',
]

/**
 * @param {string} id
 * @param {number} order
 * @param {string} script
 * @param {{ args?: string[], critical?: boolean, dependsOn?: string[], env?: Record<string,string>, platforms?: string[], timeoutMs?: number, triggers?: string[], typescript?: boolean }} [options]
 */
export function nodeStep(id, order, script, options = {}) {
  const {
    args = [],
    critical = false,
    dependsOn = [],
    env,
    platforms,
    timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
    triggers = [],
    typescript = false,
  } = options
  return {
    id,
    order,
    phase: 'execute',
    dependsOn,
    parallel: true,
    optional: Boolean(platforms),
    timeoutMs,
    critical,
    triggers: [...new Set([script, ...triggers])],
    cmd: 'node',
    args: [...(typescript ? TYPESCRIPT_LOADER_ARGS : []), script, ...args],
    ...(env ? { env } : {}),
    ...(platforms ? { platforms } : {}),
  }
}

/**
 * @param {string} id
 * @param {number} order
 * @param {string} script
 * @param {{ args?: string[], critical?: boolean, env?: Record<string,string>, platforms?: string[], timeoutMs?: number, triggers?: string[] }} [options]
 */
export function powershellStep(id, order, script, options = {}) {
  const {
    args = [],
    critical = false,
    env,
    platforms = ['win32'],
    timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
    triggers = [],
  } = options
  return {
    id,
    order,
    phase: 'execute',
    dependsOn: [],
    parallel: true,
    optional: true,
    timeoutMs,
    critical,
    triggers: [...new Set([script, ...triggers])],
    cmd: 'powershell',
    args: ['-NoProfile', '-File', script, ...args],
    ...(env ? { env } : {}),
    platforms,
  }
}
