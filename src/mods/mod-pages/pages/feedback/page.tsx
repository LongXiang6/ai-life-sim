/** Purpose: Render the finalized player feedback form. Owner: mod-pages. Responsibility: Feedback-page interaction and public submission wiring only. */

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
import { PlayerFeedbackList } from './PlayerFeedbackList'
import styles from './Feedback.module.css'

const CATEGORY_OPTIONS: Array<{ id: FeedbackCategory; icon: string; label: string; description: string; placeholder: string; guidance: string }> = [
  { id: 'bug', icon: '⚠️', label: '问题反馈', description: '错误、异常或无法继续', placeholder: '发生了什么？当时在做什么？期待的结果是？', guidance: '问题出现的位置与复现方式' },
  { id: 'suggestion', icon: '✨', label: '功能建议', description: '希望增加或调整的内容', placeholder: '希望增加或调整什么？想解决什么问题？', guidance: '期望行为与价值' },
  { id: 'experience', icon: '🌱', label: '体验意见', description: '叙事、界面或操作感受', placeholder: '哪个环节的感受？为什么这样觉得？', guidance: '场景与原因' },
  { id: 'other', icon: '📌', label: '其他', description: '不属于以上分类', placeholder: '描述你想说的内容', guidance: '自由描述' },
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [diagnosticCode, setDiagnosticCode] = useState<string | null>(null)
  const [diagnosticCodeError, setDiagnosticCodeError] = useState(false)
  const [diagnosticCodeCopied, setDiagnosticCodeCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'submit' | 'player'>('submit')

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

  const loadDiagnosticCode = async () => {
    setDiagnosticCodeError(false)
    setDiagnosticCodeCopied(false)
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

  const canSubmit = message.trim().length > 0 && !submitting
  const categoryOption = CATEGORY_OPTIONS.find((option) => option.id === category) ?? CATEGORY_OPTIONS[0]

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    setFeedbackId(null)

    try {
      const diagnostics = await buildFeedbackDiagnostics()
      const categoryLabel = CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? '玩家反馈'
      const envelope: PlayerFeedbackEnvelope = {
        category,
        subject: `${categoryLabel}：${message.trim().split(/\r?\n/u).find((line) => line.trim()) ?? message.trim()}`,
        message: message.trim(),
        submittedAt: Date.now(),
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
    } catch (submitError) {
      const messageText = submitError instanceof Error ? submitError.message : '反馈提交失败，请稍后重试'
      setError(messageText)
      logger.error('feedback', '反馈提交失败', submitError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={`${styles.page} final-flow-page-surface`}>
            <div className={styles.screen}>
              <div className={styles.meta} aria-hidden="true"><span>AI LIFE SIM · 命书</span><span>附 · 反馈</span></div>
              <header className={styles.header}>
                <h1><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">💬</span>反馈与建议</h1>
                <p>问题、建议与体验意见，都会完整送达。</p>
              </header>

              <div className={styles.tabList} role="tablist" aria-label="反馈页面选项">
                <button type="button" role="tab" aria-selected={activeTab === 'submit'} className={activeTab === 'submit' ? styles.tabButtonActive : styles.tabButton} onClick={() => setActiveTab('submit')}>说明</button>
                <button type="button" role="tab" aria-selected={activeTab === 'player'} className={activeTab === 'player' ? styles.tabButtonActive : styles.tabButton} onClick={() => setActiveTab('player')}>玩家反馈</button>
              </div>

              {activeTab === 'player' ? <div className={styles.content}><PlayerFeedbackList /></div> : <form className={`${styles.content} ${styles.form}`} onSubmit={handleSubmit}>
                <p className={styles.introCopy}>反馈会附上最近 20 轮叙事与运行诊断，方便准确定位问题。</p>
                <section className={styles.section}>
                  <div className={styles.sectionLabel}><h3><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">📋</span>反馈类型</h3><span>四选一</span></div>
                  <div className={styles.sectionCard}>
                    <div className={styles.categoryGrid} role="group" aria-label="反馈类型">
                      {CATEGORY_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={styles.categoryButton}
                          aria-pressed={category === option.id}
                          disabled={submitting}
                          onClick={() => setCategory(option.id)}
                        >
                          <span className={styles.categoryTitle}><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">{option.icon}</span>{option.label}</span>
                          <span className={styles.categoryDescription}>{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className={styles.section}>
                  <div className={styles.sectionLabel}><h3><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">✍️</span>反馈内容</h3><span>必填</span></div>
                  <div className={styles.sectionCard}>
                    <textarea
                      className={styles.styleInput}
                      value={message}
                      disabled={submitting}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder={categoryOption.placeholder}
                      rows={7}
                    />
                    <div className={styles.styleMeta}><span>{message.length} 字</span><span>提示：<em>{categoryOption.guidance}</em></span></div>
                  </div>
                </section>

                <section className={styles.section}>
                  <div className={styles.sectionLabel}><h3><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">🔐</span>六位诊断编号</h3><span>便于定位记录</span></div>
                  <div className={styles.sectionCard}>
                    <div className={styles.dataRow} aria-live="polite">
                      <span><strong>{diagnosticCode ?? '分配中'}</strong><small>反馈后可凭此编号查询近期记录</small></span>
                    {diagnosticCode ? (
                      <button
                        type="button"
                        className={styles.valueAction}
                        aria-label={`复制诊断编号 ${diagnosticCode}`}
                        onClick={() => {
                          void copyText(diagnosticCode).then(setDiagnosticCodeCopied)
                        }}
                      >
                        {diagnosticCodeCopied ? '已复制' : '复制编号'}
                      </button>
                    ) : diagnosticCodeError ? (
                      <button type="button" className={styles.valueAction} onClick={() => { void loadDiagnosticCode() }}>重新获取</button>
                    ) : <span className={styles.value}>分配中</span>}
                    </div>
                  </div>
                </section>

                <p className={styles.disclaimer}>提交即代表你已了解：本地存档不会上传；诊断记录在服务器限期保存 30 天，仅用于定位问题；除你主动提交的反馈外，服务器不会保存你的故事内容。</p>

                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                {feedbackId ? (
                  <section className={styles.success} role="status">
                    <span>反馈已完整保存</span><strong>{feedbackId}</strong><button type="button" onClick={() => { void copyText(feedbackId) }}>复制编号</button>
                  </section>
                ) : null}

                <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
                  {submitting ? '正在提交' : '提交反馈'}
                </button>
              </form>}
            </div>

            <footer className={styles.bottomBar} data-flow-bottom-bar>
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
