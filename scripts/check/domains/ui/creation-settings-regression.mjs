/**
 * Purpose: Verify creation-flow budget, seed lifetime, and local model profiles.
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
  physique: 0,
  mind: 0,
  talentAptitude: 0,
  charisma: 0,
})
assert.match(attributePage, /const TOTAL_POINTS = 4/)
assert.match(attributePage, /setCharacterBase\(\{ base: normalizeAttributes\(attributes\) \}\)/)
assert.match(characterStore, /characterBase: initialCharacterBase\(\),\s*destinyPatterns:/)
assert.match(characterStore, /setPatternLoadout:[\s\S]*?characterBase:\s*\{\s*\.\.\.initialCharacterBase\(\),\s*startingAge:/)
assert.doesNotMatch(characterCreateForm, /MAX_ATTRIBUTE_POINTS|handleAttrChange/)
assert.doesNotMatch(characterCreateLogic, /toBaseAttributes|confirmedAttributes/)
assert.match(characterCreateLogic, /setCharacterBase\(\{ startingAge \}\)/)
assert.doesNotMatch(fatePage, /FatePreviewWorldInit|getWorldInitState|persistFatePreviewSeed/)
assert.match(startHook, /MAX_CREATION_COMMIT_ATTEMPTS/)
assert.match(startHook, /isTransientCreationCommitReason/)

console.log('PASS: creation-settings-regression')
