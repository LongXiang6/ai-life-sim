/**
 * Purpose: Publish the single standardization gate result and deterministic summary.
 * Owner: quality:standardization
 * Responsibility: Reporting only; validation modules own issue creation.
 */

import { issues } from './context.mjs'

export function reportStandardization(summary) {
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`[FAIL] [${issue.rule}] ${issue.file} — ${issue.message}`)
    }
    console.error(`[standardization] FAIL — ${issues.length} issue(s)`)
    process.exitCode = 1
    return
  }

  console.log(
    `[standardization] PASS — ${summary.files} files, ${summary.owners} owners, `
      + `${summary.overBudget} reviewed items above the preferred ${summary.preferredLineBudget}-line budget`,
  )
}
