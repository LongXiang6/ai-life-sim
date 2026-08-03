/**
 * Purpose: Ensure every checker runtime source is present in the committed deployment candidate.
 * Owner: quality:standardization
 * Responsibility: Scanner source packaging only; runtime execution belongs to each checker domain.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  fail,
  projectPath,
  projectRoot,
  resolveProjectPath,
  walkFiles,
} from './context.mjs'

const sourceExtensions = new Set(['.cjs', '.js', '.json', '.mjs', '.ps1', '.ts'])
const checkerRoot = resolveProjectPath('scripts/check')
const markdownRenderer = resolveProjectPath(
  'scripts/check/lib/checker-utils/report-renderers/markdown-report.ps1',
)

function loadTrackedCheckerPaths() {
  try {
    const output = execFileSync(
      'git',
      ['-C', projectRoot, 'ls-files', '-z', '--', 'scripts/check'],
      { encoding: 'utf8', windowsHide: true },
    )
    return new Set(output.split('\0').filter(Boolean).map((entry) => entry.replace(/\\/g, '/')))
  } catch (error) {
    fail('STD-CHECKER-SOURCE-TRACKING', checkerRoot, `无法读取 Git 候选文件：${String(error)}`)
    return new Set()
  }
}

export function checkCheckerSourcePackaging() {
  const tracked = loadTrackedCheckerPaths()
  for (const file of walkFiles(checkerRoot)) {
    if (!sourceExtensions.has(path.extname(file))) continue
    const relativePath = projectPath(file)
    if (!tracked.has(relativePath)) {
      fail(
        'STD-CHECKER-SOURCE-UNTRACKED',
        file,
        '扫描器运行源码未进入 Git 候选，干净工作树会缺失该组件',
      )
    }
  }

  if (!fs.existsSync(markdownRenderer)) {
    fail(
      'STD-CHECKER-COMPONENT-MISSING',
      markdownRenderer,
      'MOD 扫描器 Markdown 报告渲染组件不存在',
    )
  }
}
