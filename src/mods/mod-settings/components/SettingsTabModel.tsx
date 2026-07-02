'use client'

/**
 * @module SettingsTabModel.tsx
 * @description 废案同款 "模型设置" Tab —— AI命格/推理/字数/参数卡/预生成/保存恢复
 * @mod mod-settings
 */

import { useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useSettingsStore } from '../store'
import type { ReasoningEffort } from '../store'
import { DEFAULT_WORD_COUNT_TARGET } from '@/mods/mod-engine'
import { SettingsParamCard } from './SettingsParamCard'
import { SettingsHelpTooltip } from './SettingsHelpTooltip'

import styles from './SettingsTabModel.module.css'

const HELP_DATA: Record<string, string> = {
  'ai-talent': '开启后调用 AI 实时生成随机命格，带来完全不可预测的角色背景。关闭后从本地预设命格库中抽取，响应即时无需等待 AI。',
  thinking: '推理强度越高，AI 思考越深入但响应越慢。全局推理影响叙事等常规对话，命格生成专用推理仅在 AI 生成命格时使用。',
  'word-count': '控制每轮叙事文本的大致字数。字数越多消耗的 token 越多，响应时间也越长。',
  temperature: '控制 AI 生成文本的随机性。值越低回答越保守、越一致，值越高越有创造力但可能不稳定。推荐 0.7-1.2。',
  'top-p': '核采样参数，控制词汇选择的多样性。与 Temperature 配合使用，值越高候选词越多。推荐 0.8-0.95。',
  'max-tokens': '限制 AI 每轮回复的最大 token 数。值越大回复越丰富但消耗越多配额。',
  'pregen-rounds': '控制 AI 提前生成后续叙事的轮数。预生成轮数越多后续等待越短，但每次选择分支时预生成内容会被丢弃，消耗额外 token。',
}

const THINKING_OPTIONS: Array<{ value: ReasoningEffort; label: string; desc: string }> = [
  { value: 'disabled', label: '❌ 关闭', desc: '不启用推理模式，无额外 token 消耗' },
  { value: 'level-1', label: '一级', desc: '最小推理，最大约 512 tokens' },
  { value: 'level-2', label: '二级（推荐）', desc: '轻度推理，最大约 1024 tokens' },
  { value: 'level-3', label: '三级', desc: '均衡推理深度与速度，最大约 2048 tokens' },
  { value: 'level-4', label: '四级', desc: '深度推理，最大约 4096 tokens' },
  { value: 'level-5', label: '五级', desc: '强化推理，最大约 8192 tokens' },
  { value: 'level-6', label: '六级', desc: '极致推理，最大约 16384 tokens' },
]

const TALENT_THINKING_OPTIONS: Array<{ value: ReasoningEffort; label: string; desc: string }> = [
  { value: 'disabled', label: '❌ 关闭（推荐）', desc: '不启用推理模式，无额外 token 消耗' },
  { value: 'level-1', label: '一级', desc: '最小推理，最大约 512 tokens' },
  { value: 'level-2', label: '二级', desc: '轻度推理，最大约 1024 tokens' },
  { value: 'level-3', label: '三级', desc: '均衡推理深度与速度，最大约 2048 tokens' },
  { value: 'level-4', label: '四级', desc: '深度推理，最大约 4096 tokens' },
  { value: 'level-5', label: '五级', desc: '强化推理，最大约 8192 tokens' },
  { value: 'level-6', label: '六级', desc: '极致推理，最大约 16384 tokens' },
]

const WORD_COUNT_TARGET_OPTIONS = [50, 100, 150, 200, 300, 500, 800, 1000, 1500]

export function SettingsTabModel() {
  const {
    aiTalentGeneration, reasoningEffort, talentThinkingIntensity,
    wordCountTarget, temperature, topP, maxTokens, preGenerateRounds,
    setAiTalentGeneration, setReasoningEffort, setTalentThinkingIntensity,
    setWordCountTarget, setTemperature, setTopP, setMaxTokens, setPreGenerateRounds,
  } = useSettingsStore()

  // 保存反馈
  const [saved, setSaved] = useState(false)

  // Help tooltip state
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({})
  const toggleHelp = useCallback((key: string) => setHelpOpen(prev => ({ ...prev, [key]: !prev[key] })), [])

  // Param enable state
  const [tempEnabled, setTempEnabled] = useState(false)
  const [topPEnabled, setTopPEnabled] = useState(false)
  const [maxTokensEnabled, setMaxTokensEnabled] = useState(false)

  // Thinking dropdowns
  const [thinkOpen, setThinkOpen] = useState(false)
  const [talentThinkOpen, setTalentThinkOpen] = useState(false)
  const thinkBtnRef = useRef<HTMLButtonElement>(null)
  const talentThinkBtnRef = useRef<HTMLButtonElement>(null)
  const [thinkPos, setThinkPos] = useState({ top: 0, left: 0 })
  const [talentThinkPos, setTalentThinkPos] = useState({ top: 0, left: 0 })

  const handleThinkToggle = useCallback(() => {
    if (thinkBtnRef.current) {
      const r = thinkBtnRef.current.getBoundingClientRect()
      setThinkPos({ top: r.bottom + 4, left: r.left })
    }
    setThinkOpen(o => !o)
    setTalentThinkOpen(false)
  }, [])
  const handleTalentThinkToggle = useCallback(() => {
    if (talentThinkBtnRef.current) {
      const r = talentThinkBtnRef.current.getBoundingClientRect()
      setTalentThinkPos({ top: r.bottom + 4, left: r.left })
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
    if (wcRef.current) { const r = wcRef.current.getBoundingClientRect(); setWcPos({ top: r.bottom + 4, left: r.left }) }
    setWcOpen(o => !o)
  }, [])

  // 保存反馈
  const handleSave = useCallback(() => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  // 恢复默认
  const handleReset = useCallback(() => {
    setAiTalentGeneration(false)
    setReasoningEffort('disabled')
    setTalentThinkingIntensity('disabled')
    setWordCountTarget(DEFAULT_WORD_COUNT_TARGET)
    setTemperature(0.8)
    setTopP(0.8)
    setMaxTokens(1024)
    setPreGenerateRounds(0)
  }, [setAiTalentGeneration, setReasoningEffort, setTalentThinkingIntensity, setWordCountTarget, setTemperature, setTopP, setMaxTokens, setPreGenerateRounds])

  return (
    <div>
      {/* ===== AI 命格生成 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeaderFlex}>
          <span>AI 命格生成
            <SettingsHelpTooltip helpKey="ai-talent" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} />
          </span>
          <label className={styles.toggleLabel}>
            <span className={styles.toggleStatus} style={{ color: aiTalentGeneration ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
              {aiTalentGeneration ? '已开启' : '已关闭'}
            </span>
            <div onClick={() => setAiTalentGeneration(!aiTalentGeneration)}
              title={aiTalentGeneration ? '点击关闭 AI 命格生成' : '点击开启 AI 命格生成'}
              className={styles.toggleTrack}
              style={{ background: aiTalentGeneration ? 'var(--color-primary)' : 'var(--color-bg)', border: aiTalentGeneration ? 'none' : '1px solid var(--color-border)' }}>
              <div className={styles.toggleThumb} style={{ background: aiTalentGeneration ? 'white' : 'var(--color-text-tertiary)', left: aiTalentGeneration ? 23 : 3 }} />
            </div>
          </label>
        </div>
        <div className={styles.sectionBody}>
          <p className={styles.descText}>
            {aiTalentGeneration ? '开启后会调用 AI 实时生成随机命格，响应较慢但多样性更高。' : '关闭后从本地预设命格库中抽取，响应即时无需等待 AI。'}
          </p>
        </div>
      </div>

      {/* ===== 推理模式强度 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          推理模式强度
          <SettingsHelpTooltip helpKey="thinking" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} width={300} />
        </div>
        <div className={styles.sectionBody}>
          <p className={styles.descParagraph}>控制 AI 在生成内容前的内部推理深度。左侧为全局推理（影响叙事等），右侧为命格生成专用推理。</p>
          <div className={styles.flexRow}>
            <div className={styles.dropdownWrapper}>
              <span className={styles.dropdownLabel}>全局推理</span>
              <button ref={thinkBtnRef} onClick={handleThinkToggle} className={styles.dropdownBtn} style={{ minWidth: 200 }}>
                <span>{currentThinkLabel}</span>
                <span className={styles.dropdownArrow}>▼</span>
              </button>
            </div>
            <div className={styles.dropdownWrapper}>
              <span className={styles.dropdownLabel}>命格生成</span>
              <button ref={talentThinkBtnRef} onClick={handleTalentThinkToggle} className={styles.dropdownBtn} style={{ minWidth: 200 }}>
                <span>{currentTalentThinkLabel}</span>
                <span className={styles.dropdownArrow}>▼</span>
              </button>
            </div>
            {thinkOpen && createPortal(
              <div className={styles.dropdownPortal} style={{ top: thinkPos.top, left: thinkPos.left, width: 260 }}>
                <div className={styles.dropdownMenu}>
                  {THINKING_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => { setReasoningEffort(opt.value); setThinkOpen(false) }}
                      className={styles.dropdownItem}
                      style={{ background: reasoningEffort === opt.value ? 'var(--color-bg)' : 'transparent', color: reasoningEffort === opt.value ? 'var(--color-primary)' : 'var(--color-text-primary)', fontWeight: reasoningEffort === opt.value ? 600 : 400 }}>
                      <div>{opt.label}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>, document.body,
            )}
            {talentThinkOpen && createPortal(
              <div className={styles.dropdownPortal} style={{ top: talentThinkPos.top, left: talentThinkPos.left, width: 260 }}>
                <div className={styles.dropdownMenu}>
                  {TALENT_THINKING_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => { setTalentThinkingIntensity(opt.value); setTalentThinkOpen(false) }}
                      className={styles.dropdownItem}
                      style={{ background: talentThinkingIntensity === opt.value ? 'var(--color-bg)' : 'transparent', color: talentThinkingIntensity === opt.value ? 'var(--color-primary)' : 'var(--color-text-primary)', fontWeight: talentThinkingIntensity === opt.value ? 600 : 400 }}>
                      <div>{opt.label}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>, document.body,
            )}
          </div>
        </div>
      </div>

      {/* ===== 每轮叙事大致字数 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          每轮叙事大致字数
          <SettingsHelpTooltip helpKey="word-count" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} width={280} />
        </div>
        <div className={styles.sectionBody}>
          <p className={styles.descParagraph}>控制每轮叙事文本的大致字数。字数越多消耗的 token 越多，响应时间也越长。</p>
          <div className={styles.flexRowAlignStart}>
            <div>
              <div className={styles.wordCountLabel}>大致字数</div>
              <button ref={wcRef} onClick={handleWcToggle} className={styles.dropdownBtn} style={{ minWidth: 120 }}>
                <span>{wordCountTarget}字</span><span className={styles.dropdownArrow}>▼</span>
              </button>
              {wcOpen && createPortal(
                <div className={styles.dropdownPortal} style={{ top: wcPos.top, left: wcPos.left, width: 120 }}>
                  <div className={styles.dropdownMenu}>
                    {WORD_COUNT_TARGET_OPTIONS.map(v => (
                      <button key={v} onClick={() => { setWordCountTarget(v); setWcOpen(false) }}
                        className={styles.dropdownItem}
                        style={{ background: wordCountTarget === v ? 'var(--color-bg)' : 'transparent', color: wordCountTarget === v ? 'var(--color-primary)' : 'var(--color-text-primary)', fontWeight: wordCountTarget === v ? 600 : 400 }}>
                        {v}字
                      </button>
                    ))}
                  </div>
                </div>, document.body,
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 模型参数卡片 ===== */}
      <SettingsParamCard title="温度（Temperature）" helpKey="temperature" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp}
        enabled={tempEnabled} onToggle={() => setTempEnabled(!tempEnabled)}
        value={temperature} onValueChange={setTemperature} min={0} max={2} step={0.05} isInteger={false}
        recommendEnabled={true} recommendText="推荐：开启" recommendDescription="控制 AI 生成文本的随机性，建议保持开启以确保回复质量"
        enabledDescription="控制 AI 生成文本的随机性。值越低回答越保守，值越高越有创造力（范围 0-2，推荐 0.3-1.0）。"
        footerText={`当前值：${temperature.toFixed(2)} · 太高可能导致回复不稳定`} />

      <SettingsParamCard title="Top P（核采样）" helpKey="top-p" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp}
        enabled={topPEnabled} onToggle={() => setTopPEnabled(!topPEnabled)}
        value={topP} onValueChange={setTopP} min={0} max={1} step={0.05} isInteger={false}
        recommendEnabled={true} recommendText="推荐：开启" recommendDescription="与温度配合控制候选词范围，建议保持开启"
        enabledDescription="控制单词候选集的累积概率阈值。值越高候选词越多，生成越多样（范围 0-1，推荐 0.8-0.95）。"
        footerText="建议与温度同时调节，不宜同时开太高" />

      <SettingsParamCard title="最大 Token 数" helpKey="max-tokens" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp}
        enabled={maxTokensEnabled} onToggle={() => setMaxTokensEnabled(!maxTokensEnabled)}
        value={maxTokens} onValueChange={setMaxTokens} min={512} max={8192} step={256} isInteger={true}
        recommendEnabled={false} recommendText="推荐：关闭" recommendDescription="不传此参数时 AI 会自然输出，仅在输出被截断时考虑开启"
        enabledDescription="限制 AI 每轮回复的最大 token 数。值越大回复越丰富但消耗越多配额（范围 512-8192）。"
        footerText={`当前值：${maxTokens} · 注意模型自身的上下文窗口限制`} />

      {/* ===== 预生成轮数 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          预生成轮数
          <SettingsHelpTooltip helpKey="pregen-rounds" helpOpen={helpOpen} helpData={HELP_DATA} toggleHelp={toggleHelp} width={300} />
        </div>
        <div className={styles.sectionBody}>
          <p className={styles.descParagraph}>控制 AI 提前生成后续叙事的轮数。轮数越多等待越流畅，但每轮选择分支时预生成内容会被丢弃，消耗额外 token。</p>
          <div className={styles.flexRowSm}>
            {[
              { value: 0, label: '❌ 关闭' }, { value: 1, label: '1轮' }, { value: 2, label: '2轮' }, { value: 3, label: '3轮' },
            ].map(opt => (
              <button key={opt.value} onClick={() => setPreGenerateRounds(opt.value)} className={styles.optionBtn}
                style={{
                  border: preGenerateRounds === opt.value ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  color: preGenerateRounds === opt.value ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  fontWeight: preGenerateRounds === opt.value ? 600 : 400,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 保存/恢复按钮 ===== */}
      <div className={styles.actionRow}>
        <button className={styles.saveBtn} onClick={handleSave}>
          {saved ? '✅ 已保存' : '💾 保存参数'}
        </button>
        <button className={styles.resetBtn} onClick={handleReset}>🔄 恢复默认</button>
      </div>
    </div>
  )
}
