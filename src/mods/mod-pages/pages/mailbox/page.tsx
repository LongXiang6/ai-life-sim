'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { useAccountClientStore } from '@/core/account/account-client-store'
import { fetchPlayerMail, markPlayerMailRead } from '@/core/player-content/player-content-client'
import type { PlayerMailMessageView } from '@/core/player-content/player-content-contract'
import { BottomActionBar } from '@/mods/mod-ui'

import styles from './Mailbox.module.css'

export default function MailboxPage() {
  const router = useRouter()
  const accountStatus = useAccountClientStore((state) => state.status)
  const [messages, setMessages] = useState<PlayerMailMessageView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (accountStatus !== 'authenticated') return () => { active = false }
    queueMicrotask(() => { if (active) setLoading(true) })
    void fetchPlayerMail()
      .then((result) => { if (active) setMessages(result) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '邮箱读取失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accountStatus])

  const openMessage = async (message: PlayerMailMessageView) => {
    if (message.status !== 'ready' || message.readAt !== null) return
    try {
      const updated = await markPlayerMailRead(message.id)
      if (updated) {
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, readAt: Date.now() } : item))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '邮件状态更新失败')
    }
  }

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={`${styles.page} final-flow-page-surface`}>
            <div className={styles.screen}>
              <div className={styles.meta} aria-hidden="true"><span>AI LIFE SIM · 命书</span><span>附 · 邮箱</span></div>
              <header className={styles.header}><h1>邮箱</h1><p>人生来信</p></header>
              <section className={styles.content} aria-label="邮箱">
                {accountStatus === 'loading' ? <p className={styles.status}>正在确认账号...</p> : null}
                {accountStatus === 'guest' ? (
                  <div className={styles.status}><div><p>登录后查看邮箱</p><button type="button" className={styles.loginAction} onClick={() => router.push('/account')}>前往登录</button></div></div>
                ) : null}
                {accountStatus === 'authenticated' && loading ? <p className={styles.status}>正在收取邮件...</p> : null}
                {accountStatus === 'authenticated' && !loading && error ? <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p> : null}
                {accountStatus === 'authenticated' && !loading && !error && messages.length === 0 ? <p className={styles.status}>邮箱暂时为空</p> : null}
                {accountStatus === 'authenticated' && !loading && messages.length > 0 ? (
                  <ul className={styles.mailList}>
                    {messages.map((message) => (
                      <li key={message.id}>
                        <button type="button" className={styles.mail} data-unread={message.readAt === null} onClick={() => void openMessage(message)}>
                          <span className={styles.mailCopy}>
                            <strong>{message.title}</strong>
                            <small>{new Date(message.createdAt).toLocaleString('zh-CN')}</small>
                            <p>{message.body}</p>
                            {message.status !== 'ready' ? <small>{message.status === 'failed' ? '生成失败 · 将自动重试' : '生成中 · 完成后自动更新'}</small> : null}
                            {message.assetUrl ? <Image className={styles.portrait} src={message.assetUrl} alt={message.title} width={720} height={720} unoptimized /> : null}
                          </span>
                          {message.readAt === null ? <span className={styles.unreadDot} aria-label="未读" /> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
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
