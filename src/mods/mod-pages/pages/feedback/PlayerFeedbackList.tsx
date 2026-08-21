/**
 * Purpose: Render the read-only player-feedback list and current status markers.
 * Owner: mod-pages/feedback
 * Responsibility: Fetch and present the public feedback projection only.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'

import type {
  FeedbackCategory,
  FeedbackStatus,
  PlayerFeedbackListItem,
  PlayerFeedbackListResponse,
} from '@/core/logger/feedback-contract'

import styles from './PlayerFeedbackList.module.css'

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: '问题反馈',
  suggestion: '功能建议',
  experience: '体验意见',
  other: '其他',
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: '待处理',
  in_progress: '处理中',
  resolved: '已完成',
  rejected: '已拒绝',
  duplicate: '重复反馈',
  reopened: '已重新打开',
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return '尚无状态更新'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

async function requestFeedbackPage(offset: number): Promise<PlayerFeedbackListResponse> {
  const response = await fetch('/api/feedback?limit=20&offset=' + offset, { cache: 'no-store' })
  const result = await response.json().catch(() => ({})) as Partial<PlayerFeedbackListResponse> & { error?: string }
  if (!response.ok || !Array.isArray(result.items)) throw new Error(result.error || '反馈列表暂时不可用')
  return result as PlayerFeedbackListResponse
}

export function PlayerFeedbackList() {
  const [items, setItems] = useState<PlayerFeedbackListItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const result = await requestFeedbackPage(nextOffset)
      setItems((previous) => append ? [...previous, ...(result.items ?? [])] : (result.items ?? []))
      setTotal(typeof result.total === 'number' ? result.total : 0)
      setOffset(nextOffset)
      setHasMore(result.hasMore === true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '反馈列表暂时不可用')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void requestFeedbackPage(0).then((result) => {
      if (!active) return
      setItems(result.items)
      setTotal(result.total)
      setOffset(0)
      setHasMore(result.hasMore)
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : '反馈列表暂时不可用')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return (
    <div className={styles.feedbackList} aria-live="polite">
      <div className={styles.listToolbar}>
        <span>共 {total} 条反馈</span>
        <button type="button" className={styles.refreshButton} onClick={() => { void load(0, false) }} disabled={loading}>
          {loading ? '读取中' : '刷新'}
        </button>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p className={styles.emptyState}>暂时没有玩家反馈。</p> : null}
      {items.map((item) => (
        <article key={item.feedbackId} className={styles.feedbackItem}>
          <div className={styles.feedbackItemHead}>
            <span className={styles.feedbackCategory}>{CATEGORY_LABELS[item.category]}</span>
            <span className={styles.feedbackStatus + ' ' + styles['status_' + item.status]}>{STATUS_LABELS[item.status]}</span>
          </div>
          <h3>{item.subject}</h3>
          <p>{item.message}</p>
          <footer>
            <span>{item.feedbackId}</span>
            <span>{formatTime(item.submittedAt)}</span>
            <span>状态更新：{formatTime(item.statusUpdatedAt)}</span>
          </footer>
        </article>
      ))}
      {hasMore ? (
        <button type="button" className={styles.loadMoreButton} onClick={() => { void load(offset + 20, true) }} disabled={loading}>
          {loading ? '读取中' : '继续读取'}
        </button>
      ) : null}
    </div>
  )
}
