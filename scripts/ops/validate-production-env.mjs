#!/usr/bin/env node

/**
 * Validate the private production environment before a release is activated.
 * AI calls use player-owned credentials, so this gate only validates the
 * private file boundary and never reads or reports secret values.
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

if (process.platform !== 'win32') {
  const mode = fs.statSync(filePath).mode & 0o777
  if (mode !== 0o600) fail(`${filePath} must have mode 600 (current ${mode.toString(8)})`)
}

if (process.exitCode) process.exit()
console.log(`[production-env] PASS: private environment boundary valid at ${filePath}`)
