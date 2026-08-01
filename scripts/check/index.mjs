#!/usr/bin/env node
/**
 * @module index.mjs
 * @description 检测编排入口 —— 按功能域 / profile / 变更文件运行扫描
 *
 * Usage:
 *   node scripts/check/index.mjs full              # 全量（默认静默）
 *   node scripts/check/index.mjs quick             # 快速：wiring + loader
 *   node scripts/check/index.mjs changed           # 按 git 变更推断域
 *   node scripts/check/index.mjs structural         # ATCE 结构性扫描
 *   node scripts/check/index.mjs refactor           # 架构重构（无 UI/叙事）
 *   node scripts/check/index.mjs mod --mod mod-world
 *   node scripts/check/index.mjs full --verbose    # 完整控制台输出
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOMAINS, PROFILES, resolveProfile } from './domains.mjs'
import { runCheck } from './lib/runner.mjs'
import { resolveDomainsFromGit } from './lib/resolve-changed.mjs'

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const argv = process.argv.slice(2)

const verbose = argv.includes('--verbose')
const quiet = !verbose
const modIdx = argv.indexOf('--mod')
const modName = modIdx >= 0 ? argv[modIdx + 1] ?? '' : ''

const positional = argv.filter((a) => !a.startsWith('--') && a !== modName)
const target = positional[0] ?? 'full'

/** @type {string[]} */
let domainIds
/** @type {string} */
let profile

if (target === 'changed') {
  domainIds = resolveDomainsFromGit(projectRoot)
  profile = `changed(${domainIds.join('+')})`
  if (quiet) {
    console.log(`[check] changed files → domains: ${domainIds.join(', ')}`)
  }
} else {
  try {
    const resolved = resolveProfile(target, DOMAINS, modName)
    domainIds = resolved.ids
    profile = resolved.profile
  } catch (e) {
    console.error(String(e.message))
    console.error('\nProfiles:', Object.keys(PROFILES).join(', '))
    console.error('Domains:', Object.keys(DOMAINS).join(', '))
    process.exit(2)
  }
}

await runCheck({ projectRoot, profile, domainIds, quiet, modName })
