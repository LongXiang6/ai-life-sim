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

  const canSubmit = message.trim().length > 0 && consent && !submitting

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    setFeedbackId(null)
    logger.action('feedback', 'feedback-submit-started', { category })

    try {
      const diagnostics = await buildFeedbackDiagnostics()
      const categoryLabel = CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? '玩家反馈'
      const envelope: PlayerFeedbackEnvelope = {
        category,
        subject: `${categoryLabel}：${message.trim().split(/\r?\n/u).find((line) => line.trim()) ?? message.trim()}`,
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
    <div className="final-flow-frame">
      <div className="final-flow-design-fit">
        <div className="final-flow-design-canvas">
          <main className={styles.page}>
            <div className={styles.screen}>
              <header className={styles.header}>
                <div className={styles.meta} aria-hidden="true"><span>AI LIFE SIM · 命书</span><span>附 · 反馈</span></div>
                <h1>反馈与建议</h1>
              </header>

              <form className={styles.form} onSubmit={handleSubmit}>
                <section className={styles.panel}>
                  <div className={styles.feedbackGrid}>
                    <label className={styles.field}>
                      <span><span className="semantic-emoji" aria-hidden="true">💬</span>类型</span>
                      <select value={category} disabled={submitting} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>
                        {CATEGORY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span><span className="semantic-emoji" aria-hidden="true">✍️</span>内容</span>
                      <textarea
                        value={message}
                        disabled={submitting}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="描述问题或建议"
                        rows={8}
                      />
                    </label>
                  </div>
                </section>

                <section className={styles.panel}>
                  <label className={styles.dataRow}>
                    <span><strong><span className="semantic-emoji" aria-hidden="true">🔎</span>附带诊断</strong><small>不含密钥与密码</small></span>
                    <span className={styles.toggle}><input type="checkbox" checked={consent} disabled={submitting} onChange={(event) => setConsent(event.target.checked)} /><i aria-hidden="true" /></span>
                  </label>
                  <div className={styles.dataRow} aria-live="polite">
                    <span><strong><span className="semantic-emoji" aria-hidden="true">🏷️</span>玩家编号</strong><small>用于查询近期记录</small></span>
                    {diagnosticCode ? (
                      <button type="button" className={styles.valueAction} onClick={() => { void copyDiagnosticCode() }}>{diagnosticCodeCopied ? '已复制' : diagnosticCode}</button>
                    ) : diagnosticCodeError ? (
                      <button type="button" className={styles.valueAction} onClick={() => { void retryDiagnosticCode() }}>重新获取</button>
                    ) : <span className={styles.value}>分配中</span>}
                  </div>
                </section>

                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                {feedbackId ? (
                  <section className={styles.success} role="status">
                    <span>反馈已完整保存</span><strong>{feedbackId}</strong><button type="button" onClick={() => { void copyText(feedbackId) }}>复制编号</button>
                  </section>
                ) : null}

                <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
                  {submitting ? '正在提交' : '提交反馈'}
                </button>
              </form>
            </div>

            <footer className={styles.footer} data-flow-bottom-bar>
              <button type="button" className={styles.backButton} onClick={() => router.back()} aria-label="返回上一页">←</button>
              <button type="button" className={styles.returnButton} onClick={() => router.push('/welcome')}>
                <span className={styles.returnNumber}>00</span><span className={styles.returnCopy}><strong>返回</strong><small>回到欢迎界面</small></span><span className={styles.returnArrow} aria-hidden="true">→</span>
              </button>
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}
