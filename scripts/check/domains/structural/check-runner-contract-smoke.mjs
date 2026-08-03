#!/usr/bin/env node
/**
 * @module check-runner-contract-smoke.mjs
 * @description 本地检查编排的反馈码、依赖、确定性汇合与变更筛选回归
 */

import {
  classifyStepProcessResult,
  executeCheckGraph,
  inspectUpstreamStatuses,
  validateCheckSteps,
} from '../../lib/runner.mjs'
import { resolveCheckSelectionFromFiles } from '../../lib/resolve-changed.mjs'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

function step(id, order, dependsOn = []) {
  return {
    id,
    order,
    phase: 'execute',
    dependsOn,
    parallel: true,
    optional: false,
    timeoutMs: 1_000,
  }
}

function resultFor(checkStep, statusCode = 'succeeded') {
  return {
    executionId: 'runner-contract',
    nodeId: `runner-contract:${checkStep.id}`,
    phase: checkStep.phase,
    order: checkStep.order,
    statusCode,
    resultCode: statusCode === 'succeeded' ? 'checks-passed' : 'fixture-failed',
    durationMs: 1,
    evidence: {},
    stdout: '',
    stderr: '',
  }
}

assertOk(
  classifyStepProcessResult({ status: 0 }).statusCode === 'succeeded'
    && classifyStepProcessResult({ status: 2 }).statusCode === 'failed'
    && classifyStepProcessResult({ status: null }).statusCode === 'missing-status'
    && classifyStepProcessResult({ status: '0' }).statusCode === 'invalid-status'
    && classifyStepProcessResult({ status: null, signal: 'SIGTERM' }).statusCode === 'cancelled'
    && classifyStepProcessResult({ status: null, timedOut: true }).statusCode === 'timed-out',
  'process results must map to stable terminal status codes',
)
assertOk(
  inspectUpstreamStatuses().statusCode === 'skipped'
    && inspectUpstreamStatuses('{').statusCode === 'invalid-status'
    && inspectUpstreamStatuses('{"lint":"succeeded"}').statusCode === 'missing-status'
    && inspectUpstreamStatuses('{"lint":"ready","typescript":"succeeded"}').statusCode === 'failed'
    && inspectUpstreamStatuses('{"lint":"succeeded","typescript":"succeeded"}').statusCode === 'succeeded',
  'downstream checks must consume explicit lint and TypeScript terminal feedback',
)

const invalidGraph = validateCheckSteps([
  step('duplicate', 10, ['missing']),
  step('duplicate', 20),
])
assertOk(
  !invalidGraph.valid
    && invalidGraph.errors.some((error) => error.includes('duplicate step id'))
    && invalidGraph.errors.some((error) => error.includes('missing dependency')),
  'prepare must reject duplicate IDs and missing dependencies',
)

const cyclicGraph = validateCheckSteps([
  step('cycle-a', 10, ['cycle-b']),
  step('cycle-b', 20, ['cycle-a']),
])
assertOk(
  !cyclicGraph.valid && cyclicGraph.errors.some((error) => error.includes('cyclic dependency')),
  'prepare must reject cyclic dependencies',
)

const events = []
const deterministicResults = await executeCheckGraph([
  step('parallel-b', 20),
  step('parallel-a', 10),
  step('dependent', 30, ['parallel-a']),
], async (checkStep) => {
  events.push(`start:${checkStep.id}`)
  await new Promise((resolve) => setTimeout(resolve, checkStep.id === 'parallel-a' ? 10 : 1))
  events.push(`finish:${checkStep.id}`)
  return resultFor(checkStep)
})
assertOk(
  deterministicResults.map((result) => result.nodeId).join(',')
    === 'runner-contract:parallel-a,runner-contract:parallel-b,runner-contract:dependent'
    && events.indexOf('start:dependent') > events.indexOf('finish:parallel-a'),
  'parallel steps must start together while deterministic result order and dependencies remain intact',
)

const blockedResults = await executeCheckGraph([
  step('failed-source', 10),
  step('blocked-target', 20, ['failed-source']),
], async (checkStep) => resultFor(checkStep, 'failed'))
assertOk(
  blockedResults[0].statusCode === 'failed'
    && blockedResults[1].statusCode === 'blocked'
    && blockedResults[1].resultCode === 'dependency-not-succeeded',
  'failed dependencies must block downstream steps with an explicit result code',
)

const changedSelection = resolveCheckSelectionFromFiles([
  'src/core/ai-service/prompt-builder.ts',
])
assertOk(
  changedSelection.domainIds.includes('standardization')
    && changedSelection.domainIds.includes('wiring')
    && changedSelection.domainIds.includes('loader')
    && changedSelection.domainIds.includes('narrative')
    && changedSelection.stepIdsByDomain.narrative.includes('kv-prompt-audit')
    && changedSelection.stepIdsByDomain.narrative.length < 27,
  'changed mode must combine critical checks with directly affected prompt steps instead of the full domain',
)

if (failed > 0) process.exit(1)
console.log('PASS: check-runner-contract-smoke')
