/**
 * @module resolve-changed.mjs
 * @description 根据变更文件路径推断应运行的检测域（含 ATCE 结构性叠加）
 */

import { execSync } from 'node:child_process'
import { DOMAINS } from '../domains.mjs'

/** 触及这些路径时强制叠加 wiring + loader */
const STRUCTURAL_OVERLAY = [
  'src/mods/',
  'src/core/',
  'src/foundation/',
  'scripts/check/rules/architecture-rules',
  'scripts/check/rules/',
  'scripts/check/domains/structural/scan-typescript',
  'scripts/check/domains/structural/scan-file-import',
  'scripts/codegen/generate-mod-wiring',
  'subsystems/',
  'manifest.ts',
  'world-init',
]

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function getChangedFiles(projectRoot) {
  const cmds = [
    'git diff --name-only HEAD',
    'git diff --name-only --cached',
    'git ls-files --others --exclude-standard',
  ]
  const files = new Set()
  for (const cmd of cmds) {
    try {
      const out = execSync(cmd, { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
      for (const line of out.split(/\r?\n/)) {
        const t = line.trim().replace(/\\/g, '/')
        if (t) files.add(t)
      }
    } catch {
      // 非 git 仓库或命令失败时忽略
    }
  }
  return [...files]
}

/**
 * @param {string} filePath
 * @param {string[]} triggers
 */
function matchesTrigger(filePath, triggers) {
  const p = filePath.replace(/\\/g, '/')
  for (const t of triggers) {
    if (t.endsWith('*')) {
      if (p.startsWith(t.slice(0, -1))) return true
    } else if (t.startsWith('*')) {
      if (p.endsWith(t.slice(1))) return true
    } else if (p.includes(t)) {
      return true
    }
  }
  return false
}

/**
 * @param {string[]} files
 * @returns {boolean}
 */
function needsStructuralOverlay(files) {
  return files.some((f) => {
    const p = f.replace(/\\/g, '/')
    return STRUCTURAL_OVERLAY.some((s) => p.includes(s))
  })
}

/**
 * @param {string[]} files relative paths
 * @returns {string[]} domain ids
 */
export function resolveDomainsFromFiles(files) {
  const set = new Set()
  for (const file of files) {
    for (const [id, domain] of Object.entries(DOMAINS)) {
      if (domain.triggers?.some((t) => matchesTrigger(file, t))) {
        set.add(id)
      }
    }
  }
  if (needsStructuralOverlay(files)) {
    set.add('wiring')
    set.add('loader')
  }
  if (set.size === 0) set.add('wiring')
  return [...set]
}

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function resolveDomainsFromGit(projectRoot) {
  return resolveDomainsFromFiles(getChangedFiles(projectRoot))
}
