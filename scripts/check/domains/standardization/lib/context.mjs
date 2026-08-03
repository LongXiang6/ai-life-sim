/**
 * Purpose: Provide shared paths, configuration, filesystem helpers, and issue collection for standardization checks.
 * Owner: quality:standardization
 * Responsibility: Infrastructure only; individual check modules own their validation rules.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

export const projectRoot = path.resolve(scriptDir, '../../../../../')
export const workspaceRoot = path.resolve(projectRoot, '..')
export const standardizationConfigPath = path.join(projectRoot, 'scripts', 'check', 'rules', 'standardization.json')
export const structureConfigPath = path.join(projectRoot, 'scripts', 'check', 'rules', 'project-structure.json')
export const standardizationConfig = readJson(standardizationConfigPath)
export const structureConfig = readJson(structureConfigPath)
export const issues = []

export function fail(rule, file, message) {
  issues.push({ rule, file: displayPath(file), message })
}

export function displayPath(file) {
  return path.relative(workspaceRoot, file).replace(/\\/g, '/') || '.'
}

export function projectPath(file) {
  return path.relative(projectRoot, file).replace(/\\/g, '/') || '.'
}

export function resolveProjectPath(relativePath) {
  return path.resolve(projectRoot, relativePath)
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

export function readJson(file) {
  return JSON.parse(readText(file))
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function walkFiles(root, ignoredDirectories = []) {
  if (!fs.existsSync(root)) return []
  if (fs.statSync(root).isFile()) return [root]

  const ignored = new Set(ignoredDirectories)
  const result = []
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))

  for (const entry of entries) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...walkFiles(full, ignoredDirectories))
    else if (entry.isFile()) result.push(full)
  }
  return result
}
