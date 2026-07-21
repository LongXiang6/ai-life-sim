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

const [{ opfsStorage }, { saveManager }] = await Promise.all([
  import('../../../../src/core/storage/opfs-storage.ts'),
  import('../../../../src/core/storage/save-manager.ts'),
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
