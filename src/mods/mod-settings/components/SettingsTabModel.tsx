'use client'

/**
 * Purpose: Render model and AI runtime settings that are active in the application.
 * Owner: mod-settings
 * Responsibility: Model-settings UI only; persisted values remain owned by the settings store.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { MAX_TEMPERATURE, useSettingsStore } from '../store'
import type { ReasoningEffort } from '../store'
import { SettingsParamCard } from './SettingsParamCard'
import { SettingsHelpTooltip } from './SettingsHelpTooltip'
import { getSettingsPortalMetrics, getSettingsPortalRoot } from './settings-portal'

import styles from './SettingsTabModel.module.css'

const HELP_DATA: Record<string, string> = {
  'ai-talent': '开启后调用 AI 实时生成随机命格，带来完全不可预测的角色背景。关闭后从本地预设命格库中抽取，响应即时无需等待 AI。',
  thinking: '关闭不启用推理；自动由模型决定深度；深入和最大分别要求更高推理强度。全局推理影响叙事等常规对话，命格生成专用推理仅在 AI 生成命格时使用。',
  temperature: '控制 AI 生成文本的随机性。值越低回答越保守、越一致，值越高越有创造力但可能不稳定。推荐 0.7-1.2。',
}

const THINKING_OPTIONS: Array<{ value: ReasoningEffort; label: string; desc: string }> = [
  { value: 'disabled', label: '关闭', desc: '不启用推理模式' },
  { value: 'auto', label: '自动（推荐）', desc: '由模型选择合适的推理深度' },
  { value: 'high', label: '深入', desc: '要求高强度推理，响应通常更慢' },
  { value: 'max', label: '最大', desc: '要求最大强度推理，消耗通常最高' },
]

const TALENT_THINKING_OPTIONS: Array<{ value: ReasoningEffort; label: string; desc: string }> = [
  { value: 'disabled', label: '关闭（推荐）', desc: '不启用推理模式，无额外 token 消耗' },
  { value: 'auto', label: '自动', desc: '由模型选择合适的推理深度' },
  { value: 'high', label: '深入', desc: '要求高强度推理，响应通常更慢' },
  { value: 'max', label: '最大', desc: '要求最大强度推理，消耗通常最高' },
]

function getAnchoredDropdownPosition(button: HTMLButtonElement, dropdownWidth: number) {
  const viewportPadding = 12
  const metrics = getSettingsPortalMetrics()
  const rect = button.getBoundingClientRect()
  const renderedWidth = Math.min(dropdownWidth, Math.max(0, metrics.width - viewportPadding * 2))
  const maxLeft = Math.max(viewportPadding, metrics.width - renderedWidth - viewportPadding)
  const triggerLeft = (rect.left - metrics.left) / metrics.scale
  const triggerBottom = (rect.bottom - metrics.top) / metrics.scale

  return {
    top: triggerBottom + 4,
    left: Math.min(Math.max(triggerLeft, viewportPadding), maxLeft),
  }
}

export function SettingsTabModel() {
  const {
    aiTalentGeneration, reasoningEffort, talentThinkingIntensity,
    temperature, preGenerateRounds,
    setAiTalentGeneration, setReasoningEffort, setTalentThinkingIntensity,
    setTemperature, setPreGenerateRounds,
  } = useSettingsStore()

  const preGenerationEnabled = preGenerateRounds === 1

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

  useEffect(() => {
    if (!thinkOpen && !talentThinkOpen) return

    const updateOpenDropdownPositions = () => {
      if (thinkOpen && thinkBtnRef.current) {
        setThinkPos(getAnchoredDropdownPosition(thinkBtnRef.current, 260))
      }
      if (talentThinkOpen && talentThinkBtnRef.current) {
        setTalentThinkPos(getAnchoredDropdownPosition(talentThinkBtnRef.current, 260))
      }
    }

    window.addEventListener('resize', updateOpenDropdownPositions)
    window.addEventListener('scroll', updateOpenDropdownPositions, true)
    return () => {
      window.removeEventListener('resize', updateOpenDropdownPositions)
      window.removeEventListener('scroll', updateOpenDropdownPositions, true)
    }
  }, [thinkOpen, talentThinkOpen])

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
          <div className={styles.sectionRow}>
            <div>
              <div className={styles.controlTitle}>批量生成故事</div>
              <p className={styles.descText}>开启后，一次主故事请求生成当前及后续两轮；每次点击只发布并结算一轮。</p>
            </div>
            <div className={styles.toggleLabel}>
              <span className={styles.toggleStatus}>{preGenerationEnabled ? '已开启' : '已关闭'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={preGenerationEnabled}
                onClick={() => setPreGenerateRounds(preGenerationEnabled ? 0 : 1)}
                title={preGenerationEnabled ? '点击关闭批量生成故事' : '点击开启批量生成故事'}
                className={styles.toggleTrack}
              >
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
                </div>, getSettingsPortalRoot(),
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
                </div>, getSettingsPortalRoot(),
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
          value={temperature} onValueChange={setTemperature} min={0} max={MAX_TEMPERATURE} step={0.05} isInteger={false}
          recommendEnabled={true} recommendText="自动保存" recommendDescription="调整后会用于后续 AI 请求"
          enabledDescription={`控制 AI 生成文本的随机性。值越低回答越保守，值越高越有创造力（范围 0-${MAX_TEMPERATURE.toFixed(1)}，推荐 0.7-1.2）。`}
          footerText={`当前值：${temperature.toFixed(2)} · 上限 ${MAX_TEMPERATURE.toFixed(1)}`} />
      </div>

    </div>
  )
}
