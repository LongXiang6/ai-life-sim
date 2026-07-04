import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_REPORT_MAX_AGE_MS = 10 * 60 * 1000

const REPORT_FILE_PATTERNS = [
  /^check-run-.*\.(?:json|md)$/u,
  /^check-log-.*\.txt$/u,
  /^checker-.*\.(?:json|md)$/u,
  /^report\.html$/u,
]

/** @param {string} fileName */
function isGeneratedCheckReport(fileName) {
  return REPORT_FILE_PATTERNS.some((pattern) => pattern.test(fileName))
}

/**
 * 清理检测器自动生成的旧报告。只删除已知报告文件名，避免误删 reports/ 下的人工产物。
 *
 * @param {string} projectRoot
 * @param {{ maxAgeMs?: number, now?: number, verbose?: boolean }} [opts]
 */
export function cleanupOldReports(projectRoot, opts = {}) {
  const reportsDir = path.join(projectRoot, 'reports')
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_REPORT_MAX_AGE_MS
  const now = opts.now ?? Date.now()
  const verbose = opts.verbose ?? process.env.CHECK_CLEAN_REPORTS_VERBOSE === '1'
  const result = { deleted: 0, skipped: 0, errors: 0 }

  if (!fs.existsSync(reportsDir)) return result

  let entries
  try {
    entries = fs.readdirSync(reportsDir, { withFileTypes: true })
  } catch (e) {
    result.errors += 1
    if (verbose) console.warn(`[check:cleanup] cannot read reports/: ${e.message ?? e}`)
    return result
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isGeneratedCheckReport(entry.name)) {
      result.skipped += 1
      continue
    }

    const fullPath = path.join(reportsDir, entry.name)
    try {
      const stat = fs.statSync(fullPath)
      if (now - stat.mtimeMs <= maxAgeMs) {
        result.skipped += 1
        continue
      }

      fs.unlinkSync(fullPath)
      result.deleted += 1
    } catch (e) {
      result.errors += 1
      if (verbose) console.warn(`[check:cleanup] cannot delete ${entry.name}: ${e.message ?? e}`)
    }
  }

  if (verbose && result.deleted > 0) {
    console.log(`[check:cleanup] deleted ${result.deleted} old report file(s)`)
  }

  return result
}
