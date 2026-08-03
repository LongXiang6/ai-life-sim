/**
 * Purpose: Build the deterministic project ownership, file-budget, header, and directory index snapshot.
 * Owner: quality:standardization
 * Responsibility: Derive facts from the filesystem and structure contract without deciding pass or fail.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  projectPath,
  readText,
  resolveProjectPath,
  standardizationConfig,
  structureConfig,
  walkFiles,
} from './context.mjs'

const budgetExtensions = new Set(structureConfig.budgetExtensions)
const compactEntryFiles = new Set(structureConfig.compactEntryFiles)
const headerExtensions = new Set(structureConfig.headerExtensions)
const ignoredPaths = new Set(structureConfig.ignoredPaths)
const generatedPattern = new RegExp(standardizationConfig.generatedFilePattern)

function countLines(text) {
  if (!text) return 0
  return text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0)
}

function resolveOwner(relativePath) {
  for (const rule of structureConfig.ownerRules) {
    if (rule.path && relativePath === rule.path) {
      return { owner: rule.owner, responsibility: rule.responsibility }
    }
    if (!rule.prefix || !relativePath.startsWith(rule.prefix)) continue
    if (Number.isInteger(rule.segment)) {
      const segment = relativePath.slice(rule.prefix.length).split('/')[rule.segment]
      if (!segment) continue
      return { owner: `${rule.ownerPrefix}${segment}`, responsibility: rule.responsibility }
    }
    return { owner: rule.owner, responsibility: rule.responsibility }
  }
  return null
}

function hasStandardHeader(file, text) {
  const extension = path.extname(file)
  if (!headerExtensions.has(extension) || generatedPattern.test(path.basename(file))) return true
  const header = text.split(/\r?\n/).slice(0, 18).join('\n')
  return header.includes('Purpose:') && header.includes('Owner:') && header.includes('Responsibility:')
}

function preferredBudget(file) {
  if (!budgetExtensions.has(path.extname(file))) return null
  if (compactEntryFiles.has(path.basename(file))) return structureConfig.compactEntryLineBudget
  return structureConfig.preferredLineBudget
}

function collectFiles() {
  const files = structureConfig.scanRoots.flatMap((root) => (
    walkFiles(resolveProjectPath(root), structureConfig.ignoredDirectories)
  ))
  return [...new Set(files)]
    .filter((file) => !ignoredPaths.has(projectPath(file)))
    .sort((left, right) => projectPath(left).localeCompare(projectPath(right), 'en'))
}

export function buildStructureSnapshot() {
  return collectFiles().map((file) => {
    const relativePath = projectPath(file)
    const text = readText(file)
    const ownership = resolveOwner(relativePath)
    const generated = generatedPattern.test(path.basename(file))
    const budget = preferredBudget(file)
    const requiresHeader = headerExtensions.has(path.extname(file)) && !generated
    return {
      path: relativePath,
      owner: ownership?.owner ?? null,
      responsibility: ownership?.responsibility ?? null,
      directory: path.posix.dirname(relativePath),
      lines: countLines(text),
      budget,
      overBudget: budget !== null && !generated && countLines(text) > budget,
      generated,
      requiresHeader,
      hasHeader: !requiresHeader || hasStandardHeader(file, text),
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
    }
  })
}

export function buildStructureIndex(snapshot) {
  const grouped = new Map()
  for (const file of snapshot) {
    const owner = file.owner ?? 'unowned'
    const current = grouped.get(owner) ?? {
      id: owner,
      responsibility: file.responsibility ?? '未解析所有者',
      directories: new Set(),
      files: [],
      oversized: [],
    }
    current.directories.add(file.directory)
    current.files.push(file.path)
    if (file.overBudget) current.oversized.push(file.path)
    grouped.set(owner, current)
  }

  return {
    schemaVersion: 1,
    notice: 'auto-generated; DO NOT EDIT',
    source: 'scripts/check/rules/project-structure.json',
    generatedBy: 'scripts/codegen/generate-project-structure.mjs',
    owners: [...grouped.values()]
      .sort((left, right) => left.id.localeCompare(right.id, 'en'))
      .map((entry) => ({
        id: entry.id,
        responsibility: entry.responsibility,
        directories: [...entry.directories].sort((left, right) => left.localeCompare(right, 'en')),
        files: entry.files.sort((left, right) => left.localeCompare(right, 'en')),
        oversized: entry.oversized.sort((left, right) => left.localeCompare(right, 'en')),
      })),
  }
}

export function buildHeaderBaseline(snapshot) {
  return {
    schemaVersion: 1,
    notice: 'auto-generated baseline; changed files must add Purpose, Owner, and Responsibility headers',
    entries: snapshot
      .filter((file) => file.requiresHeader && !file.hasHeader)
      .map((file) => ({ path: file.path, owner: file.owner, sha256: file.sha256 }))
      .sort((left, right) => left.path.localeCompare(right.path, 'en')),
  }
}
