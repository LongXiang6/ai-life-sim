/**
 * @module report.mjs
 * @description 统一检测报告写入 ai-life-sim/reports/（含 ATCE 信号）
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} opts.profile
 * @param {Array<{ domain: string, status: 'PASS'|'FAIL', exitCode: number, logFile?: string, errorLines?: string[] }>} opts.domains
 * @param {object[]} [opts.refactorSignals]
 * @param {object[]} [opts.repeatOffenders]
 * @param {string} [opts.atceRecommendation]
 */
export function writeCheckReport({
  projectRoot,
  profile,
  domains,
  refactorSignals = [],
  repeatOffenders = [],
  atceRecommendation = 'PATCH_OK',
}) {
  const reportsDir = path.join(projectRoot, 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const failed = domains.filter((d) => d.status === 'FAIL')
  const jsonPath = path.join(reportsDir, `check-run-${timestamp}.json`)

  const payload = {
    timestamp: new Date().toISOString(),
    profile,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    atceRecommendation,
    summary: {
      total: domains.length,
      passed: domains.length - failed.length,
      failed: failed.length,
      refactorSignalCount: refactorSignals.length,
      repeatOffenderCount: repeatOffenders.length,
    },
    refactorSignals,
    repeatOffenders,
    domains,
  }

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const mdPath = path.join(reportsDir, `check-run-${timestamp}.md`)
  const md = [
    `# Check Run — ${payload.timestamp}`,
    '',
    `- Profile: \`${profile}\``,
    `- Status: **${payload.status}**`,
    `- **ATCE**: \`${atceRecommendation}\``,
    `- Domains: ${payload.summary.passed} pass / ${payload.summary.failed} fail`,
    '',
    refactorSignals.length > 0 ? '## Refactor Signals' : '',
    ...refactorSignals.map((s) => {
      const tag = s.severity === 'hint' ? 'hint' : 'FAIL'
      return `- **${s.ruleId}** (${tag}) \`${s.file || s.module}\` — ${s.refactorHint}`
    }),
    repeatOffenders.length > 0 ? '' : '',
    repeatOffenders.length > 0 ? '## Repeat Offenders (L3 默认)' : '',
    ...repeatOffenders.map((o) => `- **${o.ruleId}** @ ${o.module} (${o.occurrences}x) — ${o.message}`),
    '',
    '## Domains',
    '',
    '| Domain | Status | Log |',
    '|--------|--------|-----|',
    ...domains.map((d) => {
      const log = d.logFile ? path.relative(projectRoot, d.logFile).replace(/\\/g, '/') : '—'
      return `| ${d.domain} | ${d.status} | ${log} |`
    }),
    '',
    failed.length > 0 ? '## Failures (console excerpt)' : '',
    ...failed.flatMap((d) => [
      '',
      `### ${d.domain}`,
      ...(d.errorLines?.length ? d.errorLines.map((l) => `- ${l}`) : ['- (see log file)']),
    ]),
    '',
    `> Full JSON: \`${path.basename(jsonPath)}\``,
    `> 项目上下文: \`../AGENTS.md\``,
    '',
  ]
    .filter((line, i, arr) => line !== '' || arr[i - 1] !== '')
    .join('\n')

  fs.writeFileSync(mdPath, md, 'utf8')

  return { jsonPath, mdPath, payload }
}
