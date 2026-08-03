'use client'

import {
  fetchAccountSession,
  pushCloudAccount,
  type AccountApiError,
} from '@/core/account/account-client'
import {
  CloudSettingsSchema,
  ACCOUNT_MAX_SLOTS,
  type AccountSessionPayload,
  type CloudGameRecord,
  type CloudMythicTalent,
  type CloudSettings,
} from '@/core/account/account-contract'
import { useAccountClientStore } from '@/core/account/account-client-store'
import { useLifeRecordStore, useMythicLibraryStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'

import {
  getCharacterCreationDraftSnapshot,
  useCharacterCreationDraftStore,
} from './character-creation-draft-store'

let initialized = false
let applyingCloud = false
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncRunning = false
let syncQueued = false

function recordRichness(record: CloudGameRecord): number {
  return (record.scoring ? 4 : 0)
    + (record.endingReview ? 2 : 0)
    + (record.achievements?.length ?? 0)
    + (record.dimensions.length * 2)
}

/** 登录/注册时把游客浏览器中的完整人生并入云端，不让云端快照静默覆盖游客记录。 */
function mergeGameRecords(
  localRecords: readonly CloudGameRecord[],
  cloudRecords: readonly CloudGameRecord[],
): CloudGameRecord[] {
  const merged = new Map<string, CloudGameRecord>()
  for (const record of cloudRecords) merged.set(record.recordId, record)
  for (const record of localRecords) {
    const existing = merged.get(record.recordId)
    if (!existing
      || record.completedAt > existing.completedAt
      || (record.completedAt === existing.completedAt && recordRichness(record) > recordRichness(existing))) {
      merged.set(record.recordId, record)
    }
  }
  const result = [...merged.values()].sort((left, right) => (
    right.completedAt - left.completedAt || left.recordId.localeCompare(right.recordId)
  ))
  if (result.length > ACCOUNT_MAX_SLOTS) {
    throw new Error(`本地与云端人生记录合并后超过 ${ACCOUNT_MAX_SLOTS} 个存档，请先在账号页整理记录。`)
  }
  return result
}

function mythicName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, '').toLocaleLowerCase()
}

function mergeMythicTalents(
  localTalents: readonly CloudMythicTalent[],
  cloudTalents: readonly CloudMythicTalent[],
): CloudMythicTalent[] {
  const result = [...cloudTalents]
  for (const talent of localTalents) {
    const duplicate = result.some((existing) => (
      existing.id === talent.id
      || mythicName(existing.name) === mythicName(talent.name)
      || Boolean(talent.source.runId && existing.source.runId === talent.source.runId)
    ))
    if (!duplicate) result.push(talent)
  }
  if (result.length > ACCOUNT_MAX_SLOTS) {
    throw new Error(`本地与云端轮回天赋合并后超过 ${ACCOUNT_MAX_SLOTS} 项，请先整理天赋库。`)
  }
  return result
}

function localSettings(): CloudSettings {
  const state = useSettingsStore.getState()
  return CloudSettingsSchema.parse({
    provider: state.provider,
    customUrl: state.customUrl,
    customModel: state.customModel,
    temperature: state.temperature,
    topP: state.topP,
    reasoningEffort: state.reasoningEffort,
    talentThinkingIntensity: state.talentThinkingIntensity,
    aiTalentGeneration: state.aiTalentGeneration,
    preGenerateRounds: state.preGenerateRounds,
    storySeed: state.storySeed,
    narrativeStyle: state.narrativeStyle,
    narrativeStyleText: state.narrativeStyleText,
    narrativeStyleVersion: state.narrativeStyleVersion,
    wordCountTarget: state.wordCountTarget,
    streamingMode: state.streamingMode,
    comfortableParagraphs: state.comfortableParagraphs,
    reduceMotion: state.reduceMotion,
    theme: state.theme,
  })
}

export function buildInitialCloudData(saveApiKey: boolean) {
  const settings = useSettingsStore.getState()
  return {
    settings: localSettings(),
    saveApiKey,
    apiKey: saveApiKey ? settings.customKey.trim() || null : null,
    characterDraft: getCharacterCreationDraftSnapshot(),
    mythicTalents: useMythicLibraryStore.getState().patterns,
    gameRecords: useLifeRecordStore.getState().records,
  }
}

export function applyAccountSession(payload: AccountSessionPayload): void {
  const localRecords = useLifeRecordStore.getState().records
  const localTalents = useMythicLibraryStore.getState().patterns
  const mergedRecords = mergeGameRecords(localRecords, payload.snapshot.gameRecords)
  const mergedTalents = mergeMythicTalents(localTalents, payload.snapshot.mythicTalents)
  const cloudRecordIds = new Set(payload.snapshot.gameRecords.map((record) => record.recordId))
  const cloudTalentIds = new Set(payload.snapshot.mythicTalents.map((talent) => talent.id))
  const hasLocalOnlyRecords = mergedRecords.some((record) => !cloudRecordIds.has(record.recordId))
  const hasLocalOnlyTalents = mergedTalents.some((talent) => !cloudTalentIds.has(talent.id))
  applyingCloud = true
  try {
    useSettingsStore.setState({
      ...payload.snapshot.settings,
      customKey: payload.snapshot.apiKey ?? '',
    })
    useCharacterCreationDraftStore.getState().replaceDraft(payload.snapshot.characterDraft)
    useMythicLibraryStore.getState().replacePatterns(mergedTalents)
    useLifeRecordStore.getState().replaceRecords(mergedRecords)
    useAccountClientStore.getState().acceptSession(payload)
  } finally {
    queueMicrotask(() => {
      applyingCloud = false
      if (hasLocalOnlyRecords || hasLocalOnlyTalents) scheduleAccountSync(0)
    })
  }
}

async function performSync(): Promise<void> {
  if (syncRunning) {
    syncQueued = true
    return
  }
  const account = useAccountClientStore.getState()
  if (account.status !== 'authenticated') return
  syncRunning = true
  account.setSyncState('syncing')
  try {
    const local = buildInitialCloudData(account.saveApiKey)
    const payload = await pushCloudAccount({
      ...local,
      baseRevision: account.revision,
    })
    applyingCloud = true
    try {
      useMythicLibraryStore.getState().replacePatterns(payload.snapshot.mythicTalents)
    } finally {
      applyingCloud = false
    }
    useAccountClientStore.getState().setRevision(payload.snapshot.revision)
    useAccountClientStore.getState().setSaveApiKey(payload.snapshot.saveApiKey)
    useAccountClientStore.getState().setSyncState('synced')
  } catch (error) {
    const apiError = error as AccountApiError
    if (apiError.status === 401) {
      clearAuthenticatedAccountState()
    } else if (apiError.status === 409) {
      try {
        const latest = await fetchAccountSession()
        if (latest.authenticated) applyAccountSession(latest)
        else clearAuthenticatedAccountState()
      } catch (refreshError) {
        useAccountClientStore.getState().setSyncState(
          'error',
          refreshError instanceof Error ? refreshError.message : '云端数据刷新失败',
        )
      }
    } else {
      useAccountClientStore.getState().setSyncState(
        'error',
        error instanceof Error ? error.message : '云端同步失败',
      )
    }
  } finally {
    syncRunning = false
    if (syncQueued) {
      syncQueued = false
      scheduleAccountSync(0)
    }
  }
}

export async function syncAccountNow(): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  await performSync()
}

export function scheduleAccountSync(delay = 800): void {
  if (applyingCloud || useAccountClientStore.getState().status !== 'authenticated') return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void performSync()
  }, delay)
}

export function setCloudApiKeyPreference(saveApiKey: boolean): void {
  useAccountClientStore.getState().setSaveApiKey(saveApiKey)
  scheduleAccountSync(0)
}

export function clearAuthenticatedAccountState(): void {
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  syncQueued = false
  useAccountClientStore.getState().setGuest()
  useSettingsStore.setState({ customKey: '' })
}

export async function initializeAccountCloudSync(): Promise<void> {
  if (initialized) return
  initialized = true
  useSettingsStore.subscribe(() => scheduleAccountSync())
  useCharacterCreationDraftStore.subscribe(() => scheduleAccountSync())
  useMythicLibraryStore.subscribe(() => scheduleAccountSync())
  useLifeRecordStore.subscribe(() => scheduleAccountSync())
  try {
    const payload = await fetchAccountSession()
    if (payload.authenticated) applyAccountSession(payload)
    else useAccountClientStore.getState().setGuest()
  } catch (error) {
    console.warn('[account] 无法恢复云端会话:', error)
    useAccountClientStore.getState().setGuest()
  }
}
