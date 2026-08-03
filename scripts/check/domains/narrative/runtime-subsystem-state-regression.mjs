/**
 * Purpose: Verify that runtime preview and rollback snapshots are absent from the narrative round path.
 * Owner: quality:narrative
 * Responsibility: Runtime snapshot-removal contract only; persistence export/import remains a save concern.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8')

const [hooks, orchestrator, preGen, campaign, saveRestore, requestBody, proxyRoute] = await Promise.all([
  read('src/mods/mod-engine/hooks.ts'),
  read('src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  read('src/mods/mod-engine/helpers/pre-gen-queue.ts'),
  read('src/mods/mod-engine/campaigns/default/index.ts'),
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

const runtimeSources = { hooks, orchestrator, preGen, campaign }
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
  preGen.includes('运行时预览已移除')
    && !preGen.includes('orchestrator.executeRoundV2')
    && !preGen.includes('runPreviewRound'),
  'pre-generation must not execute a speculative round after snapshot removal',
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
    && campaign.includes('orchestrator.acceptNarrativeResponse'),
  'the campaign must contain one real execution path with no preview branch',
)
assertOk(
  !requestBody.includes('maxTokens')
    && !requestBody.includes('max_tokens')
    && !proxyRoute.includes('max_tokens')
    && !proxyRoute.includes('budget_tokens'),
  'AI request assembly and proxy forwarding must not carry output or reasoning token budgets',
)

if (failed > 0) process.exit(1)
console.log('PASS: runtime-subsystem-state-regression')
