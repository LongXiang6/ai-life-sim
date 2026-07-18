'use client'

/**
 * @module SettingsTabModel.tsx
 * @description "模型设置" Tab —— 只展示真实接入运行时的 AI 行为设置
 * @mod mod-settings
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useSettingsStore } from '../store'
import type { ReasoningEffort } from '../store'
import { SettingsParamCard } from './SettingsParamCard'
import { SettingsHelpTooltip } from './SettingsHelpTooltip'

import styles from './SettingsTabModel.module.css'

const HELP_DATA: Record<string, string> = {
  'ai-talent': '开启后调用 AI 实时生成随机命格，带来完全不可预测的角色背景。关闭后从本地预设命格库中抽取，响应即时无需等待 AI。',
  thinking: '推理强度越高，AI 思考越深入但响应越慢。全局推理影响叙事等常规对话，命格生成专用推理仅在 AI 生成命格时使用。',
  'word-count': '这是每轮叙事的节奏偏好，不是硬性字数限制。文笔、代入感和完整剧情优先；篇幅越长通常消耗的 token 越多，响应时间也可能更长。',
  temperature: '控制 AI 生成文本的随机性。值越低回答越保守、越一致，值越高越有创造力但可能不稳定。推荐 0.7-1.2。',
  'pregen-rounds': '开启后只提前生成下一轮叙事，以减少下一次推进的等待。选择分支或改变时间步长后，未使用内容会被丢弃。',
}

const THINKING_OPTIONS: Array<{ value: ReasoningEffort; label: string; desc: string }> = [
  { value: 'disabled', label: '关闭', desc: '不启用推理模式，无额外 token 消耗' },
  { value: 'level-1', label: '一级', desc: '最小推理，最大约 512 tokens' },
  { value: 'level-2', label: '二级（推荐）', desc: '轻度推理，最大约 1024 tokens' },
  { value: 'level-3', label: '三级', desc: '均衡推理深度与速度，最大约 2048 tokens' },
  { value: 'level-4', label: '四级', desc: '深度推理，最大约 4096 tokens' },
  { value: 'level-5', label: '五级', desc: '强化推理，最大约 8192 tokens' },
  { value: 'level-6', label: '六级', desc: '极致推理，最大约 16384 tokens' },
]

const TALENT_THINKING_OPTIONS: Array<{ value: ReasoningEffort; label: string; desc: string }> = [
  { value: 'disabled', label: '关闭（推荐）', desc: '不启用推理模式，无额外 token 消耗' },
  { value: 'level-1', label: '一级', desc: '最小推理，最大约 512 tokens' },
  { value: 'level-2', label: '二级', desc: '轻度推理，最大约 1024 tokens' },
  { value: 'level-3', label: '三级', desc: '均衡推理深度与速度，最大约 2048 tokens' },
  { value: 'level-4', label: '四级', desc: '深度推理，最大约 4096 tokens' },
  { value: 'level-5', label: '五级', desc: '强化推理，最大约 8192 tokens' },
  { value: 'level-6', label: '六级', desc: '极致推理，最大约 16384 tokens' },
]

const WORD_COUNT_TARGET_OPTIONS = [50, 100, 150, 200, 300, 400, 500, 800, 1000, 1500]

function getAnchoredDropdownPosition(button: HTMLButtonElement, dropdownWidth: number) {
  const viewportPadding = 12
  const rect = button.getBoundingClientRect()
  const renderedWidth = Math.min(dropdownWidth, Math.max(0, window.innerWidth - viewportPadding * 2))
  const maxLeft = Math.max(viewportPadding, window.innerWidth - renderedWidth - viewportPadding)

  return {
    top: rect.bottom + 4,
    left: Math.min(Math.max(rect.left, viewportPadding), maxLeft),
  }
}

export function SettingsTabModel() {
  const {
    aiTalentGeneration, reasoningEffort, talentThinkingIntensity,
    wordCountTarget, temperature, preGenerateRounds,
    setAiTalentGeneration, setReasoningEffort, setTalentThinkingIntensity,
    setWordCountTarget, setTemperature, setPreGenerateRounds,
  } = useSettingsStore()

  // Help tooltip state
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({})
  const toggleHelp = useCallback((key: string) => setHelpOpen(prev => ({ ...prev, [key]: !prev[key] })), [])

  // Thinking dropdowns
  const [thinkOpen, setThinkOpen] = useState(false)
  const [talentThinkOpen, setTalentThinkOpen] = useState(false)
  const thinkBtnRef = useRef<HTMLButtonElement>(null)
  const talentThinkBtnRef = useRef<HTMLButtonElement>(null)
  const [thinkPos, setThinkPos] = useState({ top: 0, left: 0 })
  const [talentThinkPos, setTalentThinkPos] = useState({ top: 0, left: 0 })

  const handleThinkToggle = useCallback(() => {
    if (thinkBtnRef.current) {
      setThinkPos(getAnchoredDropdownPosition(thinkBtnRef.current, 260))
    }
    setThinkOpen(o => !o)
    setTalentThinkOpen(false)
  }, [])
  const handleTalentThinkToggle = useCallback(() => {
    if (talentThinkBtnRef.current) {
      setTalentThinkPos(getAnchoredDropdownPosition(talentThinkBtnRef.current, 260))
    }
    setTalentThinkOpen(o => !o)
    setThinkOpen(false)
  }, [])

  const currentThinkLabel = THINKING_OPTIONS.find(o => o.value === reasoningEffort)?.label || '关闭'
  const currentTalentThinkLabel = TALENT_THINKING_OPTIONS.find(o => o.value === talentThinkingIntensity)?.label || '关闭'

  // Word count dropdown
  const [wcOpen, setWcOpen] = useState(false)
  const wcRef = useRef<HTMLButtonElement>(null)
  const [wcPos, setWcPos] = useState({ top: 0, left: 0 })

  const handleWcToggle = useCallback(() => {
    if (wcRef.current) setWcPos(getAnchoredDropdownPosition(wcRef.current, 120))
    setWcOpen(o => !o)
  }, [])

  useEffect(() => {
    if (!thinkOpen && !talentThinkOpen && !wcOpen) return

    const updateOpenDropdownPositions = () => {
      if (thinkOpen && thinkBtnRef.current) {
        setThinkPos(getAnchoredDropdownPosition(thinkBtnRef.current, 260))
      }
      if (talentThinkOpen && talentThinkBtnRef.current) {
        setTalentThinkPos(getAnchoredDropdownPosition(talentThinkBtnRef.current, 260))
      }
      if (wcOpen && wcRef.current) {
        setWcPos(getAnchoredDropdownPosition(wcRef.current, 120))
      }
    }

    window.addEventListener('resize', updateOpenDropdownPositions)
    window.addEventListener('scroll', updateOpenDropdownPositions, true)
    return () => {
      window.removeEventListener('resize', updateOpenDropdownPositions)
      window.removeEventListener('scroll', updateOpenDropdownPositions, true)
    }
  }, [thinkOpen, talentThinkOpen, wcOpen])

  const effectivePreGenerateRounds = preGenerateRounds > 0 ? 1 : 0

  return (
    <div className={styles.modelSettings}>
      <p className={styles.panelIntro}>所有修改都会自动保存，并用于后续 AI 请求。</p>

      {/* ===== AI 命格生成 ===== */}
      <section className={styles.settingsSection}>
        <div className={styles.sectionLabel}>
          <span>AI 内容</span>
          <span className={styles.sectionMeta}>生成方式</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.sectionRow}>
            <div>
              <div className={styles.controlTitle}>AI 命格生成
                <SettingsHelpTooltip helpKey="ai-talent" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} />
              </div>
              <p className={styles.descText}>
                {aiTalentGeneration ? '调用 AI 实时生成随机命格。' : '关闭后使用本地预设命格。'}
              </p>
            </div>
            <div className={styles.toggleLabel}>
              <span className={styles.toggleStatus}>
                {aiTalentGeneration ? '已开启' : '已关闭'}
              </span>
              <button type="button" role="switch" aria-checked={aiTalentGeneration} onClick={() => setAiTalentGeneration(!aiTalentGeneration)}
                title={aiTalentGeneration ? '点击关闭 AI 命格生成' : '点击开启 AI 命格生成'}
                className={styles.toggleTrack}>
                <div className={styles.toggleThumb} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 推理模式强度 ===== */}
      <section className={styles.settingsSection}>
        <div className={styles.sectionLabel}>
          <span>推理模式</span>
          <span className={styles.sectionMeta}>按用途设置</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.sectionBody}>
            <p className={styles.descParagraph}>分别控制常规叙事与 AI 命格生成的内部推理深度。
              <SettingsHelpTooltip helpKey="thinking" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} width={300} />
            </p>
            <div className={styles.flexRow}>
              <div className={styles.dropdownWrapper}>
                <span className={styles.dropdownLabel}>全局推理</span>
                <button type="button" ref={thinkBtnRef} onClick={handleThinkToggle} className={styles.dropdownBtn}
                  aria-haspopup="listbox" aria-expanded={thinkOpen} aria-controls="settings-thinking-options">
                  <span>{currentThinkLabel}</span>
                  <span className={styles.dropdownArrow}>▼</span>
                </button>
              </div>
              <div className={styles.dropdownWrapper}>
                <span className={styles.dropdownLabel}>命格生成</span>
                <button type="button" ref={talentThinkBtnRef} onClick={handleTalentThinkToggle} className={styles.dropdownBtn}
                  aria-haspopup="listbox" aria-expanded={talentThinkOpen} aria-controls="settings-talent-thinking-options">
                  <span>{currentTalentThinkLabel}</span>
                  <span className={styles.dropdownArrow}>▼</span>
                </button>
              </div>
              {thinkOpen && createPortal(
                <div className={styles.dropdownPortal} style={{ top: thinkPos.top, left: thinkPos.left, width: 260 }} data-settings-modal-portal>
                  <div id="settings-thinking-options" className={styles.dropdownMenu} role="listbox" aria-label="全局推理强度">
                    {THINKING_OPTIONS.map(opt => (
                      <button type="button" key={opt.value} onClick={() => { setReasoningEffort(opt.value); setThinkOpen(false) }}
                        role="option" aria-selected={reasoningEffort === opt.value}
                        className={styles.dropdownItem}>
                        <div>{opt.label}</div>
                        <div className={styles.dropdownDescription}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>, document.body,
              )}
              {talentThinkOpen && createPortal(
                <div className={styles.dropdownPortal} style={{ top: talentThinkPos.top, left: talentThinkPos.left, width: 260 }} data-settings-modal-portal>
                  <div id="settings-talent-thinking-options" className={styles.dropdownMenu} role="listbox" aria-label="命格生成推理强度">
                    {TALENT_THINKING_OPTIONS.map(opt => (
                      <button type="button" key={opt.value} onClick={() => { setTalentThinkingIntensity(opt.value); setTalentThinkOpen(false) }}
                        role="option" aria-selected={talentThinkingIntensity === opt.value}
                        className={styles.dropdownItem}>
                        <div>{opt.label}</div>
                        <div className={styles.dropdownDescription}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>, document.body,
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===== 每轮叙事节奏偏好 ===== */}
      <section className={styles.settingsSection}>
        <div className={styles.sectionLabel}>
          <span>叙事节奏</span>
          <span className={styles.sectionMeta}>文笔优先</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.sectionRow}>
            <div>
              <div className={styles.controlTitle}>每轮叙事偏好字数
                <SettingsHelpTooltip helpKey="word-count" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} width={280} />
              </div>
              <p className={styles.descText}>仅作节奏参考，不会因偏离而重写或截断故事。</p>
            </div>
            <div className={styles.flexRowAlignStart}>
              <button type="button" ref={wcRef} onClick={handleWcToggle} className={styles.dropdownBtn}
                aria-haspopup="listbox" aria-expanded={wcOpen} aria-controls="settings-word-count-options">
                <span>{wordCountTarget}字</span><span className={styles.dropdownArrow}>▼</span>
              </button>
              {wcOpen && createPortal(
                <div className={styles.dropdownPortal} style={{ top: wcPos.top, left: wcPos.left, width: 120 }} data-settings-modal-portal>
                  <div id="settings-word-count-options" className={styles.dropdownMenu} role="listbox" aria-label="每轮叙事偏好字数">
                    {WORD_COUNT_TARGET_OPTIONS.map(v => (
                      <button type="button" key={v} onClick={() => { setWordCountTarget(v); setWcOpen(false) }}
                        role="option" aria-selected={wordCountTarget === v}
                        className={styles.dropdownItem}>
                        {v}字
                      </button>
                    ))}
                  </div>
                </div>, document.body,
              )}
            </div>
          </div>
        </div>
      </section>

      <div className={styles.sectionLabel}>
        <span>高级参数</span>
        <span className={styles.sectionMeta}>即时生效</span>
      </div>
      <div className={styles.advancedGrid}>
        <SettingsParamCard title="温度（Temperature）" helpKey="temperature" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp}
          enabled={true} toggleable={false} activeLabel="始终生效"
          value={temperature} onValueChange={setTemperature} min={0} max={2} step={0.05} isInteger={false}
          recommendEnabled={true} recommendText="自动保存" recommendDescription="调整后会用于后续 AI 请求"
          enabledDescription="控制 AI 生成文本的随机性。值越低回答越保守，值越高越有创造力（范围 0-2，推荐 0.7-1.2）。"
          footerText={`当前值：${temperature.toFixed(2)} · 太高可能导致回复不稳定`} />
      </div>

      {/* ===== 下一轮预生成 ===== */}
      <section className={styles.settingsSection}>
        <div className={styles.sectionLabel}>
          <span>下一轮预生成</span>
          <span className={styles.sectionMeta}>减少下一次等待</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.sectionBody}>
            <p className={styles.descParagraph}>最多提前准备下一轮叙事；选择分支后未使用内容会被丢弃。
              <SettingsHelpTooltip helpKey="pregen-rounds" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} width={300} />
            </p>
            <div className={styles.flexRowSm}>
              {[
                { value: 0, label: '关闭' }, { value: 1, label: '预生成下一轮' },
              ].map(opt => (
                <button key={opt.value} onClick={() => setPreGenerateRounds(opt.value)} className={styles.optionBtn}
                  aria-pressed={effectivePreGenerateRounds === opt.value}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
