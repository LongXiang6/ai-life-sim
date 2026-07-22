#!/usr/bin/env node

import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ROOT = '/root/ai-life-sim-releases'
const DEFAULT_MIN_SIZE = 4096

function usage() {
  console.log(`Usage: node scripts/ops/deduplicate-release-storage.mjs [options]

Options:
  --root <path>          Immutable release root (default: ${DEFAULT_ROOT})
  --min-size <bytes>     Minimum file size (default: ${DEFAULT_MIN_SIZE})
  --execute              Replace duplicate files with hardlinks

Only immutable node_modules and .next/static files are considered. Environment,
database, logs, source files and runtime caches are never included.`)
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, minSize: DEFAULT_MIN_SIZE, execute: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') return { ...options, help: true }
    if (arg === '--execute') {
      options.execute = true
      continue
    }
    const value = argv[++index]
    if (!value) throw new Error(`${arg} requires a value`)
    if (arg === '--root') options.root = path.resolve(value)
    else if (arg === '--min-size') options.minSize = Number(value)
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!Number.isSafeInteger(options.minSize) || options.minSize < 1) throw new Error('--min-size must be a positive integer')
  return options
}

async function collectTargets(root) {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const targets = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const release = path.join(root, entry.name)
    for (const relative of ['node_modules', path.join('.next', 'static')]) {
      try {
        if ((await fs.stat(path.join(release, relative))).isDirectory()) targets.push(path.join(release, relative))
      } catch {
        // A source-only or incomplete release may not contain both immutable trees.
      }
    }
  }
  return targets
}

function runHardlink(targets, options) {
  return new Promise((resolve, reject) => {
    const args = [
      '--ignore-time',
      '--keep-oldest',
      '--minimum-size',
      String(options.minSize),
      ...(options.execute ? [] : ['--dry-run']),
      ...targets,
    ]
    const child = spawn('/usr/bin/hardlink', args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`hardlink exited with ${code ?? signal}`))
    })
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }
  const root = await fs.realpath(options.root)
  const targets = await collectTargets(root)
  if (targets.length === 0) {
    console.log(JSON.stringify({ event: 'release-dedup', mode: options.execute ? 'execute' : 'dry-run', targets: 0 }))
    return
  }
  await runHardlink(targets, options)
  console.log(JSON.stringify({
    event: 'release-dedup',
    mode: options.execute ? 'execute' : 'dry-run',
    targets: targets.length,
    minimumSize: options.minSize,
  }))
}

main().catch((error) => {
  console.error(`[release-dedup] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
