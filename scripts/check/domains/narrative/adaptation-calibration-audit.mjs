/**
 * Phase 7：adaptation prompt 校准变量审计
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)

function walkAdaptationPrompts(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      walkAdaptationPrompts(full, acc)
    } else if (/adaptation.*\.ts$/i.test(ent.name) && full.includes(`${path.sep}prompts${path.sep}`)) {
      acc.push(full)
    }
  }
  return acc
}

const files = walkAdaptationPrompts(path.join(root, 'src/mods'))
let failed = 0

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const rel = path.relative(root, file)
  if (!content.includes('worldCalibrationSummary')) {
    console.error(`FAIL: ${rel} missing worldCalibrationSummary`)
    failed++
  }
}

const helper = fs.readFileSync(
  path.join(root, 'src/mods/mod-world/utils/adaptation-prompt-calibration.ts'),
  'utf8',
)
if (!helper.includes('fillAdaptationPrompt')) {
  console.error('FAIL: fillAdaptationPrompt helper missing')
  failed++
}

if (failed === 0) {
  console.log(`PASS: adaptation-calibration-audit (${files.length} prompts)`)
  process.exit(0)
}
process.exit(1)
