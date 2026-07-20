'use client'

/**
 * @module feedback-page
 * @description 玩家反馈与建议页面
 * @mod mod-pages
 */

import { useEffect, useState, type FormEvent } from 'react'

import { useRouter } from 'next/navigation'

import { logger } from '@/core/logger/client-logger'
import { ensureDiagnosticPlayerCode } from '@/core/logger/diagnostic-player-code-client'

import type { FeedbackCategory, PlayerFeedbackEnvelope } from '@/core/logger/feedback-contract'

import { buildFeedbackDiagnostics } from './build-feedback-diagnostics'
import styles from './Feedback.module.css'

const CATEGORY_OPTIONS: Array<{ id: FeedbackCategory; label: string; description: string }> = [
  { id: 'bug', label: '问题反馈', description: '错误、异常或无法继续' },
  { id: 'suggestion', label: '功能建议', description: '希望增加或调整的内容' },
  { id: 'experience', label: '体验意见', description: '叙事、界面或操作感受' },
  { id: 'other', label: '其他', description: '不属于以上分类' },
]

interface SubmitResult {
  ok?: boolean
  feedbackId?: string
  error?: string
}

export default function FeedbackPage() {
  const router = useRouter()
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [diagnosticCode, setDiagnosticCode] = useState<string | null>(null)
  const [diagnosticCodeError, setDiagnosticCodeError] = useState(false)
  const [diagnosticCodeCopied, setDiagnosticCodeCopied] = useState(false)

  const copyText = async (value: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      return copied
    }
  }

  const copyDiagnosticCode = async () => {
    if (!diagnosticCode) return
    const copied = await copyText(diagnosticCode)
    setDiagnosticCodeCopied(copied)
  }

  const retryDiagnosticCode = async () => {
    setDiagnosticCodeError(false)
    const code = await ensureDiagnosticPlayerCode()
    setDiagnosticCode(code ?? null)
    setDiagnosticCodeError(!code)
  }

  useEffect(() => {
    let cancelled = false
    void ensureDiagnosticPlayerCode().then((code) => {
      if (cancelled) return
      setDiagnosticCode(code ?? null)
      setDiagnosticCodeError(!code)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && consent && !submitting

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    setFeedbackId(null)
    logger.action('feedback', 'feedback-submit-started', { category })

    try {
      const diagnostics = await buildFeedbackDiagnostics()
      const envelope: PlayerFeedbackEnvelope = {
        category,
        subject: subject.trim(),
        message: message.trim(),
        submittedAt: Date.now(),
        consent: true,
        diagnostics,
      }
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      })
      const result = await response.json().catch(() => ({})) as SubmitResult
      if (!response.ok || !result.ok || !result.feedbackId) {
        throw new Error(result.error || '反馈提交失败，请稍后重试')
      }
      setFeedbackId(result.feedbackId)
      setSubject('')
      setMessage('')
      setConsent(false)
      logger.action('feedback', 'feedback-submit-completed', { category, feedbackId: result.feedbackId })
    } catch (submitError) {
      const messageText = submitError instanceof Error ? submitError.message : '反馈提交失败，请稍后重试'
      setError(messageText)
      logger.error('feedback', '反馈诊断包提交失败', submitError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.runningHead} aria-hidden="true">
        <span>AI LIFE SIM · 命书</span>
        <span>附 / 反馈</span>
      </div>
      <span className={styles.spine} aria-hidden="true" />

      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => router.back()}>
          <span aria-hidden="true">←</span>
          返回
        </button>
        <p className={styles.eyebrow}>诊断回执</p>
        <h1>反馈与建议</h1>
        <p className={styles.intro}>描述你遇到的问题或希望改进的地方。提交成功后会生成反馈编号。</p>
      </header>

      <section className={styles.diagnosticIdentity} aria-live="polite">
        <div>
          <small>此浏览器的诊断编号</small>
          <strong>{diagnosticCode ?? (diagnosticCodeError ? '暂不可用' : '分配中')}</strong>
          <p>出现问题时提供这个六位编号和大致情况，即可定位同期服务器日志。</p>
        </div>
        {diagnosticCode ? (
          <button type="button" onClick={() => { void copyDiagnosticCode() }}>
            {diagnosticCodeCopied ? '已复制' : '复制编号'}
          </button>
        ) : diagnosticCodeError ? (
          <button type="button" onClick={() => { void retryDiagnosticCode() }}>
            重新获取
          </button>
        ) : null}
      </section>

      <form className={styles.form} onSubmit={handleSubmit}>
        <fieldset className={styles.categoryFieldset} disabled={submitting}>
          <legend>反馈类型</legend>
          <div className={styles.categoryGrid}>
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={category === option.id ? styles.categoryActive : ''}
                aria-pressed={category === option.id}
                onClick={() => setCategory(option.id)}
              >
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <label className={styles.field}>
          <span>简要标题</span>
          <input
            value={subject}
            disabled={submitting}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="例如：推进故事后页面没有响应"
            autoComplete="off"
          />
        </label>

        <label className={styles.field}>
          <span>详细内容</span>
          <textarea
            value={message}
            disabled={submitting}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="请写下发生了什么、你当时进行了哪些操作，以及你希望看到的结果。"
            rows={8}
          />
        </label>

        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={consent}
            disabled={submitting}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            我了解提交后会打包上传诊断日志，其中可能包含当前游戏配置、运行状态和近期完整故事；不包含 API Key、认证信息或设备序列号。
          </span>
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {feedbackId && (
          <section className={styles.success} role="status">
            <small>反馈已完整保存</small>
            <strong>{feedbackId}</strong>
            <p>排查问题时可提供此编号。</p>
            <button type="button" onClick={() => { void copyText(feedbackId) }}>复制编号</button>
          </section>
        )}

        <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
          <span>{submitting ? '正在打包并上传诊断日志' : '提交反馈'}</span>
          <small>{submitting ? '请保持页面开启，完整保存后会返回编号' : '反馈正文与诊断包将整包保存'}</small>
        </button>
      </form>
    </main>
  )
}
