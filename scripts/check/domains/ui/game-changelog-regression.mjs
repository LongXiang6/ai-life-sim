#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  incrementReleaseVersion,
  parseChangelogBullets,
  parseChangelogHeader,
} from '../../../release/game-update-contract.mjs'

const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptRoot, '../../../..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function listChunks() {
  return fs.readdirSync(path.join(projectRoot, 'public'))
    .map((name) => ({ name, match: /^changelog-(\d+)\.txt$/.exec(name) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ name: entry.name, index: Number(entry.match[1]) }))
    .sort((left, right) => left.index - right.index)
}

function runSelfTest() {
  assert.equal(incrementReleaseVersion('5.0.8'), '5.0.9')
  assert.equal(incrementReleaseVersion('5.0.9'), '5.1.0')
  assert.equal(incrementReleaseVersion('5.9.9'), '6.0.0')
  console.log('[game-changelog-regression:self-test] PASS')
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
  process.exit(0)
}

const packageJson = JSON.parse(read('package.json'))
const packageLock = JSON.parse(read('package-lock.json'))
const engineVersion = read('src/core/version.ts').match(/ENGINE_VERSION\s*=\s*'([^']+)'/)?.[1]
const index = JSON.parse(read('public/changelog-index.json'))
const chunks = listChunks()
const latest = chunks.at(-1)
assert.ok(latest, 'game changelog requires at least one chunk')
assert.equal(index.latestChunk, latest.index, 'changelog index must point to the newest chunk')

const latestContent = read(`public/${latest.name}`)
const latestHeader = parseChangelogHeader(latestContent, latest.name)
const latestBullets = parseChangelogBullets(latestContent)
const currentVersion = packageJson.version

assert.equal(packageLock.version, currentVersion, 'package-lock root version must match package.json')
assert.equal(packageLock.packages?.['']?.version, currentVersion, 'package-lock workspace version must match package.json')
assert.equal(engineVersion, currentVersion, 'ENGINE_VERSION must match package.json')
assert.equal(latestHeader.version, currentVersion, 'newest game changelog version must match package.json')
assert.match(latestHeader.timestamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'newest game changelog timestamp must include seconds')
assert.ok(read('public/help.md').includes(`当前版本：**${currentVersion}**。`), 'player help current version must match')
assert.ok(read('README.md').includes(`当前版本：**${currentVersion}**。`), 'README current version must match')
assert.ok(latestBullets.length >= 1 && latestBullets.length <= 3, 'newest changelog must contain one to three concise bullets')
for (const bullet of latestBullets) assert.ok([...bullet].length <= 80, `changelog bullet exceeds 80 characters: ${bullet}`)

const releaseStart = chunks.findIndex((chunk) => parseChangelogHeader(read(`public/${chunk.name}`), chunk.name).version === '5.0.0')
assert.ok(releaseStart >= 0, '5.0.0 release baseline chunk is missing')
for (let indexPosition = releaseStart + 1; indexPosition < chunks.length; indexPosition += 1) {
  const previous = parseChangelogHeader(read(`public/${chunks[indexPosition - 1].name}`), chunks[indexPosition - 1].name)
  const current = parseChangelogHeader(read(`public/${chunks[indexPosition].name}`), chunks[indexPosition].name)
  assert.equal(current.version, incrementReleaseVersion(previous.version), `${chunks[indexPosition].name}: version sequence drift`)
  assert.match(current.timestamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, `${chunks[indexPosition].name}: timestamp must include seconds`)
}

const helpModal = read('src/mods/mod-ui/components/organisms/HelpModal.tsx')
assert.ok(helpModal.includes('fetchLatestChangelogChunk'), 'HelpModal must request the indexed newest chunk')
const helpLoader = read('src/mods/mod-ui/components/organisms/help-resource-loader.ts')
assert.ok(helpLoader.includes("fetch('/changelog-index.json'"), 'help loader must load the changelog index authority')
assert.ok(helpLoader.includes('index.latestChunk'), 'help loader must use the indexed newest chunk')

console.log(`[game-changelog-regression] PASS version=${currentVersion} latestChunk=${latest.index} bullets=${latestBullets.length}`)
