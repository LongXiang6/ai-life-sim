/**
 * Purpose: Own mailbox loading, composition state, and remote mutation commands.
 * Owner: mod-pages/mailbox
 * Responsibility: Mailbox client orchestration only; page layout and message rendering remain in sibling components.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'

import { useAccountClientStore } from '@/core/account/account-client-store'
import { ensureDiagnosticPlayerCode } from '@/core/logger/diagnostic-player-code-client'
import {
  acceptPlayerMailTalent,
  deletePlayerMail,
  fetchPlayerMailPage,
  markPlayerMailRead,
  sendPlayerMailMessage,
} from '@/core/player-content/player-content-client'
import type {
  PlayerMailFolder,
  PlayerMailMessageView,
  PlayerMailPage,
} from '@/core/player-content/player-content-contract'
import { useReincarnationLibraryStore } from '@/mods/mod-character'
import { syncAccountNow } from '@/mods/mod-pages/account-cloud-api'

type RecipientType = 'account' | 'diagnostic'

function failureMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

export function useMailboxCommands() {
  const accountStatus = useAccountClientStore((state) => state.status)
  const talents = useReincarnationLibraryStore((state) => state.talents)
  const [folder, setFolder] = useState<PlayerMailFolder>('inbox')
  const [messages, setMessages] = useState<PlayerMailMessageView[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [diagnosticCode, setDiagnosticCode] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [recipientType, setRecipientType] = useState<RecipientType>('account')
  const [recipientValue, setRecipientValue] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [talentId, setTalentId] = useState('')
  const [sending, setSending] = useState(false)

  const applyServerState = useCallback((page: PlayerMailPage) => {
    if (page.accountRevision !== null) {
      useAccountClientStore.getState().setRevision(page.accountRevision)
    }
    const removeIds = new Set(page.talentReconciliation.removeTalentIds)
    for (const talent of useReincarnationLibraryStore.getState().talents) {
      if (removeIds.has(talent.id)) useReincarnationLibraryStore.getState().removeReincarnationTalent(talent.id)
    }
    for (const talent of page.talentReconciliation.ownedTalents) {
      try {
        useReincarnationLibraryStore.getState().addReincarnationTalent(talent)
      } catch (reason) {
        setNotice(failureMessage(reason, '轮回天赋暂时无法入库'))
      }
    }
    setUnreadCount(page.unreadCount)
    setDiagnosticCode(page.diagnosticCode)
  }, [])

  const reload = useCallback(async (targetFolder: PlayerMailFolder = folder) => {
    setLoading(true)
    setError('')
    try {
      await ensureDiagnosticPlayerCode()
      const page = await fetchPlayerMailPage(targetFolder)
      applyServerState(page)
      setMessages(page.messages)
      setNextCursor(page.nextCursor)
      setExpandedId(null)
      return page
    } catch (reason) {
      setError(failureMessage(reason, '邮箱读取失败'))
      return null
    } finally {
      setLoading(false)
    }
  }, [applyServerState, folder])

  useEffect(() => {
    if (accountStatus === 'loading') return
    const timer = window.setTimeout(() => { void reload(folder) }, 0)
    return () => window.clearTimeout(timer)
  }, [accountStatus, folder, reload])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const page = await fetchPlayerMailPage(folder, nextCursor)
      applyServerState(page)
      setMessages((current) => [...current, ...page.messages])
      setNextCursor(page.nextCursor)
    } catch (reason) {
      setError(failureMessage(reason, '更多邮件读取失败'))
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleMessage = async (message: PlayerMailMessageView) => {
    const opening = expandedId !== message.id
    setExpandedId(opening ? message.id : null)
    if (!opening || folder !== 'inbox' || message.readAt !== null) return
    try {
      const result = await markPlayerMailRead(message.id)
      if (result.message) {
        setMessages((current) => current.map((item) => item.id === message.id ? result.message! : item))
        setUnreadCount((count) => Math.max(0, count - 1))
      }
    } catch (reason) {
      const failure = failureMessage(reason, '邮件状态更新失败')
      const page = await reload('inbox')
      if (page) setNotice('连接中断，收件箱状态已重新同步，请核对结果')
      else setError(failure)
    }
  }

  const removeMessage = async (messageId: string) => {
    setError('')
    try {
      const result = await deletePlayerMail(messageId)
      if (result.accountRevision !== null) {
        useAccountClientStore.getState().setRevision(result.accountRevision)
      }
      setMessages((current) => current.filter((message) => message.id !== messageId))
      setExpandedId((current) => current === messageId ? null : current)
      setNotice('邮件已删除')
    } catch (reason) {
      const failure = failureMessage(reason, '邮件删除失败')
      const page = await reload(folder)
      if (page) setNotice('连接中断，邮箱状态已重新同步，请核对结果')
      else setError(failure)
    }
  }

  const acceptTalent = async (messageId: string) => {
    setError('')
    try {
      const result = await acceptPlayerMailTalent(messageId)
      if (result.accountRevision !== null) {
        useAccountClientStore.getState().setRevision(result.accountRevision)
      }
      if (result.acceptedTalent) useReincarnationLibraryStore.getState().addReincarnationTalent(result.acceptedTalent)
      setMessages((current) => current.map((message) => (
        message.id === messageId && message.talent
          ? {
              ...message,
              readAt: message.readAt ?? Date.now(),
              talent: { ...message.talent, status: 'accepted', acceptedAt: Date.now() },
            }
          : message
      )))
      setNotice('轮回天赋已收入天赋库')
    } catch (reason) {
      const failure = failureMessage(reason, '轮回天赋领取失败')
      const page = await reload('inbox')
      const message = page?.messages.find((item) => item.id === messageId)
      if (message?.talent?.status === 'accepted') setNotice('轮回天赋已收入天赋库')
      else if (page) setNotice('连接中断，收件箱状态已重新同步，请核对结果')
      else setError(failure)
    }
  }

  const sendMail = async () => {
    if (!recipientValue.trim() || !title || !body || sending) return
    const requestId = crypto.randomUUID()
    const selectedTalent = talents.find((talent) => talent.id === talentId)
    const completeSend = () => {
      if (selectedTalent) useReincarnationLibraryStore.getState().removeReincarnationTalent(selectedTalent.id)
      setRecipientValue('')
      setTitle('')
      setBody('')
      setTalentId('')
      setComposeOpen(false)
      setNotice('邮件已发送')
    }
    setSending(true)
    setError('')
    setNotice('')
    try {
      if (selectedTalent && accountStatus === 'authenticated') await syncAccountNow()
      const result = await sendPlayerMailMessage({
        requestId,
        recipient: { type: recipientType, value: recipientValue },
        title,
        body,
        ...(selectedTalent ? { talent: selectedTalent } : {}),
      })
      if (result.accountRevision !== null) {
        useAccountClientStore.getState().setRevision(result.accountRevision)
      }
      completeSend()
      setFolder('sent')
      if (folder === 'sent') await reload('sent')
    } catch (reason) {
      const failure = failureMessage(reason, '邮件发送失败')
      const page = await reload('sent')
      setFolder('sent')
      if (page?.messages.some((message) => message.id === requestId)) completeSend()
      else if (page) setNotice('连接中断，发件箱已重新同步，请核对后重试')
      else setError(failure)
    } finally {
      setSending(false)
    }
  }

  return {
    acceptTalent,
    body,
    composeOpen,
    diagnosticCode,
    error,
    expandedId,
    folder,
    loadMore,
    loading,
    loadingMore,
    messages,
    nextCursor,
    notice,
    recipientType,
    recipientValue,
    removeMessage,
    sendMail,
    sending,
    setBody,
    setComposeOpen,
    setFolder,
    setRecipientType,
    setRecipientValue,
    setTalentId,
    setTitle,
    talentId,
    talents,
    title,
    toggleMessage,
    unreadCount,
  }
}
