/**
 * Purpose: Read a public module entry together with its same-named responsibility directory for static audits.
 * Owner: quality:infrastructure
 * Responsibility: Deterministic source discovery only; individual checks own semantic assertions.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const SOURCE_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.jsx', '.mjs', '.ts', '.tsx'])

function walkSourceFiles(directory, extensions = SOURCE_EXTENSIONS) {
  if (!fs.existsSync(directory)) return []
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkSourceFiles(fullPath, extensions))
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(fullPath)
  }
  return files
}

export function readDirectorySource(
  relativeDirectory,
  root = process.cwd(),
  extensions = SOURCE_EXTENSIONS,
) {
  const directory = path.resolve(root, relativeDirectory)
  if (!fs.existsSync(directory)) throw new Error(`${relativeDirectory}: missing responsibility directory`)
  const allowedExtensions = extensions instanceof Set ? extensions : new Set(extensions)
  return walkSourceFiles(directory, allowedExtensions)
    .map((file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))
    .join('\n')
}

export function readModuleSource(relativeEntry, root = process.cwd()) {
  const entryPath = path.resolve(root, relativeEntry)
  if (!fs.existsSync(entryPath)) throw new Error(`${relativeEntry}: missing module entry`)
  const extension = path.extname(entryPath)
  const responsibilityDirectory = extension ? entryPath.slice(0, -extension.length) : entryPath
  const files = [entryPath, ...walkSourceFiles(responsibilityDirectory)]
  return files.map((file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).join('\n')
}
