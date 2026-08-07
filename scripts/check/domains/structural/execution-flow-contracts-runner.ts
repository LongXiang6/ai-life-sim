/**
 * Purpose: Regress execution-graph registries, outcomes, incidents, and diagnostics.
 * Owner: quality:structural
 * Responsibility: One execution-contract runner and its ordered fixture set only.
 */

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

interface RootCauseChain {
  directFailure: string
  precondition: string
  preconditionCause: string
  formationMechanism: string
  preventionGate: string
}

interface RootCauseEvidence {
  type: string
  source: string
  observation: string
}

interface RootCauseContract {
  rootCauseRequiredStatuses: ExecutionRecordStatus[]
  rootCauseChainFields: string[]
  rootCauseEvidenceTypes: string[]
  timeoutEvidenceRequirement?: {
    quantificationTypes: string[]
    reproductionTypes: string[]
  }
  prohibitedTimeoutPatchPatterns: string[]
}

interface ExecutionIncidentFixture {
  id: string
  status: ExecutionRecordStatus
  message: string
  expectedCategory: string
  rootCauseChain?: RootCauseChain
  rootCauseEvidence?: RootCauseEvidence[]
}

const root = process.cwd()
const review = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'check', 'rules', 'execution-system-review.json'),
  'utf8',
)) as {
  requiredFlowIds: string[]
  requiredIncidentCategories: string[]
} & RootCauseContract
const incidentFixtures = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'check', 'fixtures', 'execution-incidents.json'),
  'utf8',
)) as {
  incidents: ExecutionIncidentFixture[]
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
    { id: 'spatial-graph', mod: 'mod-world' } as ISubSystem,
    { id: 'character-base', mod: 'mod-character' } as ISubSystem,
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

function validateRootCauseFixture(
  fixture: ExecutionIncidentFixture,
  contract: RootCauseContract,
): string[] {
  if (!contract.rootCauseRequiredStatuses.includes(fixture.status)) return []
  const errors: string[] = []
  const chain = fixture.rootCauseChain
  if (!chain) {
    errors.push('missing rootCauseChain')
    return errors
  }
  const fields = contract.rootCauseChainFields
  if (JSON.stringify([...Object.keys(chain)].sort()) !== JSON.stringify([...fields].sort())) {
    errors.push('rootCauseChain fields must match the declared contract')
  }
  const values = fields.map((field) => chain[field as keyof RootCauseChain])
  if (values.some((value) => value === undefined || value.trim() === '')) {
    errors.push('rootCauseChain fields must be non-empty strings')
  }
  if (new Set(values).size !== fields.length) {
    errors.push('rootCauseChain fields must not collapse into the same cause')
  }
  if (fixture.status === 'timed-out') {
    for (const field of fields) {
      const value = chain[field as keyof RootCauseChain]
      const pattern = typeof value === 'string'
        ? contract.prohibitedTimeoutPatchPatterns.find((prohibited) => value.includes(prohibited))
        : undefined
      if (pattern) errors.push(`timeout patch-only phrase in ${field}: ${pattern}`)
    }
  }
  const evidence = fixture.rootCauseEvidence ?? []
  if (evidence.length === 0) errors.push('rootCauseEvidence must not be empty')
  for (const item of evidence) {
    if (!contract.rootCauseEvidenceTypes.includes(item.type)) {
      errors.push(`unsupported root cause evidence type: ${item.type}`)
    }
    if (
      typeof item.source !== 'string' || !item.source.trim()
      || typeof item.observation !== 'string' || !item.observation.trim()
    ) {
      errors.push('rootCauseEvidence source and observation must be non-empty')
    }
  }
  if (fixture.status === 'timed-out' && contract.timeoutEvidenceRequirement) {
    const { quantificationTypes, reproductionTypes } = contract.timeoutEvidenceRequirement
    const hasQuantification = evidence.some((item) => quantificationTypes.includes(item.type))
    const hasReproduction = evidence.some((item) => reproductionTypes.includes(item.type))
    if (!hasQuantification || !hasReproduction) {
      errors.push('timed-out rootCauseEvidence must include one quantification type and one reproduction type')
    }
  }
  return errors
}

function testRootCauseContract(): void {
  for (const fixture of incidentFixtures.incidents) {
    const errors = validateRootCauseFixture(fixture, review)
    assert.deepEqual(errors, [], fixture.id)
  }
  const timeoutPatchOnly: ExecutionIncidentFixture = {
    id: 'timeout-patch-only-negative',
    status: 'timed-out',
    message: '节点超过契约时限 5000ms',
    expectedCategory: 'timed-out',
    rootCauseChain: {
      directFailure: '等待时间不足',
      precondition: '等待时间不足',
      preconditionCause: '等待时间不足',
      formationMechanism: '等待时间不足',
      preventionGate: '提高超时阈值',
    },
    rootCauseEvidence: [
      {
        type: 'metric',
        source: 'execution record',
        observation: 'durationMs 3000ms',
      },
    ],
  }
  const errors = validateRootCauseFixture(timeoutPatchOnly, review)
  assert.ok(
    errors.some((error) => error.includes('timeout patch-only')),
    'timeout patch-only fixture must be rejected',
  )
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
testRootCauseContract()
await testExecutionDiagnostics()
console.log('[execution-flow-contracts] PASS')
