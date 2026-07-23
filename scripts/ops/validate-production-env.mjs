#!/usr/bin/env node

/**
 * Validate the private production environment before a release is activated.
 * Values are never printed; only missing variable names and safe metadata are
 * reported so a bad release cannot silently disable all preset models.
 */

import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve(process.argv[2] || '.env.production.local')

function fail(message) {
  console.error(`[production-env] FAIL: ${message}`)
  process.exitCode = 1
}

if (!fs.existsSync(filePath)) {
  fail(`missing private environment file: ${filePath}`)
  process.exit()
}

const source = fs.readFileSync(filePath, 'utf8')
const values = new Map()
for (const rawLine of source.split(/\r?\n/u)) {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) continue
  const separator = line.indexOf('=')
  if (separator <= 0) continue
  values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
}

const requiredPairs = [
  ['LONGCAT_API_KEY', 'LONGCAT_BASE_URL'],
  ['MANAGED_AI_API_KEY', 'MANAGED_A6_BASE_URL'],
]
const missing = requiredPairs.flatMap((pair) => pair.filter((name) => !values.get(name)))
if (missing.length > 0) {
  fail(`missing required managed provider variables: ${[...new Set(missing)].join(', ')}`)
}

for (const name of ['LONGCAT_BASE_URL', 'MANAGED_A6_BASE_URL']) {
  const value = values.get(name)
  if (!value) continue
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      fail(`${name} must be an HTTPS origin/path without credentials, query, or hash`)
    }
  } catch {
    fail(`${name} must be a valid HTTPS URL`)
  }
}

if (process.platform !== 'win32') {
  const mode = fs.statSync(filePath).mode & 0o777
  if (mode !== 0o600) fail(`${filePath} must have mode 600 (current ${mode.toString(8)})`)
}

if (process.exitCode) process.exit()
console.log(`[production-env] PASS: managed presets configured in ${filePath}`)
