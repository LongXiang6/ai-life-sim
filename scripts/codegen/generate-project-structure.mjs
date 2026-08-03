#!/usr/bin/env node
/**
 * Purpose: Generate the project ownership index and the legacy file-header migration baseline.
 * Owner: code-generation
 * Responsibility: Write deterministic derived JSON; it does not decide business ownership or update source files.
 */

import fs from 'node:fs'
import path from 'node:path'
import { canonicalJson, projectRoot } from '../check/domains/standardization/lib/context.mjs'
import {
  buildHeaderBaseline,
  buildStructureIndex,
  buildStructureSnapshot,
} from '../check/domains/standardization/lib/structure-snapshot.mjs'

const args = new Set(process.argv.slice(2))
const snapshot = buildStructureSnapshot()
const outputs = [
  {
    file: path.join(projectRoot, 'scripts', 'check', 'generated', 'project-structure-index.generated.json'),
    value: buildStructureIndex(snapshot),
  },
]

if (args.has('--write-header-baseline')) {
  outputs.push(
    {
      file: path.join(projectRoot, 'scripts', 'check', 'rules', 'file-header-baseline.generated.json'),
      value: buildHeaderBaseline(snapshot),
    },
  )
}

for (const output of outputs) {
  fs.mkdirSync(path.dirname(output.file), { recursive: true })
  fs.writeFileSync(output.file, canonicalJson(output.value), 'utf8')
  console.log(`[structure] wrote ${path.relative(projectRoot, output.file).replace(/\\/g, '/')}`)
}
