/**
 * Purpose: Render expandable mailbox messages and their attachments.
 * Owner: mod-pages/mailbox
 * Responsibility: Mail-list presentation only; loading and mutations remain in the mailbox page.
 */

import Image from 'next/image'

import type { PlayerMailFolder, PlayerMailMessageView } from '@/core/player-content/player-content-contract'

import styles from './Mailbox.module.css'

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

interface MailboxMessageListProps {
  expandedId: string | null
  folder: PlayerMailFolder
  messages: PlayerMailMessageView[]
  onAcceptTalent: (messageId: string) => void
  onDeleteMessage: (messageId: string) => void
  onToggleMessage: (message: PlayerMailMessageView) => void
}

export function MailboxMessageList({
  expandedId,
  folder,
  messages,
  onAcceptTalent,
  onDeleteMessage,
  onToggleMessage,
}: MailboxMessageListProps) {
  return (
    <ul className={styles.mailList}>
      {messages.map((message) => {
        const expanded = expandedId === message.id
        return (
          <li className={styles.mail} data-unread={folder === 'inbox' && message.readAt === null} key={message.id}>
            <button type="button" className={styles.mailSummary} onClick={() => onToggleMessage(message)} aria-expanded={expanded}>
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
                      <button type="button" onClick={() => onAcceptTalent(message.id)}>接受天赋</button>
                    ) : <small>{message.talent.status === 'accepted' ? '已接受' : '已退回'}</small>}
                  </div>
                ) : null}
                <div className={styles.mailActions}>
                  <small>{expiryText(message.expiresAt)}</small>
                  {folder === 'inbox' ? <button type="button" onClick={() => onDeleteMessage(message.id)}>删除</button> : null}
                </div>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
