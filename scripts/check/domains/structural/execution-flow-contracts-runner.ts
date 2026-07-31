import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  createExecutionOutcomeCodes,
  EXECUTION_PHASES,
  runExecutionSequence,
  validateExecutionFlowContract,
} from '@/foundation'
import type {
  AIModelConfig,
  ExecutionFlowRegistration,
  ExecutionRecordStatus,
  ExecutionSequenceNode,
  ISubSystem,
  ModContext,
  ModManifest,
  PromptTemplate,
  RoundContext,
} from '@/foundation'
import {
  EXECUTION_FLOWS,
  listExecutionFlowRegistrations,
} from '@/core/execution'
import {
  classifyDevelopmentIncident,
  clearDevelopmentSystemEventsForTests,
  drainDevelopmentSystemEvents,
  recordExecutionSequenceResult,
} from '@/core/logger/development-system-diagnostic'
import {
  createModLifecycleExecutionNodes,
} from '@/core/mod-loader/mod-lifecycle'
import { loadStages } from '@/mods/mod-engine/campaigns/default/index'
import { DEFAULT_CAMPAIGN_STAGE_NAMES } from '@/mods/mod-engine/campaigns/default/stages.generated'
import {
  createSubsystemAdvanceExecutionNodes,
} from '@/mods/mod-engine/helpers/subsystem-execution-flow'
import {
  createDefaultWorldInitSteps,
} from '@/mods/mod-world/utils/world-init-pipeline'
import type {
  WorldInitPipelineContext,
} from '@/mods/mod-world/utils/world-init-pipeline'

const root = process.cwd()
const review = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'check', 'rules', 'execution-system-review.json'),
  'utf8',
)) as {
  requiredFlowIds: string[]
  requiredIncidentCategories: string[]
}
const incidentFixtures = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'check', 'fixtures', 'execution-incidents.json'),
  'utf8',
)) as {
  incidents: Array<{
    id: string
    status: ExecutionRecordStatus
    message: string
    expectedCategory: string
  }>
}

function validateGraph<TContext>(
  label: string,
  flow: ExecutionFlowRegistration,
  nodes: readonly ExecutionSequenceNode<TContext>[],
): void {
  const ordered = validateExecutionFlowContract(flow, nodes)
  assert.equal(ordered.length, nodes.length, `${label}: all nodes must be ordered`)
  assert.deepEqual(
    [...new Set(ordered.map((node) => node.phase))],
    [...EXECUTION_PHASES],
    `${label}: phases must be complete and ordered`,
  )
  const dependents = new Set(ordered.flatMap((node) => node.dependsOn))
  assert.equal(ordered.filter((node) => !dependents.has(node.id)).length, 1, `${label}: terminal node`)
}

function simpleNode(
  flow: ExecutionFlowRegistration,
  id: string,
  phase: ExecutionSequenceNode['phase'],
  dependsOn: string[],
  order = 0,
): ExecutionSequenceNode {
  return {
    id,
    owner: flow.owner,
    failureTarget: flow.failureTarget,
    phase,
    dependsOn,
    order,
    outcomes: createExecutionOutcomeCodes(flow.flowId, id),
    run: () => ({ status: 'succeeded' }),
  }
}

function testRegistry(): void {
  const registrations = listExecutionFlowRegistrations()
  const flowIds = registrations.map((flow) => flow.flowId)
  assert.equal(new Set(flowIds).size, flowIds.length, 'execution flow ids must be unique')
  assert.deepEqual([...flowIds].sort(), [...review.requiredFlowIds].sort())
}

function testNarrativeRound(): void {
  const flow = EXECUTION_FLOWS.narrativeRound
  const stages = loadStages(
    { model: 'execution-contract' } as AIModelConfig,
    { version: 'execution-contract' } as PromptTemplate,
  )
  assert.deepEqual(stages.map((stage) => stage.name), [...DEFAULT_CAMPAIGN_STAGE_NAMES])
  validateGraph('narrative-round', flow, stages.map((stage): ExecutionSequenceNode<RoundContext> => ({
    id: stage.name,
    owner: stage.owner,
    failureTarget: stage.failureTarget,
    phase: stage.phase,
    dependsOn: stage.dependsOn,
    order: stage.order,
    parallelGroup: stage.parallelGroup,
    outcomes: createExecutionOutcomeCodes(flow.flowId, stage.name),
    run: () => ({ status: 'succeeded' }),
  })))
}

function testModLifecycle(): void {
  const manifests: ModManifest[] = [
    {
      name: 'mod-world',
      order: 100,
      version: '1.0.0',
      description: 'contract world',
      dependencies: [],
      provides: ['world'],
      consumes: [],
    },
    {
      name: 'mod-engine',
      order: 200,
      version: '1.0.0',
      description: 'contract engine',
      dependencies: ['mod-world'],
      provides: ['engine'],
      consumes: ['world'],
    },
  ]
  for (const flow of [
    EXECUTION_FLOWS.modInitialization,
    EXECUTION_FLOWS.modStateLoad,
    EXECUTION_FLOWS.modConfigurationChange,
  ]) {
    const nodes = createModLifecycleExecutionNodes({
      flow,
      hook: flow === EXECUTION_FLOWS.modInitialization
        ? 'onInit'
        : flow === EXECUTION_FLOWS.modStateLoad
          ? 'onLoad'
          : 'onConfigurationChanged',
      context: {} as ModContext,
      configurationData: { reason: 'setting_changed' },
    }, manifests)
    validateGraph(flow.flowId, flow, nodes)
  }
}

function testWorldInitialization(): void {
  const flow = EXECUTION_FLOWS.worldInit
  const nodes = createDefaultWorldInitSteps().map((step): ExecutionSequenceNode<WorldInitPipelineContext> => ({
    ...step,
    outcomes: createExecutionOutcomeCodes(flow.flowId, step.id),
  }))
  validateGraph('world-init', flow, nodes)
}

function testSubsystemAdvance(): void {
  const flow = EXECUTION_FLOWS.subsystemAdvance
  const subsystems = [
    { id: 'world-entity', mod: 'mod-world' } as ISubSystem,
    { id: 'npc-system', mod: 'mod-npc' } as ISubSystem,
  ]
  const nodes = createSubsystemAdvanceExecutionNodes(flow, subsystems, () => undefined)
  validateGraph('subsystem-advance', flow, nodes)
  assert.ok(nodes.some((node) => node.phase === 'transition'))
}

function testNegativeContracts(): void {
  const flow: ExecutionFlowRegistration = {
    flowId: 'negative-contract',
    owner: 'test-runner',
    failureTarget: 'test-runner',
    department: 'test-department',
    subsystem: 'test-subsystem',
  }
  const nodes = [
    simpleNode(flow, 'prepare', 'prepare', []),
    simpleNode(flow, 'ready', 'ready', ['prepare']),
    simpleNode(flow, 'execute', 'execute', ['ready']),
    simpleNode(flow, 'transition', 'transition', ['execute']),
    simpleNode(flow, 'finalize', 'finalize', ['transition']),
  ]
  assert.throws(() => validateExecutionFlowContract(flow, [
    ...nodes.slice(0, 4),
    {
      ...nodes[4],
      outcomes: { ...nodes[4].outcomes, failed: 'negative-contract:finalize:wrong' },
    },
  ]), /状态码必须登记/u)
  assert.throws(() => validateExecutionFlowContract(flow, [
    ...nodes.slice(0, 2),
    { ...nodes[2], failureTarget: 'wrong-owner' },
    ...nodes.slice(3),
  ]), /故障接收者必须为流程登记值/u)
  assert.throws(() => validateExecutionFlowContract(flow, [
    ...nodes,
    simpleNode(flow, 'second-finalize', 'finalize', ['transition'], 1),
  ]), /唯一终态节点/u)
  assert.throws(() => validateExecutionFlowContract(flow, [
    nodes[0],
    nodes[1],
    { ...nodes[2], dependsOn: ['prepare'] },
    nodes[3],
    nodes[4],
  ]), /必须由 ready 阶段释放/u)
}

function testIncidentFixtures(): void {
  const categories = new Set<string>()
  for (const fixture of incidentFixtures.incidents) {
    const actual = classifyDevelopmentIncident({
      status: fixture.status,
      message: fixture.message,
    })
    assert.equal(actual, fixture.expectedCategory, fixture.id)
    categories.add(fixture.expectedCategory)
  }
  assert.deepEqual([...categories].sort(), [...review.requiredIncidentCategories].sort())
}

async function testExecutionDiagnostics(): Promise<void> {
  const flow: ExecutionFlowRegistration = {
    flowId: 'diagnostic-contract',
    owner: 'test-runner',
    failureTarget: 'test-runner',
    department: 'test-department',
    subsystem: 'test-subsystem',
  }
  const previousNodeEnv = process.env.NODE_ENV
  const mutableEnv = process.env as unknown as Record<string, string | undefined>
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  mutableEnv.NODE_ENV = 'development'
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  try {
    clearDevelopmentSystemEventsForTests()
    const result = await runExecutionSequence({
      flow,
      executionId: 'diagnostic-contract:1',
      context: {},
      nodes: [
        simpleNode(flow, 'prepare', 'prepare', []),
        simpleNode(flow, 'ready', 'ready', ['prepare']),
        simpleNode(flow, 'execute', 'execute', ['ready']),
        simpleNode(flow, 'transition', 'transition', ['execute']),
        simpleNode(flow, 'finalize', 'finalize', ['transition']),
      ],
    })
    recordExecutionSequenceResult(result)
    const events = drainDevelopmentSystemEvents('life-contract', 1)
    assert.equal(events.length, result.events.length)
    assert.equal(events[0].execution?.department, flow.department)
    assert.equal(events[0].execution?.subsystem, flow.subsystem)
    assert.equal(events.at(-1)?.execution?.terminal, true)
  } finally {
    clearDevelopmentSystemEventsForTests()
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV
    else mutableEnv.NODE_ENV = previousNodeEnv
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true })
  }
}

testRegistry()
testNarrativeRound()
testModLifecycle()
testWorldInitialization()
testSubsystemAdvance()
testNegativeContracts()
testIncidentFixtures()
await testExecutionDiagnostics()
console.log('[execution-flow-contracts] PASS')
