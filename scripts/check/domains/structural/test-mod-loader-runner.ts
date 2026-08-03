/**
 * Purpose: Regress MOD loader dependency, Remote API, and execution-sequence contracts.
 * Owner: quality:structural
 * Responsibility: One MOD-loader runner invoked by test-mod-loader.mjs only.
 */

import assert from 'node:assert/strict'

import type { ModManifest } from '@/foundation'

import { parseDependency, resolveDependenciesV2 } from '@/core/mod-loader/dependency-resolver'
import { loadMods } from '@/core/mod-loader/mod-loader'
import { selectRemoteApiExports } from '@/core/mod-loader/mod-lifecycle'
import { validateRemoteContracts } from '@/core/mod-loader/validate-remote-contracts'
import { remote } from '@/core/remote-interface/remote-interface'
import {
  createExecutionOutcomeCodes,
  runExecutionSequence,
} from '@/foundation'
import type { ExecutionFlowRegistration, ExecutionSequenceNode } from '@/foundation'

const EXECUTION_CONTRACT_FLOW: ExecutionFlowRegistration = {
  flowId: 'execution-contract',
  owner: 'test-runner',
  failureTarget: 'test-runner',
  department: 'test-department',
  subsystem: 'test-subsystem',
}

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
      order: 100,
      version: '1.0.0',
      description: 'world',
      dependencies: [],
      provides: ['world'],
      consumes: [],
    },
    {
      name: 'mod-economy',
      order: 200,
      version: '1.0.0',
      description: 'economy',
      dependencies: ['mod-world', '~mod-politics'],
      provides: ['economy'],
      consumes: ['politics'],
    },
    {
      name: 'mod-politics',
      order: 300,
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

function testExplicitRemoteApiAllowlist() {
  const api = {
    declared: () => 'declared',
    inferredOnly: () => 'inferred',
  }

  assert.deepEqual(Object.keys(selectRemoteApiExports(api, undefined)).sort(), ['declared', 'inferredOnly'])
  assert.deepEqual(Object.keys(selectRemoteApiExports(api, [])), [])
  assert.deepEqual(Object.keys(selectRemoteApiExports(api, ['declared'])), ['declared'])

  const manifest: ModManifest = {
    name: 'mod-remote-regression',
    order: 100,
    version: '1.0.0',
    description: 'remote regression fixture',
    dependencies: [],
    provides: [],
    consumes: [],
    remoteApi: [],
  }

  remote.autoRegister(manifest.name, api)
  assert.deepEqual(validateRemoteContracts([manifest]), [
    { mod: manifest.name, kind: 'extra', functionName: 'declared' },
    { mod: manifest.name, kind: 'extra', functionName: 'inferredOnly' },
  ])

  remote.autoRegister(manifest.name, {})
  assert.equal(remote.has(manifest.name), false)
  assert.deepEqual(validateRemoteContracts([manifest]), [])
}

function executionNode(
  id: string,
  phase: ExecutionSequenceNode['phase'],
  order: number,
  dependsOn: string[],
  run: ExecutionSequenceNode['run'],
): ExecutionSequenceNode {
  return {
    id,
    owner: 'test-runner',
    failureTarget: 'test-runner',
    phase,
    dependsOn,
    order,
    outcomes: createExecutionOutcomeCodes(EXECUTION_CONTRACT_FLOW.flowId, id),
    run,
  }
}

async function testExecutionSequenceContract() {
  const ordered = await runExecutionSequence({
    flow: EXECUTION_CONTRACT_FLOW,
    executionId: 'execution-contract:ordered',
    context: {},
      nodes: [
        executionNode('prepare', 'prepare', 0, [], () => ({ status: 'succeeded' })),
        executionNode('ready', 'ready', 0, ['prepare'], () => ({ status: 'succeeded' })),
        executionNode('second', 'execute', 20, ['ready'], () => ({ status: 'succeeded' })),
        executionNode('first', 'execute', 10, ['ready'], () => ({ status: 'succeeded' })),
      executionNode('transition', 'transition', 0, ['first', 'second'], () => ({ status: 'succeeded' })),
      executionNode('finalize', 'finalize', 0, ['transition'], () => ({ status: 'succeeded' })),
    ],
  })
  assert.equal(ordered.status, 'succeeded')
  assert.deepEqual(ordered.order, ['prepare', 'ready', 'first', 'second', 'transition', 'finalize'])

  let activeParallelNodes = 0
  let maxParallelNodes = 0
  const parallel = await runExecutionSequence({
    flow: EXECUTION_CONTRACT_FLOW,
    executionId: 'execution-contract:parallel',
    context: {},
      nodes: [
        executionNode('prepare', 'prepare', 0, [], () => ({ status: 'succeeded' })),
        executionNode('ready', 'ready', 0, ['prepare'], () => ({ status: 'succeeded' })),
        {
          ...executionNode('parallel-left', 'execute', 10, ['ready'], async () => {
          activeParallelNodes += 1
          maxParallelNodes = Math.max(maxParallelNodes, activeParallelNodes)
          await new Promise((resolve) => setTimeout(resolve, 25))
          activeParallelNodes -= 1
          return { status: 'succeeded' as const }
        }),
        parallelGroup: 'parallel-pair',
      },
      {
          ...executionNode('parallel-right', 'execute', 10, ['ready'], async () => {
          activeParallelNodes += 1
          maxParallelNodes = Math.max(maxParallelNodes, activeParallelNodes)
          await new Promise((resolve) => setTimeout(resolve, 5))
          activeParallelNodes -= 1
          return { status: 'succeeded' as const }
        }),
        parallelGroup: 'parallel-pair',
      },
      executionNode(
        'transition',
        'transition',
        0,
        ['parallel-left', 'parallel-right'],
        () => ({ status: 'succeeded' }),
      ),
      executionNode('finalize', 'finalize', 0, ['transition'], () => ({ status: 'succeeded' })),
    ],
  })
  assert.equal(parallel.status, 'succeeded')
  assert.equal(maxParallelNodes, 2)
  assert.deepEqual(parallel.order, ['prepare', 'ready', 'parallel-left', 'parallel-right', 'transition', 'finalize'])
  assert.deepEqual(
    parallel.records.map((record) => record.nodeId),
    ['prepare', 'ready', 'parallel-left', 'parallel-right', 'transition', 'finalize'],
  )

  const parallelFailure = await runExecutionSequence({
    flow: EXECUTION_CONTRACT_FLOW,
    executionId: 'execution-contract:parallel-failure',
    context: {},
      nodes: [
        executionNode('prepare', 'prepare', 0, [], () => ({ status: 'succeeded' })),
        executionNode('ready', 'ready', 0, ['prepare'], () => ({ status: 'succeeded' })),
        {
          ...executionNode('parallel-failed', 'execute', 10, ['ready'], async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          return { status: 'failed' as const, message: 'expected parallel failure' }
        }),
        parallelGroup: 'parallel-failure-pair',
      },
      {
        ...executionNode('parallel-succeeded', 'execute', 10, ['ready'], async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))
          return { status: 'succeeded' as const }
        }),
        parallelGroup: 'parallel-failure-pair',
      },
      executionNode(
        'transition',
        'transition',
        0,
        ['parallel-failed', 'parallel-succeeded'],
        () => ({ status: 'succeeded' }),
      ),
      executionNode(
        'finalize',
        'finalize',
        0,
        ['transition'],
        () => ({ status: 'succeeded' }),
      ),
    ],
  })
  assert.equal(parallelFailure.status, 'failed')
  assert.equal(parallelFailure.failure?.nodeId, 'parallel-failed')
  assert.deepEqual(
    parallelFailure.records.map((record) => [record.nodeId, record.status]),
    [
      ['prepare', 'succeeded'],
      ['ready', 'succeeded'],
      ['parallel-failed', 'failed'],
      ['parallel-succeeded', 'succeeded'],
    ],
  )

  const missing = await runExecutionSequence({
    flow: EXECUTION_CONTRACT_FLOW,
    executionId: 'execution-contract:missing',
    context: {},
      nodes: [
        executionNode('prepare', 'prepare', 0, [], () => ({ status: 'succeeded' })),
        executionNode('ready', 'ready', 0, ['prepare'], () => ({ status: 'succeeded' })),
        executionNode('execute', 'execute', 0, ['ready'], () => undefined),
        executionNode('transition', 'transition', 0, ['execute'], () => ({ status: 'succeeded' })),
        executionNode('finalize', 'finalize', 0, ['transition'], () => ({ status: 'succeeded' })),
    ],
  })
  assert.equal(missing.status, 'failed')
  assert.equal(missing.failure?.status, 'missing-status')
  assert.equal(missing.failure?.failureTarget, 'test-runner')

  const invalid = await runExecutionSequence({
    flow: EXECUTION_CONTRACT_FLOW,
    executionId: 'execution-contract:invalid',
    context: {},
      nodes: [
        executionNode('prepare', 'prepare', 0, [], () => ({ status: 'succeeded' })),
        executionNode('ready', 'ready', 0, ['prepare'], () => ({ status: 'succeeded' })),
        executionNode('execute', 'execute', 0, ['ready'], (ctx, runtime) => ({
        status: 'succeeded',
        code: `${runtime.flowId}:execute:wrong`,
          value: ctx,
        })),
        executionNode('transition', 'transition', 0, ['execute'], () => ({ status: 'succeeded' })),
        executionNode('finalize', 'finalize', 0, ['transition'], () => ({ status: 'succeeded' })),
    ],
  })
  assert.equal(invalid.status, 'failed')
  assert.equal(invalid.failure?.status, 'invalid-status')

  const timedOut = await runExecutionSequence({
    flow: EXECUTION_CONTRACT_FLOW,
    executionId: 'execution-contract:timeout',
    context: {},
      nodes: [
        executionNode('prepare', 'prepare', 0, [], () => ({ status: 'succeeded' })),
        executionNode('ready', 'ready', 0, ['prepare'], () => ({ status: 'succeeded' })),
        {
        ...executionNode('execute', 'execute', 0, ['ready'], async () => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          return { status: 'succeeded' as const }
        }),
        timeoutMs: 5,
      },
      executionNode('transition', 'transition', 0, ['execute'], () => ({ status: 'succeeded' })),
      executionNode('finalize', 'finalize', 0, ['transition'], () => ({ status: 'succeeded' })),
    ],
  })
  assert.equal(timedOut.status, 'failed')
  assert.equal(timedOut.failure?.status, 'timed-out')

  await assert.rejects(
    () => runExecutionSequence({
      flow: EXECUTION_CONTRACT_FLOW,
      executionId: 'execution-contract:phase-bypass',
      context: {},
      nodes: [
        executionNode('prepare', 'prepare', 0, [], () => ({ status: 'succeeded' })),
        executionNode('ready', 'ready', 0, ['prepare'], () => ({ status: 'succeeded' })),
        executionNode('execute', 'execute', 0, ['prepare'], () => ({ status: 'succeeded' })),
        executionNode('transition', 'transition', 0, ['execute'], () => ({ status: 'succeeded' })),
        executionNode('finalize', 'finalize', 0, ['transition'], () => ({ status: 'succeeded' })),
      ],
    }),
    /execute 节点 "execute" 必须由 ready 阶段释放/,
  )
}

async function main() {
  testParseDependency()
  testMutualSoftDependencies()
  testExplicitRemoteApiAllowlist()
  await testExecutionSequenceContract()
  console.log('[OK] mod-loader regression tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
