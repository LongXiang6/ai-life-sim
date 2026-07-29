'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

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
import { useMythicLibraryStore } from '@/mods/mod-character'
import { syncAccountNow } from '@/mods/mod-pages/account-cloud-api'
import { BottomActionBar } from '@/mods/mod-ui'

import styles from './Mailbox.module.css'

type RecipientType = 'account' | 'diagnostic'

function formatTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function expiryText(value: number): string {
  const remaining = Math.max(0, value - Date.now())
  const hours = Math.ceil(remaining / (60 * 60 * 1000))
  return hours >= 24 ? `${Math.ceil(hours / 24)} 天后到期` : `${hours} 小时后到期`
}

export default function MailboxPage() {
  const router = useRouter()
  const accountStatus = useAccountClientStore((state) => state.status)
  const talents = useMythicLibraryStore((state) => state.patterns)
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

  const applyServerState = (page: PlayerMailPage) => {
    if (page.accountRevision !== null) {
      useAccountClientStore.getState().setRevision(page.accountRevision)
    }
    const removeIds = new Set(page.talentReconciliation.removeTalentIds)
    for (const pattern of useMythicLibraryStore.getState().patterns) {
      if (removeIds.has(pattern.id)) useMythicLibraryStore.getState().removePattern(pattern.id)
    }
    for (const talent of page.talentReconciliation.ownedTalents) {
      try {
        useMythicLibraryStore.getState().addPattern(talent)
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : '轮回天赋暂时无法入库')
      }
    }
    setUnreadCount(page.unreadCount)
    setDiagnosticCode(page.diagnosticCode)
  }

  const reload = async (targetFolder = folder) => {
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
      setError(reason instanceof Error ? reason.message : '邮箱读取失败')
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (accountStatus === 'loading') return
    const timer = window.setTimeout(() => { void reload(folder) }, 0)
    return () => window.clearTimeout(timer)
    // reload is intentionally scoped to the selected folder and account transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountStatus, folder])

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
      setError(reason instanceof Error ? reason.message : '更多邮件读取失败')
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
      const failure = reason instanceof Error ? reason.message : '邮件状态更新失败'
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
      const failure = reason instanceof Error ? reason.message : '邮件删除失败'
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
      if (result.acceptedTalent) useMythicLibraryStore.getState().addPattern(result.acceptedTalent)
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
      const failure = reason instanceof Error ? reason.message : '轮回天赋领取失败'
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
      if (selectedTalent) useMythicLibraryStore.getState().removePattern(selectedTalent.id)
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
      const failure = reason instanceof Error ? reason.message : '邮件发送失败'
      const page = await reload('sent')
      setFolder('sent')
      if (page?.messages.some((message) => message.id === requestId)) completeSend()
      else if (page) setNotice('连接中断，发件箱已重新同步，请核对后重试')
      else setError(failure)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={`${styles.page} final-flow-page-surface`}>
            <div className={styles.screen}>
              <div className={styles.meta} aria-hidden="true"><span>AI LIFE SIM · 命书</span><span>附 · 邮箱</span></div>
              <header className={styles.header}>
                <div><h1>邮箱</h1><p>{diagnosticCode ? `我的诊断编号 ${diagnosticCode}` : '人生来信'}</p></div>
                <button type="button" className={styles.composeButton} onClick={() => setComposeOpen((open) => !open)}>
                  {composeOpen ? '收起' : '写邮件'}
                </button>
              </header>

              {composeOpen ? (
                <section className={styles.composer} aria-label="写邮件">
                  <div className={styles.recipientMode} role="group" aria-label="收件人类型">
                    <button type="button" data-active={recipientType === 'account'} onClick={() => setRecipientType('account')}>账号</button>
                    <button type="button" data-active={recipientType === 'diagnostic'} onClick={() => setRecipientType('diagnostic')}>诊断编号</button>
                  </div>
                  <label><span>收件人</span><input value={recipientValue} onChange={(event) => setRecipientValue(event.target.value)} /></label>
                  <label><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
                  <label><span>正文</span><textarea value={body} onChange={(event) => setBody(event.target.value)} /></label>
                  <label>
                    <span>轮回天赋</span>
                    <select value={talentId} onChange={(event) => setTalentId(event.target.value)}>
                      <option value="">不附带</option>
                      {talents.map((talent) => <option value={talent.id} key={talent.id}>{talent.name}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.sendButton}
                    disabled={sending || !recipientValue.trim() || !title || !body}
                    onClick={() => void sendMail()}
                  >
                    {sending ? '发送中...' : '发送'}
                  </button>
                </section>
              ) : null}

              <nav className={styles.folderTabs} aria-label="邮箱分类">
                <button type="button" data-active={folder === 'inbox'} onClick={() => setFolder('inbox')}>
                  收件箱{unreadCount > 0 ? ` (${unreadCount})` : ''}
                </button>
                <button type="button" data-active={folder === 'sent'} onClick={() => setFolder('sent')}>已发送</button>
              </nav>

              <section className={styles.content} aria-label={folder === 'inbox' ? '收件箱' : '已发送'}>
                {loading ? <p className={styles.status}>正在收取邮件...</p> : null}
                {!loading && error ? <p className={`${styles.feedback} ${styles.error}`} role="alert">{error}</p> : null}
                {!loading && notice ? <p className={styles.feedback} role="status">{notice}</p> : null}
                {!loading && messages.length === 0 ? <p className={styles.status}>{folder === 'inbox' ? '收件箱暂时为空' : '还没有发送记录'}</p> : null}
                {!loading && messages.length > 0 ? (
                  <ul className={styles.mailList}>
                    {messages.map((message) => {
                      const expanded = expandedId === message.id
                      return (
                        <li className={styles.mail} data-unread={folder === 'inbox' && message.readAt === null} key={message.id}>
                          <button type="button" className={styles.mailSummary} onClick={() => void toggleMessage(message)} aria-expanded={expanded}>
                            <span className={styles.mailIdentity}>{folder === 'inbox' ? message.senderLabel : `至 ${message.recipientLabel}`}</span>
                            <strong>{message.title}</strong>
                            <span className={styles.mailPreview}>{message.body}</span>
                            <span className={styles.mailTime}>{formatTime(message.createdAt)}</span>
                            {folder === 'inbox' && message.readAt === null ? <span className={styles.unreadDot} aria-label="未读" /> : null}
                          </button>
                          {expanded ? (
                            <div className={styles.mailBody}>
                              <p>{message.body}</p>
                              {message.assetUrl ? <Image className={styles.portrait} src={message.assetUrl} alt={message.title} width={720} height={720} unoptimized /> : null}
                              {message.talent ? (
                                <div className={styles.talentAttachment}>
                                  <div><small>轮回天赋</small><strong>{message.talent.talent.name}</strong></div>
                                  <p>{message.talent.talent.concept}</p>
                                  <p>{message.talent.talent.effect}</p>
                                  {folder === 'inbox' && message.talent.status === 'pending' ? (
                                    <button type="button" onClick={() => void acceptTalent(message.id)}>接受天赋</button>
                                  ) : <small>{message.talent.status === 'accepted' ? '已接受' : '已退回'}</small>}
                                </div>
                              ) : null}
                              <div className={styles.mailActions}>
                                <small>{expiryText(message.expiresAt)}</small>
                                {folder === 'inbox' ? <button type="button" onClick={() => void removeMessage(message.id)}>删除</button> : null}
                              </div>
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
                {!loading && nextCursor ? (
                  <button type="button" className={styles.moreButton} disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? '读取中...' : '加载更多'}
                  </button>
                ) : null}
              </section>
            </div>
            <BottomActionBar
              onBack={() => router.back()}
              backTitle="返回上一页"
              onConfirm={() => router.push('/welcome')}
              confirmNumber="00"
              confirmText="返回欢迎界面"
              confirmDescription="回到欢迎界面"
              confirmTitle="返回欢迎界面"
            />
          </main>
        </div>
      </div>
    </div>
  )
}
