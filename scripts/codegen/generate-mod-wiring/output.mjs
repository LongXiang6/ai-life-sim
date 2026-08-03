/**
 * Purpose: Write generated wiring files or verify their normalized contents.
 * Owner: code-generation
 * Responsibility: Generated-file persistence and drift reporting only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHECK_ONLY, ROOT } from './context.mjs'

export function writeOrCheck(filePath, content) {
  const normalized = content.replace(/\r\n/g, '\n')
  if (CHECK_ONLY) {
    const existing = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
      : ''
    if (existing !== normalized) {
      console.error(`[generate-mod-wiring] 漂移: ${path.relative(ROOT, filePath)}`)
      console.error('  运行 npm run generate:wiring 更新')
      return false
    }
    return true
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, normalized, 'utf8')
  console.log(`[generate-mod-wiring] 写入 ${path.relative(ROOT, filePath)}`)
  return true
}
