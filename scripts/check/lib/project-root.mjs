/**
 * @module project-root.mjs
 * @description 解析 ai-life-sim 项目根目录
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @param {string} metaUrl import.meta.url
 */
export function getProjectRoot(metaUrl) {
  const dir = path.dirname(fileURLToPath(metaUrl)).replace(/\\/g, '/')
  if (dir.includes('/scripts/check/domains/')) {
    return path.resolve(dir, '..', '..', '..', '..')
  }
  if (dir.endsWith('/scripts')) {
    return path.resolve(dir, '..')
  }
  return path.resolve(dir, '..')
}
