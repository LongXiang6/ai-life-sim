/**
 * @module quiet.mjs
 * @description 检测器静默模式 —— 控制台只输出 FAIL / 摘要，详情落盘 reports/
 */

export function isQuiet(argv = process.argv) {
  return argv.includes('--quiet') || process.env.CHECK_QUIET === '1'
}

/** @param {string} msg */
export function logOk(msg) {
  if (!isQuiet()) console.log(msg)
}

/** @param {string} msg */
export function logInfo(msg) {
  if (!isQuiet()) console.log(msg)
}

/** @param {string} msg */
export function logFail(msg) {
  console.error(msg)
}

/** @param {string} msg — 写入 stdout 供 log 捕获；静默 PASS 时不刷控制台 */
export function logRefactorHint(msg) {
  if (isQuiet()) {
    process.stdout.write(`${msg}\n`)
  } else {
    console.log(msg)
  }
}

/** @param {string} domain @param {'PASS'|'FAIL'} status @param {string} [detail] */
export function logDomainSummary(domain, status, detail = '') {
  const suffix = detail ? ` — ${detail}` : ''
  if (status === 'PASS') {
    if (isQuiet()) console.log(`[check:${domain}] PASS${suffix}`)
    else console.log(`[check:${domain}] completed${suffix}`)
  } else {
    console.error(`[check:${domain}] FAIL${suffix}`)
  }
}
