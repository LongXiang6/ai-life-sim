/**
 * Purpose: Regress rollback behavior when replacing an invalidated life record.
 * Owner: quality:narrative
 * Responsibility: Autosave lifecycle smoke assertions only.
 */

/**
 * 自动存档生命周期回归：旧人生在目录替换过程中失效时必须回滚槽 0。
 */

import fs from 'node:fs/promises'

class MemoryStorage {
  constructor() { this.data = new Map() }
  get length() { return this.data.size }
  key(index) { return [...this.data.keys()][index] ?? null }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null }
  setItem(key, value) { this.data.set(String(key), String(value)) }
  removeItem(key) { this.data.delete(String(key)) }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })

const [{ opfsStorage }, { saveManager }, { GAME_SAVE_SCHEMA_VERSION }] = await Promise.all([
  import('../../../../src/core/storage/opfs-storage.ts'),
  import('../../../../src/core/storage/save-manager.ts'),
  import('../../../../src/core/storage/save-manager/save-format.ts'),
])

const files = new Map()
const originals = { ...opfsStorage }
const encoder = new TextEncoder()
const decoder = new TextDecoder()
let pauseOldTargetWrite = false
let releaseTargetWrite
let targetWriteReached

const releasePromise = new Promise((resolve) => { releaseTargetWrite = resolve })
const reachedPromise = new Promise((resolve) => { targetWriteReached = resolve })

opfsStorage.writeFile = async (filePath, data) => {
  const buffer = typeof data === 'string' ? encoder.encode(data).buffer : data.slice(0)
  files.set(filePath, buffer)
  if (
    pauseOldTargetWrite
    && filePath === 'save/0/engine.json'
    && decoder.decode(buffer).includes('"timeline": "old-life"')
  ) {
    targetWriteReached()
    await releasePromise
  }
}
opfsStorage.readFile = async (filePath) => files.get(filePath)?.slice(0) ?? null
opfsStorage.listFiles = async (dirPath) => {
  const prefix = `${dirPath}/`
  return [...files.keys()].filter((filePath) => (
    filePath.startsWith(prefix) && !filePath.slice(prefix.length).includes('/')
  ))
}
opfsStorage.deleteFile = async (filePath) => { files.delete(filePath) }
opfsStorage.deleteDirectory = async (dirPath) => {
  const prefix = `${dirPath}/`
  for (const filePath of [...files.keys()]) {
    if (filePath.startsWith(prefix)) files.delete(filePath)
  }
}

function payload(timeline, totalRounds) {
  return {
    saveSchemaVersion: GAME_SAVE_SCHEMA_VERSION,
    engine: { timeline, totalRounds },
    character: { name: timeline },
    world: { name: timeline },
  }
}

function unversionedPayload(timeline, totalRounds) {
  return {
    engine: { timeline, totalRounds },
    character: { name: timeline },
    world: { name: timeline },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const baseline = await saveManager.autoSave(
    'baseline-world',
    'baseline-character',
    payload('baseline', 7),
  )
  assert(baseline?.worldName === 'baseline-world', 'baseline auto-save must commit')

  const baselineEngine = files.get('save/0/engine.json')?.slice(0)
  assert(GAME_SAVE_SCHEMA_VERSION === 3, 'new whole-game saves must use v3')
  files.set('save/0/saveSchemaVersion.json', encoder.encode('2').buffer)
  const legacyFiles = new Map([...files].map(([name, data]) => [name, data.slice(0)]))
  await saveManager.loadSave(0).then(
    () => { throw new Error('v2 whole-game saves must be rejected') },
    (error) => assert(error.message.includes('不提供旧存档迁移'), 'v2 rejection must explain incompatibility'),
  )
  await saveManager.autoSave('new', 'new', payload('new', 8)).then(
    () => { throw new Error('v2 autosaves must not be replaced') },
    (error) => assert(error.message.includes('保留原文件'), 'v2 autosave rejection must preserve old files'),
  )
  assert(files.size === legacyFiles.size && [...legacyFiles].every(([name, data]) => (
    Buffer.from(files.get(name) ?? []).equals(Buffer.from(data))
  )), 'all v2 files must remain byte-identical after rejected loading and saving')
  files.set('save/0/saveSchemaVersion.json', encoder.encode(String(GAME_SAVE_SCHEMA_VERSION)).buffer)
  let unversionedAutoSaveRejected = false
  try {
    await saveManager.autoSave('unversioned-world', 'unversioned-character', unversionedPayload('unversioned', 8))
  } catch (error) {
    unversionedAutoSaveRejected = error instanceof Error && error.message.includes('未标记格式')
  }
  assert(unversionedAutoSaveRejected, 'auto-save writes must reject payloads without an explicit schema version')
  assert(
    Buffer.from(files.get('save/0/engine.json') ?? []).equals(Buffer.from(baselineEngine ?? [])),
    'rejecting an unversioned auto-save payload must preserve the current slot',
  )

  let unversionedManualSaveRejected = false
  try {
    await saveManager.saveToSlot(1, '未标记存档', '测试世界', '测试角色', unversionedPayload('unversioned', 8))
  } catch (error) {
    unversionedManualSaveRejected = error instanceof Error && error.message.includes('未标记格式')
  }
  assert(unversionedManualSaveRejected, 'manual-save writes must reject payloads without an explicit schema version')
  assert(!saveManager.slotExists(1), 'rejecting an unversioned manual save must not create a slot')

  files.delete('save/0/saveSchemaVersion.json')
  let oldAutoSaveRejected = false
  try {
    await saveManager.autoSave('replacement-world', 'replacement-character', payload('replacement-life', 8))
  } catch (error) {
    oldAutoSaveRejected = error instanceof Error
      && error.message.includes('自动保存已停止并保留原文件')
  }
  assert(oldAutoSaveRejected, 'old auto-save slots must stop automatic replacement')
  assert(
    Buffer.from(files.get('save/0/engine.json') ?? []).equals(Buffer.from(baselineEngine ?? [])),
    'rejecting an old auto-save format must preserve the original payload',
  )
  let oldLoadRejected = false
  try {
    await saveManager.loadSave(0)
  } catch (error) {
    oldLoadRejected = error instanceof Error && error.message.includes('不提供旧存档迁移')
  }
  assert(oldLoadRejected, 'local save loading must reject a missing schema marker')
  files.set(
    'save/0/saveSchemaVersion.json',
    encoder.encode(String(GAME_SAVE_SCHEMA_VERSION)).buffer,
  )

  let generationIsCurrent = true
  pauseOldTargetWrite = true
  const staleSave = saveManager.autoSave(
    'old-world',
    'old-character',
    payload('old-life', 12),
    () => generationIsCurrent,
  )
  await reachedPromise
  generationIsCurrent = false
  releaseTargetWrite()

  const staleResult = await staleSave
  assert(staleResult === null, 'invalidated auto-save must resolve as a normal cancellation')
  const restored = await saveManager.loadSave(0)
  assert(restored?.engine?.timeline === 'baseline', 'cancelled replacement must restore prior slot 0 payload')
  assert(saveManager.listSaves()[0]?.worldName === 'baseline-world', 'cancelled replacement must not update the save index')

  pauseOldTargetWrite = false
  const current = await saveManager.autoSave(
    'current-world',
    'current-character',
    payload('current-life', 1),
    () => true,
  )
  assert(current?.worldName === 'current-world', 'current generation auto-save must still commit')
  assert((await saveManager.loadSave(0))?.engine?.timeline === 'current-life', 'current generation payload must replace slot 0')

  const orchestratorSource = await fs.readFile(
    new URL('../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts', import.meta.url),
    'utf8',
  )
  const restoreSource = await fs.readFile(
    new URL('../../../../src/mods/mod-engine/helpers/save-restore.ts', import.meta.url),
    'utf8',
  )
  assert(
    restoreSource.indexOf('assertCurrentGameSaveFormat(data)')
      < restoreSource.indexOf("assertRuntimeReady('加载存档')")
      && restoreSource.indexOf('assertCurrentGameSaveFormat(data)')
        < restoreSource.indexOf('const previous ='),
    'save schema must be checked before readiness side effects or current state capture',
  )
  assert(
    orchestratorSource.includes('() => this.lifeGeneration === saveGeneration')
      && orchestratorSource.includes('this.invalidatePendingLifeOperations()'),
    'orchestrator reset and auto-save must share one life-generation guard',
  )
  assert(
    restoreSource.includes('orchestrator.invalidatePendingLifeOperations()'),
    'loading a save must invalidate pending writes from the previous life',
  )
} finally {
  Object.assign(opfsStorage, originals)
}

console.log('[autosave-lifecycle-smoke] PASS')
