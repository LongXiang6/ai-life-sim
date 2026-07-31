#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const loader = path.join(root, 'scripts', 'check', 'lib', 'typescript-loader.mjs')
const contractRunner = path.join(root, 'scripts', 'check', 'domains', 'structural', 'execution-flow-contracts-runner.ts')
const reviewPath = path.join(root, 'scripts', 'check', 'rules', 'execution-system-review.json')

function runNode(label, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status ?? 1}`)
}

function listSourceFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return []
  const files = []
  const pending = [rootPath]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(entryPath)
      else if (/\.(?:cjs|js|mjs|ts|tsx)$/u.test(entry.name)) files.push(entryPath)
    }
  }
  return files
}

function validateReview(review) {
  if (review.schemaVersion !== 1) throw new Error('execution review schemaVersion must be 1')
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(review.reviewedAt)) throw new Error('reviewedAt must be YYYY-MM-DD')
  if (!Number.isSafeInteger(review.reviewIntervalDays) || review.reviewIntervalDays <= 0) {
    throw new Error('reviewIntervalDays must be a positive integer')
  }
  const reviewedAt = Date.parse(`${review.reviewedAt}T00:00:00Z`)
  const ageDays = Math.floor((Date.now() - reviewedAt) / (24 * 60 * 60 * 1000))
  if (ageDays < 0) throw new Error(`execution system review date is in the future: ${review.reviewedAt}`)
  if (ageDays > review.reviewIntervalDays) {
    throw new Error(`execution system review is overdue: ${ageDays} days since ${review.reviewedAt}`)
  }
}

function scanObsoleteMechanisms(review) {
  const failures = []
  for (const rule of review.obsoleteMechanisms) {
    const pattern = new RegExp(rule.pattern, 'u')
    for (const relativeRoot of rule.paths) {
      for (const file of listSourceFiles(path.join(root, relativeRoot))) {
        const source = fs.readFileSync(file, 'utf8')
        if (!pattern.test(source)) continue
        failures.push(`${rule.id}: ${path.relative(root, file)} - ${rule.message}`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`obsolete execution mechanisms found:\n${failures.map((failure) => `  ${failure}`).join('\n')}`)
  }
}

try {
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
  validateReview(review)
  runNode('generated wiring drift check', [
    path.join(root, 'scripts', 'codegen', 'generate-mod-wiring.mjs'),
    '--check',
  ])
  runNode('execution flow contract check', [
    '--no-warnings=ExperimentalWarning',
    '--loader',
    pathToFileURL(loader).href,
    contractRunner,
  ])
  scanObsoleteMechanisms(review)
  console.log(`[execution-system-gate] PASS · reviewed ${review.reviewedAt} · cadence ${review.reviewIntervalDays} days`)
} catch (error) {
  console.error(`[execution-system-gate] FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
