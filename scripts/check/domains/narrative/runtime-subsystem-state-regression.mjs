/**
 * Purpose: Verify immediate narrative publication and the absence of the removed pre-generation path.
 * Owner: quality:narrative
 * Responsibility: Runtime snapshot removal and immediate narrative publication only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { OrchestratorSystem } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'

const root = getProjectRoot(import.meta.url)
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8')

const [hooks, orchestrator, acceptance, campaign, mainCall, saveRestore, requestBody, proxyRoute] = await Promise.all([
  read('src/mods/mod-engine/hooks.ts'),
  read('src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  read('src/mods/mod-engine/subsystems/orchestrator-system/narrative-acceptance-runtime.ts'),
  read('src/mods/mod-engine/campaigns/default/index.ts'),
  read('src/mods/mod-engine/helpers/main-narrative-call.ts'),
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
  !campaign.includes('takePreGeneratedNarrative')
    && !campaign.includes("executeMainNarrativeRequest(request, 'prefetch'")
    && !hooks.includes('startNarrativePreGeneration')
    && !mainCall.includes("executionKind: 'prefetch'"),
  'the removed pre-generation path must have no formal call, consumer, or hook entry',
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

class IsolatedCharacterSubsystem {
  id = 'character-base'
  mod = 'mod-character'
  label = '隔离角色状态'
  description = '验证正式回合发布不会推进重复的正式子系统状态'
  value = 0

  advance() {
    this.value += 1
  }

  collectState() {
    return { id: this.id, summary: `value=${this.value}`, data: { value: this.value } }
  }

  applyChanges() {}
  reset() { this.value = 0 }
  capturePersistenceState() { return { value: this.value } }
  restorePersistenceState(state) { this.value = Number(state?.value ?? 0) }
}

const owner = new OrchestratorSystem()
const formalSubsystem = new IsolatedCharacterSubsystem()
owner.registerSubsystem(formalSubsystem)
await owner.collectAllSubsystemStates(false)
const formalBefore = owner.exportPersistenceState()
assert.deepEqual(owner.exportPersistenceState(), formalBefore, 'formal state must remain unchanged before the round is committed')
assert.equal(formalSubsystem.value, 0, 'the formal subsystem must not advance before the round is committed')

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
assertOk(/await executeMainNarrativeRequest\(request, 'real'\)/u.test(campaign), 'formal execution must call the main story exactly once')
assertOk(
  /name: 'commit-round'[\s\S]{0,180}dependsOn: \[\s*'ai-story-continuity',\s*'ai-talent-growth',?\s*\]/u.test(campaign),
  'commit must depend on exactly the 02 and 03 post-story calls',
)
assertOk(/storyWasPublished[\s\S]*await orchestrator\.triggerAutoSave\(\)/u.test(hooks), 'a published story must be saved even when post-story analysis fails')

if (failed > 0) process.exit(1)
console.log('PASS: runtime-subsystem-state-regression')
