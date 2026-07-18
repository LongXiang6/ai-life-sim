#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  formatShanghaiTimestamp,
  incrementReleaseVersion,
  parseChangelogHeader,
} from './game-update-contract.mjs'

const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptRoot, '../..')
const paths = {
  package: path.join(projectRoot, 'package.json'),
  packageLock: path.join(projectRoot, 'package-lock.json'),
  engineVersion: path.join(projectRoot, 'src/core/version.ts'),
  help: path.join(projectRoot, 'public/help.md'),
  readme: path.join(projectRoot, 'README.md'),
  changelogIndex: path.join(projectRoot, 'public/changelog-index.json'),
  publicRoot: path.join(projectRoot, 'public'),
  lock: path.join(projectRoot, '.git/game-update.lock'),
}

function optionValue(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function optionValues(args, name) {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1])
  }
  return values
}

function serializeJson(value, original) {
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  return `${JSON.stringify(value, null, 2)}\n`.replaceAll('\n', newline)
}

function replaceRequired(content, expected, replacement, label) {
  if (!content.includes(expected)) throw new Error(`${label}: expected current version marker is missing`)
  return content.replace(expected, replacement)
}

function listChangelogChunks() {
  return fs.readdirSync(paths.publicRoot)
    .map((name) => ({ name, match: /^changelog-(\d+)\.txt$/.exec(name) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ name: entry.name, index: Number(entry.match[1]) }))
    .sort((left, right) => left.index - right.index)
}

function validateSummaries(summaries) {
  if (summaries.length === 0 || summaries.length > 3) {
    throw new Error('provide one to three --summary values')
  }
  for (const summary of summaries) {
    if (!summary.trim() || /[\r\n]/.test(summary)) throw new Error('summary must be one non-empty line')
    if ([...summary.trim()].length > 80) throw new Error(`summary exceeds 80 characters: ${summary}`)
  }
}

function buildMutation({ summaries, category, timestamp }) {
  const packageText = fs.readFileSync(paths.package, 'utf8')
  const packageLockText = fs.readFileSync(paths.packageLock, 'utf8')
  const engineText = fs.readFileSync(paths.engineVersion, 'utf8')
  const helpText = fs.readFileSync(paths.help, 'utf8')
  const readmeText = fs.readFileSync(paths.readme, 'utf8')
  const packageJson = JSON.parse(packageText)
  const packageLock = JSON.parse(packageLockText)
  const currentVersion = packageJson.version
  const engineVersion = engineText.match(/ENGINE_VERSION\s*=\s*'([^']+)'/)?.[1]
  const chunks = listChangelogChunks()
  const latestChunk = chunks.at(-1)
  if (!latestChunk) throw new Error('no public changelog chunks found')
  const latestPath = path.join(paths.publicRoot, latestChunk.name)
  const latestHeader = parseChangelogHeader(fs.readFileSync(latestPath, 'utf8'), latestChunk.name)

  const synchronizedVersions = [
    ['package-lock root', packageLock.version],
    ['package-lock workspace', packageLock.packages?.['']?.version],
    ['ENGINE_VERSION', engineVersion],
    ['latest game changelog', latestHeader.version],
  ]
  for (const [label, version] of synchronizedVersions) {
    if (version !== currentVersion) throw new Error(`${label} ${version ?? 'missing'} does not match package ${currentVersion}`)
  }
  if (!helpText.includes(`当前版本：**${currentVersion}**。`)) throw new Error('public/help.md current version is not synchronized')
  if (!readmeText.includes(`当前版本：**${currentVersion}**。`)) throw new Error('README.md current version is not synchronized')

  if (fs.existsSync(paths.changelogIndex)) {
    const index = JSON.parse(fs.readFileSync(paths.changelogIndex, 'utf8'))
    if (index.latestChunk !== latestChunk.index) {
      throw new Error(`changelog index ${index.latestChunk} does not match latest file ${latestChunk.index}`)
    }
  }

  const nextVersion = incrementReleaseVersion(currentVersion)
  const nextChunkIndex = latestChunk.index + 1
  const nextChunkPath = path.join(paths.publicRoot, `changelog-${nextChunkIndex}.txt`)
  if (fs.existsSync(nextChunkPath)) throw new Error(`next changelog already exists: ${path.basename(nextChunkPath)}`)

  packageJson.version = nextVersion
  packageLock.version = nextVersion
  if (!packageLock.packages?.['']) throw new Error('package-lock workspace root is missing')
  packageLock.packages[''].version = nextVersion

  const changelog = [
    '---',
    `Version: ${nextVersion}`,
    `Date: ${timestamp}`,
    '',
    `${category}:`,
    ...summaries.map((summary) => `  - ${summary.trim()}`),
    '',
  ].join('\r\n')

  return {
    currentVersion,
    nextVersion,
    nextChunkIndex,
    nextChunkPath,
    files: new Map([
      [paths.package, serializeJson(packageJson, packageText)],
      [paths.packageLock, serializeJson(packageLock, packageLockText)],
      [paths.engineVersion, replaceRequired(engineText, `ENGINE_VERSION = '${currentVersion}'`, `ENGINE_VERSION = '${nextVersion}'`, 'src/core/version.ts')],
      [paths.help, replaceRequired(helpText, `当前版本：**${currentVersion}**。`, `当前版本：**${nextVersion}**。`, 'public/help.md')],
      [paths.readme, replaceRequired(readmeText, `当前版本：**${currentVersion}**。`, `当前版本：**${nextVersion}**。`, 'README.md')],
      [paths.changelogIndex, `${JSON.stringify({ latestChunk: nextChunkIndex }, null, 2)}\r\n`],
      [nextChunkPath, changelog],
    ]),
  }
}

function writeWithRollback(files) {
  const originals = new Map()
  try {
    for (const [filePath, content] of files) {
      originals.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null)
      fs.writeFileSync(filePath, content, 'utf8')
    }
  } catch (error) {
    for (const [filePath, original] of [...originals].reverse()) {
      if (original === null) fs.rmSync(filePath, { force: true })
      else fs.writeFileSync(filePath, original)
    }
    throw error
  }
}

function runSelfTest() {
  assert.equal(incrementReleaseVersion('5.0.0'), '5.0.1')
  assert.equal(incrementReleaseVersion('5.0.9'), '5.1.0')
  assert.equal(incrementReleaseVersion('5.9.9'), '6.0.0')
  assert.match(formatShanghaiTimestamp(new Date('2026-07-18T07:08:09Z')), /^2026-07-18 15:08:09$/)
  console.log('[record-game-update:self-test] PASS')
}

const args = process.argv.slice(2)
if (args.includes('--self-test')) {
  runSelfTest()
  process.exit(0)
}

const summaries = optionValues(args, '--summary')
const category = optionValue(args, '--category')?.trim() || '更新'
validateSummaries(summaries)
if (!category || /[\r\n:：]/.test(category) || [...category].length > 12) {
  throw new Error('category must be a concise single-line label without a colon')
}

let lockHandle
try {
  lockHandle = fs.openSync(paths.lock, 'wx')
} catch {
  throw new Error('another game update record is running; retry after it finishes')
}

try {
  const timestamp = formatShanghaiTimestamp()
  const mutation = buildMutation({ summaries, category, timestamp })
  writeWithRollback(mutation.files)
  const result = {
    previousVersion: mutation.currentVersion,
    version: mutation.nextVersion,
    timestamp,
    changelog: path.relative(projectRoot, mutation.nextChunkPath).replaceAll('\\', '/'),
  }
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else console.log(`[record-game-update] ${result.previousVersion} -> ${result.version} | ${result.timestamp} | ${result.changelog}`)
} finally {
  if (lockHandle !== undefined) fs.closeSync(lockHandle)
  fs.rmSync(paths.lock, { force: true })
}
