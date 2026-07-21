'use client'

import {
  fetchAccountSession,
  pushCloudAccount,
  type AccountApiError,
} from '@/core/account/account-client'
import {
  CloudSettingsSchema,
  type AccountSessionPayload,
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

function localSettings(): CloudSettings {
  const state = useSettingsStore.getState()
  return CloudSettingsSchema.parse({
    provider: state.provider,
    customUrl: state.customUrl,
    customModel: state.customModel,
    temperature: state.temperature,
    topP: state.topP,
    maxTokens: state.maxTokens,
    reasoningEffort: state.reasoningEffort,
    talentThinkingIntensity: state.talentThinkingIntensity,
    aiTalentGeneration: state.aiTalentGeneration,
    preGenerateRounds: state.preGenerateRounds,
    storySeed: state.storySeed,
    narrativeStyle: state.narrativeStyle,
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
  applyingCloud = true
  try {
    useSettingsStore.setState({
      ...payload.snapshot.settings,
      customKey: payload.snapshot.apiKey ?? '',
    })
    useCharacterCreationDraftStore.getState().replaceDraft(payload.snapshot.characterDraft)
    useMythicLibraryStore.getState().replacePatterns(payload.snapshot.mythicTalents)
    useLifeRecordStore.getState().replaceRecords(payload.snapshot.gameRecords)
    useAccountClientStore.getState().acceptSession(payload)
  } finally {
    queueMicrotask(() => { applyingCloud = false })
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
