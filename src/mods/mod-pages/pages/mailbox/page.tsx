/**
 * Purpose: Render the mailbox workspace and connect navigation to mailbox commands.
 * Owner: mod-pages/mailbox
 * Responsibility: Page composition only; mailbox state and mutations live in useMailboxCommands.
 */

'use client'

import { useRouter } from 'next/navigation'
import { BottomActionBar, FlowRunningHead } from '@/mods/mod-ui'

import { MailboxMessageList } from './MailboxMessageList'
import styles from './Mailbox.module.css'
import { useMailboxCommands } from './useMailboxCommands'

export default function MailboxPage() {
  const router = useRouter()
  const {
    acceptTalent,
    body,
    claimReward,
    claimingRewardId,
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
  } = useMailboxCommands()

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={`${styles.page} final-flow-page-surface`}>
            <div className={styles.screen}>
              <FlowRunningHead stepLabel="附 · 邮箱" />
              <header className={styles.header}>
                <div><h1>✉️ 邮箱</h1><p>{diagnosticCode ? `我的诊断编号 ${diagnosticCode}` : '人生来信'}</p></div>
                <button type="button" className={styles.composeButton} onClick={() => setComposeOpen((open) => !open)}>
                  {composeOpen ? '收起' : '✍️ 写邮件'}
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
                  📥 收件箱{unreadCount > 0 ? ` (${unreadCount})` : ''}
                </button>
                <button type="button" data-active={folder === 'sent'} onClick={() => setFolder('sent')}>📤 已发送</button>
              </nav>

              <section className={styles.content} aria-label={folder === 'inbox' ? '收件箱' : '已发送'}>
                {loading ? <p className={styles.status}>正在收取邮件...</p> : null}
                {!loading && error ? <p className={`${styles.feedback} ${styles.error}`} role="alert">{error}</p> : null}
                {!loading && notice ? <p className={styles.feedback} role="status">{notice}</p> : null}
                {!loading && messages.length === 0 ? <p className={styles.status}>{folder === 'inbox' ? '收件箱暂时为空' : '还没有发送记录'}</p> : null}
                {!loading && messages.length > 0 ? (
                  <MailboxMessageList
                    expandedId={expandedId}
                    folder={folder}
                    messages={messages}
                    onAcceptTalent={(messageId) => void acceptTalent(messageId)}
                    onClaimReward={(messageId) => void claimReward(messageId)}
                    claimingRewardId={claimingRewardId}
                    onDeleteMessage={(messageId) => void removeMessage(messageId)}
                    onToggleMessage={(message) => void toggleMessage(message)}
                  />
                ) : null}
                {!loading && nextCursor ? (
                  <button type="button" className={styles.moreButton} disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? '读取中...' : '加载更多'}
                  </button>
                ) : null}
              </section>
            </div>
          </main>
          <BottomActionBar
            onBack={() => router.back()}
            backTitle="返回上一页"
            backDescription="退回上一界面"
            onConfirm={() => router.push('/welcome')}
            confirmNumber="00"
            confirmText="返回欢迎界面"
            confirmDescription="回到欢迎界面"
            confirmTitle="返回欢迎界面"
          />
        </div>
      </div>
    </div>
  )
}
