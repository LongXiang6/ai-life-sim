/**
 * Purpose: Verify immediate narrative publication and next-round pre-generation wiring.
 * Owner: quality:narrative
 * Responsibility: Runtime snapshot removal, immediate publication, and post-call wiring only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { BaseSubsystem } from '../../../../src/core/subsystem-base.ts'
import { useSettingsStore } from '../../../../src/mods/mod-settings/store.ts'
import { prepareMainNarrativeRequest } from '../../../../src/mods/mod-engine/helpers/main-narrative-call.ts'
import {
  getNarrativePreGenerationStatus,
  invalidateNarrativePreGeneration,
  startNarrativePreGeneration,
  takeNarrativePreGeneration,
} from '../../../../src/mods/mod-engine/helpers/narrative-pre-generation.ts'
import { prepareNarrativeRoundPromptContext } from '../../../../src/mods/mod-engine/helpers/narrative-round-prompt-preparation.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { OrchestratorSystem } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'

const root = getProjectRoot(import.meta.url)
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8')

const [hooks, orchestrator, acceptance, campaign, mainCall, preGeneration, saveRestore, requestBody, proxyRoute] = await Promise.all([
  read('src/mods/mod-engine/hooks.ts'),
  read('src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  read('src/mods/mod-engine/subsystems/orchestrator-system/narrative-acceptance-runtime.ts'),
  read('src/mods/mod-engine/campaigns/default/index.ts'),
  read('src/mods/mod-engine/helpers/main-narrative-call.ts'),
  read('src/mods/mod-engine/helpers/narrative-pre-generation.ts'),
  read('src/mods/mod-engine/helpers/save-restore.ts'),
  read('src/core/ai-service/ai-client/request-body.ts'),
  read('src/app/api/proxy/route.ts'),
])

let failed = 0
function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

const runtimeSources = { hooks, orchestrator, campaign }
const forbiddenRuntimeTerms = [
  'capturePreviewSnapshot',
  'restorePreviewSnapshot',
  'reconcilePreviewSnapshotWithEngineStore',
  'runPreviewRound',
  'isPreviewExecution',
  'previewExecutionDepth',
  'previewAbortSignal',
  'previewCompletion',
  'capturePreviewState',
  'restorePreviewState',
  'roundSnapshot',
  'rollbackError',
]

for (const [name, source] of Object.entries(runtimeSources)) {
  for (const term of forbiddenRuntimeTerms) {
    assertOk(!source.includes(term), `${name} must not retain runtime snapshot or rollback term ${term}`)
  }
}

assertOk(
  orchestrator.includes('exportPersistenceState(')
    && orchestrator.includes('importPersistenceState(')
    && saveRestore.includes('collectGameSavePayload()'),
  'save/load must keep the explicit persistence contract without exposing runtime rollback entry points',
)
assertOk(
  preGeneration.includes('createNarrativeProjection()')
    && preGeneration.includes("executeMainNarrativeRequest(request, 'preview'")
    && preGeneration.includes('candidate.fingerprint !== request.fingerprint')
    && campaign.includes('takeNarrativePreGeneration(request)')
    && campaign.includes('startNarrativePreGeneration({')
    && !preGeneration.includes('executeRoundV2(')
    && !preGeneration.includes('ai-story-continuity')
    && !preGeneration.includes('ai-talent-growth'),
  'next-round pre-generation must use an isolated one-story projection and exact-fingerprint consumption',
)
assertOk(
  hooks.includes('await orchestrator.executeRoundV2(')
    && !hooks.includes('capturePreviewSnapshot')
    && !hooks.includes('restorePreviewSnapshot'),
  'real rounds must execute directly and never restore a previous round after failure',
)
assertOk(
  !campaign.includes('isPreviewExecution')
    && !campaign.includes('runPreviewRound')
    && /buildFrozenSpecialistInputs\(ctx\)[\s\S]{0,200}orchestrator\.commitNarrativeResponse\(prepared\.narrativeId\)/u.test(campaign)
    && !campaign.includes('takePreGeneratedNarrative(request)'),
  'the campaign must freeze specialist inputs and publish the accepted main story before specialist execution',
)
assertOk(
  /orchestrator\.updateNarrativeTransitionAudit[\s\S]{0,220}orchestrator\.finalizeNarrativeResponse/u.test(campaign)
    && !/name: 'commit-round'[\s\S]*ctx\._committedRoundResult = orchestrator\.commitNarrativeResponse/u.test(campaign),
  'the specialist commit stage must settle the audit and release bookkeeping without publishing the story again',
)
assertOk(
  acceptance.includes('正文已发布，故事连续性与天赋成长正在并行收束')
    && acceptance.includes('a published story remains visible on post-story failure'),
  'post-story failure must preserve an already published narrative and mark its audit',
)
assertOk(
  !requestBody.includes('maxTokens')
    && !requestBody.includes('max_tokens')
    && !proxyRoute.includes('max_tokens')
    && !proxyRoute.includes('budget_tokens'),
  'AI request assembly and proxy forwarding must not carry output or reasoning token budgets',
)

class ProjectionCharacter extends BaseSubsystem {
  id = 'character-base'
  mod = 'mod-character'
  label = '投影角色'
  description = '验证预生成只推进复制状态'
  value = 0
  advance() { this.value += 1 }
  collectState() {
    return {
      id: this.id,
      summary: `value=${this.value}`,
      data: {
        value: this.value,
        base: { physique: 1, mind: 1, talentAptitude: 1, charisma: 1 },
        current: { physique: 1, mind: 1, talentAptitude: 1, charisma: 1 },
        modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
        startingAge: 18,
        status: { fortune: { value: 0 } },
      },
    }
  }
  applyChanges() {}
  reset() { this.value = 0 }
  capturePersistenceState() { return { value: this.value } }
  restorePersistenceState(state) { this.value = Number(state?.value ?? 0) }
}

class ReadOnlyProjectionView extends BaseSubsystem {
  id = 'world-context-registry'
  mod = 'mod-world'
  label = '只读世界投影'
  description = '默认 advance 的活动子系统无需私有持久化接口'
  collectState() { return { id: this.id, summary: 'fixture-world', data: { currentContextId: 'fixture-world' } } }
  applyChanges() { throw new Error('read-only projection must not receive writes') }
  reset() {}
}

const preGenerationAiConfig = {
  model: 'fixture-model', temperature: 0.4, stream: false, reasoningEffort: 'disabled',
}

async function createPreGenerationFixture(preGenerateRounds = 1) {
  invalidateNarrativePreGeneration()
  useSettingsStore.setState({
    provider: 'custom', customKey: 'fixture-key', customUrl: 'https://example.invalid/v1',
    customModel: preGenerationAiConfig.model, temperature: preGenerationAiConfig.temperature,
    reasoningEffort: preGenerationAiConfig.reasoningEffort, storySeed: '', narrativeStyleText: '',
    narrativeStyleVersion: 0, narrativeAddressing: 'second-person', wordCountTarget: 800,
    preGenerateRounds,
  })
  const fixtureOwner = new OrchestratorSystem()
  const character = new ProjectionCharacter()
  fixtureOwner.registerSubsystem(character)
  fixtureOwner.registerSubsystem(new ReadOnlyProjectionView())
  fixtureOwner.setContext({
    contextId: 'world:pre-generation-fixture', contextKind: 'world', simulationScope: 'active',
    capabilityProfile: {
      contextId: 'world:pre-generation-fixture', capabilities: ['life'],
      enabledSubsystemIds: ['character-base', 'world-context-registry'], derivedFrom: 'explicit',
    },
    name: '预生成回归世界', description: '验证下一轮正文预生成。', era: '测试纪元',
    config: {
      difficulty: 'normal', essenceTag: 'modern', powerSystemTag: 'none', eraStartYear: 1,
      powerFramework: {
        id: 'fixture:power', label: '无超常力量体系', enabled: false,
        progression: 'bounded', ranks: [], source: 'world-default',
      },
    },
  }, {
    characterId: 'character:pre-generation-fixture', name: '预生成测试者', age: 18,
    gender: 'unknown', background: '验证缓存身份和失效边界。', attributes: {},
  })
  await fixtureOwner.collectAllSubsystemStates(false)
  return { owner: fixtureOwner, character }
}

function startFixturePreGeneration(owner) {
  startNarrativePreGeneration({
    owner, promptTemplate: narrativePrompt, aiConfig: preGenerationAiConfig,
    sessionId: 'pre-generation-regression',
  })
}

async function waitForPreGeneration(expected) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = getNarrativePreGenerationStatus()
    if (status.state === expected) return status
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.fail(`pre-generation did not reach ${expected}`)
}

async function prepareNextNarrativeRequest(owner) {
  owner.advanceTime()
  await owner.advanceAllSubsystems()
  await owner.collectAllSubsystemStates(false)
  const preparedContext = prepareNarrativeRoundPromptContext(owner)
  return prepareMainNarrativeRequest({
    owner, promptTemplate: narrativePrompt, promptContext: preparedContext.promptContext,
    aiConfig: preGenerationAiConfig, sessionId: 'pre-generation-regression',
  })
}

async function assertPreGenerationInvalidated(label, mutate) {
  const fixture = await createPreGenerationFixture()
  startFixturePreGeneration(fixture.owner)
  await waitForPreGeneration('ready')
  await mutate(fixture.owner)
  assert.equal(getNarrativePreGenerationStatus().state, 'idle', `${label} must invalidate preview`)
}

const originalFetch = globalThis.fetch
const proxyRequests = []
let previewSequence = 0
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), '/api/proxy')
  proxyRequests.push(JSON.parse(String(init?.body ?? '{}')))
  previewSequence += 1
  const argumentsText = JSON.stringify({
    正文: `这是第${previewSequence}段预生成测试正文。雨声停歇后，测试者继续前行。`,
    分支: 'null', 结局: 'null',
  })
  return new Response(JSON.stringify({ choices: [{
    message: { content: null, tool_calls: [{
      id: `fixture-${previewSequence}`, type: 'function',
      function: { name: 'submit_story_turn', arguments: argumentsText },
    }] }, finish_reason: 'tool_calls',
  }] }), { status: 200, headers: { 'content-type': 'application/json' } })
}

try {
  const disabled = await createPreGenerationFixture(0)
  const beforeDisabled = proxyRequests.length
  startFixturePreGeneration(disabled.owner)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(proxyRequests.length, beforeDisabled, 'disabled pre-generation must issue zero requests')

  const exact = await createPreGenerationFixture()
  const beforeExact = proxyRequests.length
  startFixturePreGeneration(exact.owner)
  const ready = await waitForPreGeneration('ready')
  assert.equal(proxyRequests.length, beforeExact + 1, 'one start must issue one preview request')
  assert.equal(proxyRequests.at(-1)?.cache_pool, 'narrative-main')
  assert.equal(proxyRequests.at(-1)?.trace_context?.executionKind, 'preview')
  assert.equal(exact.owner.getState().totalRounds, 0)
  assert.equal(exact.character.value, 0, 'preview must not advance the formal subsystem')
  const exactRequest = await prepareNextNarrativeRequest(exact.owner)
  assert.equal(exactRequest.fingerprint, ready.fingerprint)
  assert.ok((await takeNarrativePreGeneration(exactRequest))?.response.includes('预生成测试正文'))
  assert.equal(await takeNarrativePreGeneration(exactRequest), undefined, 'preview is consumed once')

  const mismatch = await createPreGenerationFixture()
  startFixturePreGeneration(mismatch.owner)
  await waitForPreGeneration('ready')
  const matchingRequest = await prepareNextNarrativeRequest(mismatch.owner)
  assert.equal(await takeNarrativePreGeneration({
    ...matchingRequest, fingerprint: `${matchingRequest.fingerprint}:changed`,
  }), undefined)
  assert.equal(await takeNarrativePreGeneration(matchingRequest), undefined, 'mismatch discards preview')

  await assertPreGenerationInvalidated('branch change', (fixtureOwner) => fixtureOwner.setLastPlayerChoice('另一条路'))
  await assertPreGenerationInvalidated('growth commit', (fixtureOwner) => fixtureOwner.refreshCommittedSubsystemStateSnapshot())
  await assertPreGenerationInvalidated('ending', (fixtureOwner) => fixtureOwner.stop())
  await assertPreGenerationInvalidated('settings', () => useSettingsStore.getState().setPreGenerateRounds(0))
  await assertPreGenerationInvalidated('life cycle', (fixtureOwner) => fixtureOwner.invalidatePendingLifeOperations())
  assert.ok(proxyRequests.every((request) => request.cache_pool === 'narrative-main'))
} finally {
  invalidateNarrativePreGeneration()
  globalThis.fetch = originalFetch
}

const owner = new OrchestratorSystem()
const formalBefore = owner.exportPersistenceState()
assert.deepEqual(owner.exportPersistenceState(), formalBefore, 'formal state must remain unchanged before the round is committed')

const historyBefore = owner.getState().narrativeHistory.length
const prepared = owner.prepareNarrativeResponse({
  narrative: '门外的脚步停在雨声里，屋内的人仍未看见这段尚未完成结算的故事。',
})
assert.equal(owner.getState().narrativeHistory.length, historyBefore, 'preparation must keep the candidate private while specialist inputs freeze')
owner.commitNarrativeResponse(prepared.narrativeId)
assert.equal(owner.getState().narrativeHistory.length, historyBefore + 1, 'protocol acceptance must publish the main story immediately')
assert.equal(owner.getState().narrativeHistory.at(-1)?.transitionAudit?.trusted, false, 'published story must show that post-story analysis is still settling')
owner.updateNarrativeTransitionAudit(prepared.narrativeId, {
  requestedChangeCount: 0,
  committedChangeCount: 0,
})
assert.equal(owner.getState().narrativeHistory.at(-1)?.transitionAudit?.trusted, true, 'successful specialists must settle the published story audit')
owner.finalizeNarrativeResponse(prepared.narrativeId)
assert.equal(owner.getState().narrativeHistory.length, historyBefore + 1, 'successful finalization must retain formal history')

const failingOwner = new OrchestratorSystem()
const failingPrepared = failingOwner.prepareNarrativeResponse({
  narrative: '窗前的灯光落在尚待分析的本轮记录上。',
})
failingOwner.commitNarrativeResponse(failingPrepared.narrativeId)
failingOwner.discardNarrativeResponse(failingPrepared.narrativeId, '附加分析测试失败')
assert.equal(failingOwner.getState().narrativeHistory.length, 1, 'post-story failure must retain the published narrative')
assert.equal(failingOwner.getState().narrativeHistory[0]?.transitionAudit?.trusted, false, 'post-story failure must mark the narrative audit untrusted')
assert.deepEqual(failingOwner.getState().narrativeHistory[0]?.transitionAudit?.reasons, ['附加分析测试失败'])

assertOk(/function buildMainNarrativeFingerprint/u.test(mainCall), 'main-story request must own the complete fingerprint')
assertOk(/prompt:[\s\S]*messages:[\s\S]*request:/u.test(mainCall), 'fingerprint must include prompt, messages, and request parameters')
assertOk(
  /const result = preGenerated \?\? await executeMainNarrativeRequest\(request, 'real'\)/u.test(campaign),
  'formal execution must reuse one matching preview or issue one real main-story request',
)
assertOk(
  /name: 'commit-round'[\s\S]{0,180}dependsOn: \[\s*'ai-story-continuity',\s*'ai-talent-growth',?\s*\]/u.test(campaign),
  'commit must depend on exactly the 02 and 03 post-story calls',
)
assertOk(
  /name: 'finalize-round'[\s\S]{0,260}dependsOn: \['commit-round'\][\s\S]{0,500}startNarrativePreGeneration\(/u.test(campaign),
  'next-round pre-generation must start only after the post-story commit-round barrier',
)
assertOk(/storyWasPublished[\s\S]*await orchestrator\.triggerAutoSave\(\)/u.test(hooks), 'a published story must be saved even when post-story analysis fails')

if (failed > 0) process.exit(1)
console.log('PASS: runtime-subsystem-state-regression')
