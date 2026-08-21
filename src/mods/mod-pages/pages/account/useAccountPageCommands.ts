/**
 * Purpose: Manage account-page authentication, QQ linking, cloud-save deletion, and local account data commands.
 * Owner: mod-pages/account
 * Responsibility: Account page state and commands only; tab presentation remains in sibling components.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  createCloudQqLinkCode,
  deleteCloudAccount,
  fetchAccountSession,
  loginCloudAccount,
  logoutCloudAccount,
  registerCloudAccount,
  unlinkCloudQq,
} from '@/core/account/account-client'
import {
  LoginRequestSchema,
  RegisterRequestSchema,
} from '@/core/account/account-contract'
import { useAccountClientStore } from '@/core/account/account-client-store'
import {
  fetchCloudManualSaveSummary,
  removeCloudManualSave,
} from '@/core/player-content/player-content-client'
import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'
import { useLifeRecordStore, useReincarnationLibraryStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'

import {
  applyAccountSession,
  buildInitialCloudData,
  clearAuthenticatedAccountState,
  setCloudApiKeyPreference,
  syncAccountNow,
} from '../../helpers/account-cloud-sync'
import { useCharacterCreationDraftStore } from '../../helpers/character-creation-draft-store'

type GuestMode = 'login' | 'register'
type AccountTab = 'login' | 'cloud' | 'data'

function firstIssueMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return (error as { issues?: Array<{ message?: string }> }).issues?.[0]?.message ?? '输入内容无效'
  }
  return error instanceof Error ? error.message : '账号操作失败'
}

export function useAccountPageCommands() {
  const router = useRouter()
  const status = useAccountClientStore((state) => state.status)
  const account = useAccountClientStore((state) => state.account)
  const syncStatus = useAccountClientStore((state) => state.syncStatus)
  const syncError = useAccountClientStore((state) => state.syncError)
  const saveApiKey = useAccountClientStore((state) => state.saveApiKey)
  const reincarnationTalents = useReincarnationLibraryStore((state) => state.talents)
  const removeReincarnationTalent = useReincarnationLibraryStore((state) => state.removeReincarnationTalent)
  const gameRecords = useLifeRecordStore((state) => state.records)
  const removeGameRecord = useLifeRecordStore((state) => state.removeRecord)
  const customKey = useSettingsStore((state) => state.customKey)
  const characterDraft = useCharacterCreationDraftStore((state) => state.draft)
  const [mode, setMode] = useState<GuestMode>('login')
  const [activeTab, setActiveTab] = useState<AccountTab>('login')
  const [username, setUsername] = useState('')
  const [qq, setQq] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [registerSaveKey, setRegisterSaveKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [qqLinkCode, setQqLinkCode] = useState('')
  const [qqLinkExpiresAt, setQqLinkExpiresAt] = useState(0)
  const [qqLinkBusy, setQqLinkBusy] = useState(false)
  const [cloudSave, setCloudSave] = useState<CloudManualSaveSummary | null>(null)
  const [cloudSaveBusy, setCloudSaveBusy] = useState(false)
  const [cloudDeleteArmed, setCloudDeleteArmed] = useState(false)

  useEffect(() => {
    let active = true
    if (status !== 'authenticated') {
      queueMicrotask(() => {
        if (!active) return
        setCloudSave(null)
        setCloudDeleteArmed(false)
      })
      return () => { active = false }
    }
    queueMicrotask(() => { if (active) setCloudSaveBusy(true) })
    void fetchCloudManualSaveSummary()
      .then((summary) => { if (active) setCloudSave(summary) })
      .catch((error) => { if (active) setMessage(firstIssueMessage(error)) })
      .finally(() => { if (active) setCloudSaveBusy(false) })
    return () => { active = false }
  }, [status])

  const syncLabel = useMemo(() => {
    if (syncStatus === 'syncing') return '同步中'
    if (syncStatus === 'error') return '同步失败'
    if (syncStatus === 'synced') return '已同步'
    return '待同步'
  }, [syncStatus])

  const handleLogin = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const input = LoginRequestSchema.parse({ username, password })
      applyAccountSession(await loginCloudAccount(input))
      setPassword('')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const handleRegister = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const input = RegisterRequestSchema.parse({
        username,
        qq,
        password,
        confirmPassword,
        initialData: buildInitialCloudData(registerSaveKey),
      })
      applyAccountSession(await registerCloudAccount(input))
      setPassword('')
      setConfirmPassword('')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const handleLogout = async () => {
    if (busy) return
    setBusy(true)
    try {
      await logoutCloudAccount()
      clearAuthenticatedAccountState()
      router.replace('/welcome')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const handleDelete = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await deleteCloudAccount(deletePassword)
      clearAuthenticatedAccountState()
      router.replace('/welcome')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleCreateQqLinkCode = async () => {
    if (qqLinkBusy) return
    setQqLinkBusy(true)
    setMessage('')
    try {
      const result = await createCloudQqLinkCode()
      setQqLinkCode(result.code)
      setQqLinkExpiresAt(result.expiresAt)
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setQqLinkBusy(false)
    }
  }
  const handleRefreshAccount = async () => {
    if (qqLinkBusy) return
    setQqLinkBusy(true)
    setMessage('')
    try {
      const payload = await fetchAccountSession()
      if (!payload.authenticated) throw new Error('登录状态已失效')
      applyAccountSession(payload)
      if (payload.account.linkedQq) {
        setQqLinkCode('')
        setQqLinkExpiresAt(0)
      }
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setQqLinkBusy(false)
    }
  }
  const handleUnlinkQq = async () => {
    if (qqLinkBusy) return
    setQqLinkBusy(true)
    setMessage('')
    try {
      applyAccountSession(await unlinkCloudQq())
      setQqLinkCode('')
      setQqLinkExpiresAt(0)
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setQqLinkBusy(false)
    }
  }
  const handleDeleteCloudSave = async () => {
    if (!cloudDeleteArmed || cloudSaveBusy) {
      setCloudDeleteArmed(true)
      return
    }
    setCloudSaveBusy(true)
    setMessage('')
    try {
      await removeCloudManualSave()
      setCloudSave(null)
      setCloudDeleteArmed(false)
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setCloudSaveBusy(false)
    }
  }

  return {
    account,
    activeTab,
    busy,
    characterDraft,
    cloudDeleteArmed,
    cloudSave,
    cloudSaveBusy,
    confirmPassword,
    customKey,
    deleteOpen,
    deletePassword,
    gameRecords,
    handleCreateQqLinkCode,
    handleDelete,
    handleDeleteCloudSave,
    handleLogin,
    handleLogout,
    handleRefreshAccount,
    handleRegister,
    handleUnlinkQq,
    message,
    mode,
    reincarnationTalents,
    password,
    qq,
    qqLinkBusy,
    qqLinkCode,
    qqLinkExpiresAt,
    registerSaveKey,
    removeGameRecord,
    removeReincarnationTalent,
    router,
    saveApiKey,
    setActiveTab,
    setCloudApiKeyPreference,
    setConfirmPassword,
    setDeleteOpen,
    setDeletePassword,
    setMessage,
    setMode,
    setPassword,
    setQq,
    setRegisterSaveKey,
    setUsername,
    status,
    syncAccountNow,
    syncError,
    syncLabel,
    syncStatus,
    username,
  }
}
