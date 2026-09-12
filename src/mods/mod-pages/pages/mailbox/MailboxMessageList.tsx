/**
 * Purpose: Render expandable mailbox messages and their attachments.
 * Owner: mod-pages/mailbox
 * Responsibility: Mail-list presentation only; loading and mutations remain in the mailbox page.
 */

import Image from 'next/image'

import type {
  PlayerMailFolder,
  PlayerMailMessageView,
  PlayerMailRewardView,
} from '@/core/player-content/player-content-contract'

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

const rewardStatusLabels: Record<PlayerMailRewardView['claimStatus'], string> = {
  available: '可领取',
  claimed: '已领取',
  expired: '已过期',
  'not-started': '尚未开始',
  'not-eligible': '不符合领取资格',
  'login-required': '登录后可领取',
}

const rewardModeLabels: Record<PlayerMailRewardView['eligibilityMode'], string> = {
  'login-window': '有效期内登录过',
  'registered-account': '注册账号',
}

const categoryLabels: Record<string, string> = {
  action: '行动',
  cognition: '认知',
  expression: '表达',
  stewardship: '经营',
  misc: '杂类',
}

const rarityLabels: Record<string, string> = {
  common: '普通',
  fine: '良好',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
  mythic: '神话',
}

const attributeLabels: Record<string, string> = {
  mind: '心智',
  physique: '体魄',
  charisma: '魅力',
  familyBackground: '家境',
  luck: '气运',
}

function formatRewardWindow(reward: PlayerMailRewardView): string {
  return `${formatTime(reward.startsAt)} - ${formatTime(reward.endsAt)}`
}

function formatAttributeBonuses(reward: PlayerMailRewardView): string[] {
  return Object.entries(reward.talent.attrBonus)
    .filter(([, value]) => typeof value === 'number' && value !== 0)
    .map(([key, value]) => `${attributeLabels[key] ?? key} ${value! > 0 ? '+' : ''}${value}`)
}

interface MailboxMessageListProps {
  expandedId: string | null
  folder: PlayerMailFolder
  messages: PlayerMailMessageView[]
  onAcceptTalent: (messageId: string) => void
  onClaimReward: (messageId: string) => void
  claimingRewardId: string | null
  onDeleteMessage: (messageId: string) => void
  onToggleMessage: (message: PlayerMailMessageView) => void
}

export function MailboxMessageList({
  expandedId,
  folder,
  messages,
  onAcceptTalent,
  onClaimReward,
  claimingRewardId,
  onDeleteMessage,
  onToggleMessage,
}: MailboxMessageListProps) {
  return (
    <ul className={styles.mailList}>
      {messages.map((message) => {
        const expanded = expandedId === message.id
        const rewardAttributeBonuses = message.reward ? formatAttributeBonuses(message.reward) : []
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
                    <p>{message.talent.talent.description}</p>
                    <p>{message.talent.talent.effect}</p>
                    {folder === 'inbox' && message.talent.status === 'pending' ? (
                      <button type="button" onClick={() => onAcceptTalent(message.id)}>接受天赋</button>
                    ) : <small>{message.talent.status === 'accepted' ? '已接受' : '已退回'}</small>}
                  </div>
                ) : null}
                {message.reward ? (
                  <div className={`${styles.talentAttachment} ${styles.rewardAttachment}`}>
                    <div className={styles.rewardHeading}>
                      <div>
                        <small>🎁 开发者礼包</small>
                        <strong>{message.reward.talent.name}</strong>
                      </div>
                      <span className={styles.rewardStatus} data-status={message.reward.claimStatus}>
                        {rewardStatusLabels[message.reward.claimStatus]}
                      </span>
                    </div>
                    <div className={styles.rewardTags}>
                      <span>{categoryLabels[message.reward.talent.category] ?? message.reward.talent.category}</span>
                      <span>{rarityLabels[message.reward.talent.rarity] ?? message.reward.talent.rarity}</span>
                    </div>
                    <p>{message.reward.talent.description}</p>
                    <p>{message.reward.talent.effect}</p>
                    {rewardAttributeBonuses.length > 0 ? (
                      <p className={styles.rewardAttributes}>
                        {rewardAttributeBonuses.join(' · ')}
                      </p>
                    ) : null}
                    <div className={styles.rewardMeta}>
                      <small>{rewardModeLabels[message.reward.eligibilityMode]}</small>
                      <small>{formatRewardWindow(message.reward)}</small>
                    </div>
                    {folder === 'inbox' && message.reward.claimStatus === 'available' ? (
                      <button
                        type="button"
                        disabled={claimingRewardId === message.id}
                        onClick={() => onClaimReward(message.id)}
                      >
                        {claimingRewardId === message.id ? '领取中...' : '领取礼包天赋'}
                      </button>
                    ) : null}
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
