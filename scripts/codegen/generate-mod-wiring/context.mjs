/**
 * Purpose: Define immutable paths, mode, and generated-file banner for MOD wiring code generation.
 * Owner: code-generation
 * Responsibility: Generator execution context only.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.join(dirname, '..', '..', '..')
export const MODS_DIR = path.join(ROOT, 'src', 'mods')
export const CHECK_ONLY = process.argv.includes('--check')
export const GENERATED_BANNER = `/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */`
