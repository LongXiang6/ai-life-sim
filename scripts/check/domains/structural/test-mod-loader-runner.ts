/**
 * @module test-mod-loader-runner.ts
 * @description MOD 加载器回归测试（由 test-mod-loader.mjs 调用）
 */

import assert from 'node:assert/strict'

import type { ModManifest } from '@/foundation'

import { parseDependency, resolveDependenciesV2 } from '@/core/mod-loader/dependency-resolver'
import { loadMods } from '@/core/mod-loader/mod-loader'

function testParseDependency() {
  const softCompact = parseDependency('~mod-politics')
  assert.equal(softCompact.name, 'mod-politics')
  assert.equal(softCompact.type, 'soft')
  assert.equal(softCompact.affectsLoadOrder, false)

  const softSpaced = parseDependency('~ mod-politics')
  assert.equal(softSpaced.name, 'mod-politics')
  assert.equal(softSpaced.type, 'soft')

  const hard = parseDependency('mod-world')
  assert.equal(hard.name, 'mod-world')
  assert.equal(hard.type, 'required')
  assert.equal(hard.affectsLoadOrder, true)
}

function testMutualSoftDependencies() {
  const manifests: ModManifest[] = [
    {
      name: 'mod-world',
      version: '1.0.0',
      description: 'world',
      dependencies: [],
      provides: ['world'],
      consumes: [],
    },
    {
      name: 'mod-economy',
      version: '1.0.0',
      description: 'economy',
      dependencies: ['mod-world', '~mod-politics'],
      provides: ['economy'],
      consumes: ['politics'],
    },
    {
      name: 'mod-politics',
      version: '1.0.0',
      description: 'politics',
      dependencies: ['mod-world', '~mod-economy'],
      provides: ['politics'],
      consumes: ['economy'],
    },
  ]

  const { order, cycles } = resolveDependenciesV2(manifests)
  assert.equal(cycles.length, 0)
  assert.ok(order.includes('mod-economy'))
  assert.ok(order.includes('mod-politics'))
  assert.ok(order.indexOf('mod-economy') < order.indexOf('mod-politics'))

  const result = loadMods(manifests)
  assert.equal(result.cycles.length, 0)
  assert.equal(result.errors.length, 0)
  assert.ok(result.loaded.includes('mod-economy'))
  assert.ok(result.loaded.includes('mod-politics'))
}

function main() {
  testParseDependency()
  testMutualSoftDependencies()
  console.log('[OK] mod-loader regression tests passed')
}

main()
