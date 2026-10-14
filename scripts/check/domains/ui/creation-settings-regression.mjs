/**
 * Purpose: Verify optional talent loadouts, creation budget, seed lifetime, and model profiles.
 * Owner: quality:ui
 * Responsibility: Focused creation/settings regression smoke only.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

class MemoryStorage {
  constructor() {
    this.data = new Map()
  }

  getItem(key) { return this.data.get(String(key)) ?? null }
  setItem(key, value) { this.data.set(String(key), String(value)) }
  removeItem(key) { this.data.delete(String(key)) }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })

const [
  { useSettingsStore },
  { getCharacterCreationDraftSnapshot, useCharacterCreationDraftStore },
  attributePage,
  characterStore,
  characterCreateForm,
  characterCreateLogic,
  fatePage,
  startHook,
  accountCloudSync,
  dataManagement,
  { useCharacterStore },
  { assertPatternLoadout, isPatternLoadoutValid },
  talentSelection,
  talentView,
] = await Promise.all([
  import('../../../../src/mods/mod-settings/store.ts'),
  import('../../../../src/mods/mod-pages/helpers/character-creation-draft-store.ts'),
  readFile(new URL('../../../../src/mods/mod-pages/pages/attribute-alloc/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-character/store.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-pages/pages/character-create/useCharacterCreateForm.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-pages/pages/fate-preview/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-pages/pages/fate-preview/useFatePreviewStart.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-pages/helpers/account-cloud-sync.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-settings/components/SettingsDataManagement.tsx', import.meta.url), 'utf8'),
  import('../../../../src/mods/mod-character/store.ts'),
  import('../../../../src/mods/mod-character/pattern-loadout.ts'),
  readFile(new URL('../../../../src/mods/mod-pages/pages/talent-draw/useTalentDrawSelection.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../../src/mods/mod-pages/pages/talent-draw/TalentDrawSelectionView.tsx', import.meta.url), 'utf8'),
])

useSettingsStore.setState({
  customKey: 'sk-profile-a',
  customUrl: 'https://relay.example/v1',
  customModel: 'model-a',
})
useSettingsStore.getState().saveCustomModelProfile('家用中转')
const savedProfile = useSettingsStore.getState().customModelProfiles[0]
assert.equal(savedProfile?.name, '家用中转')
useSettingsStore.setState({
  customKey: 'sk-profile-b',
  customUrl: 'https://relay.example/other',
  customModel: 'model-b',
})
useSettingsStore.getState().activateCustomModelProfile(savedProfile.id)
assert.equal(useSettingsStore.getState().customModel, 'model-a')
assert.equal(useSettingsStore.getState().customUrl, 'https://relay.example/v1')

useSettingsStore.getState().setStorySeed('987654')
const persistedSettings = JSON.parse(storage.getItem('mod-settings:store') ?? '{}')
const persistedState = persistedSettings.state ?? {}
assert.equal(persistedState.customModelProfiles?.[0]?.name, '家用中转')
assert.equal('storySeed' in persistedState, false)

const cloudSettingsProjection = accountCloudSync.slice(
  accountCloudSync.indexOf('function localSettings()'),
  accountCloudSync.indexOf('export function buildInitialCloudData'),
)
const settingsExportProjection = dataManagement.slice(
  dataManagement.indexOf('const handleExport'),
  dataManagement.indexOf('const handleImport'),
)
assert.doesNotMatch(cloudSettingsProjection, /storySeed|customModelProfiles/)
assert.doesNotMatch(settingsExportProjection, /storySeed/)

assert.equal('attributes' in useCharacterCreationDraftStore.getState().draft, false)
assert.deepEqual(getCharacterCreationDraftSnapshot().attributes, {
  mind: 0,
  physique: 0,
  charisma: 0,
  familyBackground: 0,
})
assert.match(attributePage, /const TOTAL_POINTS = 4/)
assert.match(attributePage, /setCharacterBase\(\{ base: normalizeAttributes\(attributes\) \}\)/)
assert.match(characterStore, /characterBase: initialCharacterBase\(\),\s*destinyPatterns:/)
assert.match(characterStore, /setPatternLoadout:[\s\S]*?characterBase:\s*\{\s*\.\.\.initialCharacterBase\(\),\s*startingAge:/)
assert.doesNotMatch(characterCreateForm, /MAX_ATTRIBUTE_POINTS|handleAttrChange/)
assert.doesNotMatch(characterCreateLogic, /toBaseAttributes|confirmedAttributes/)
assert.match(characterCreateLogic, /setCharacterBase\(\{ startingAge \}\)/)
assert.doesNotMatch(fatePage, /FatePreviewWorldInit|getWorldInitState|persistFatePreviewSeed/)
assert.match(startHook, /ensureOrchestratorContextFromStores\(\)/)
assert.doesNotMatch(
  startHook,
  /orchestrator\.applyRoundChanges\(\[|MAX_CREATION_COMMIT_ATTEMPTS|isTransientCreationCommitReason|命格系统尚未准备完成/,
)
assert.match(fatePage, /const patternLoadoutConfirmed = isPatternLoadoutValid\(selectedPatterns, equippedReincarnationTalents\)/)
assert.match(attributePage, /const hasPatterns = isPatternLoadoutValid\(selectedPatterns, equippedReincarnationTalents\)/)
assert.match(fatePage, /const worldReady = worldInitialized && !!worldConfig && worldCode > 0/)
assert.match(fatePage, /const runtimeGateReason = !allModsLoaded/)
assert.match(fatePage, /enabled: worldReady && characterConfirmed && patternLoadoutConfirmed/)
assert.doesNotMatch(talentSelection, /selectedData\.length !== PATTERN_LOADOUT_SLOT_COUNT|assertPatternLoadout\([^)]*, true\)/)
assert.doesNotMatch(talentView, /pattern\.effect/)

const candidates = Array.from({ length: 5 }, (_, index) => ({
  id: `optional-pattern-${index}`,
  lineageId: `optional-lineage-${index}`,
  version: 1,
  name: `金手指${index}`,
  description: '简要能力介绍',
  effect: '符合能力自身条件时真实生效，不受世界题材限制。',
  category: 'creation',
  rarity: 'common',
  attrBonus: { mind: 1 },
}))
for (let count = 0; count <= 4; count++) {
  const selected = candidates.filter((_, index) => index < count)
  assert.equal(isPatternLoadoutValid(selected, []), true)
  assert.doesNotThrow(() => assertPatternLoadout(selected, []))
  useCharacterStore.getState().setPatternLoadout(selected, [], candidates)
  const state = useCharacterStore.getState()
  assert.equal(state.destinyPatterns.patterns.length, count)
  assert.deepEqual(state.destinyPatterns.patterns.map((pattern) => pattern.effect), selected.map((pattern) => pattern.effect))
  assert.equal(state.equippedReincarnationTalents.length, 0)
}
assert.equal(isPatternLoadoutValid(candidates, []), false)
assert.throws(() => useCharacterStore.getState().setPatternLoadout(candidates, [], candidates), /不能超过/)
assert.throws(() => assertPatternLoadout([candidates[0], candidates[0]], []), /重复/)
assert.equal(isPatternLoadoutValid([candidates[0]], [{ id: 'reincarnation-fixture' }]), true)
assert.equal(isPatternLoadoutValid(candidates, [{ id: 'reincarnation-fixture' }]), false)
useCharacterStore.getState().setPatternLoadout([], [], candidates)
assert.deepEqual(useCharacterStore.getState().destinyPatterns.patterns, [])

console.log('PASS: creation-settings-regression')
