'use client'

/**
 * @module SettingsTabPresets.tsx
 * @description 废案同款 "模型调用" Tab —— 预设模型/自定义API/自定义参数/配置操作 + 连通性测试
 * @mod mod-settings
 */

import { useState, useCallback, useRef } from 'react'

import { useSettingsStore } from '../store'

import { configStore } from '@/core'
import { AI_PROVIDERS } from '@/core/ai-service'

import styles from './SettingsTabPresets.module.css'

// ══════════════ 连通性测试常量 ══════════════

/** localStorage 持久化键 */
const CONN_STATE_KEY = 'mod-settings:conn-test'

/** 连通性测试超时（毫秒） */
const CONN_TEST_TIMEOUT = 10000

/** 连通性测试估算 Token 消耗（input ~5 + output ~1 = ~6 tokens） */
const CONN_TEST_ESTIMATED_TOKENS = '≈6'

interface ConnPersistState {
  state: 'idle' | 'connected' | 'failed'
  duration: number | null   // 毫秒
  testedUrl: string
  testedModel: string
  testedAt: number           // timestamp
}

function loadConnState(): ConnPersistState | null {
  try {
    return configStore.get<ConnPersistState>('mod-settings', CONN_STATE_KEY) ?? null
  } catch { return null }
}

function saveConnState(s: ConnPersistState): void {
  try { configStore.set('mod-settings', CONN_STATE_KEY, s) } catch { /* ignore */ }
}

const HELP_DATA: Record<string, string> = {
  'preset-model': '从预设的模型列表中选择厂商和模型，系统会自动填入对应的 API 地址和模型名称。',
  'custom-model': '使用自定义的 AI 模型时，需要填入 API Key、接口地址和模型名称。',
  'custom-param': '为 API 请求添加额外的自定义参数，例如 thinking 参数。参数值填写字符串或 JSON 字面量。',
}

export function SettingsTabPresets() {
  const {
    customKey, customUrl, customModel,
    setProvider, setCustomKey, setCustomUrl, setCustomModel,
  } = useSettingsStore()

  const [selectedVendorIdx, setSelectedVendorIdx] = useState<number | null>(null)
  const [selectedModelName, setSelectedModelName] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({})
  const toggleHelp = useCallback((key: string) => setHelpOpen(prev => ({ ...prev, [key]: !prev[key] })), [])

  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'cleared'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 连通性测试状态（从 localStorage 恢复）
  const [connTest, setConnTest] = useState<{
    state: 'idle' | 'testing' | 'connected' | 'failed'
    duration: number | null
    tokens: string
    testedAt: number | null
  }>(() => {
    const saved = loadConnState()
    if (!saved) return { state: 'idle', duration: null, tokens: '', testedAt: null }
    // 仅当测试的 URL/Model 与当前一致时才恢复
    const store = useSettingsStore.getState()
    if (saved.testedUrl === (store.customUrl || 'https://api.deepseek.com/v1') &&
        saved.testedModel === (store.customModel || 'deepseek-v4-flash')) {
      return { state: saved.state, duration: saved.duration, tokens: CONN_TEST_ESTIMATED_TOKENS, testedAt: saved.testedAt }
    }
    return { state: 'idle', duration: null, tokens: '', testedAt: null }
  })

  const [extraParamEnabled, setExtraParamEnabled] = useState(false)
  const [extraParamName, setExtraParamName] = useState('')
  const [extraParamValue, setExtraParamValue] = useState('')

  const vendorList = Object.values(AI_PROVIDERS)

  const handlePresetSelect = useCallback((idx: number, modelName: string) => {
    const v = vendorList[idx]
    setSelectedModelName(modelName)
    setProvider(v.id)
    setCustomModel(modelName)
    setCustomUrl(v.baseUrl)
  }, [vendorList, setProvider, setCustomModel, setCustomUrl])

  // ══════════ 连通性测试逻辑（save 和手动按钮复用） ══════════
  const runConnTest = useCallback(() => {
    setConnTest({ state: 'testing', duration: null, tokens: '', testedAt: null })
    const testUrl = customUrl || 'https://api.deepseek.com/v1'
    const testModel = customModel || 'deepseek-v4-flash'
    const testKey = customKey

    if (!testKey) {
      setConnTest({ state: 'failed', duration: null, tokens: '', testedAt: null })
      saveConnState({ state: 'failed', duration: null, testedUrl: testUrl, testedModel: testModel, testedAt: Date.now() })
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CONN_TEST_TIMEOUT)
    const startTime = performance.now()

    fetch(`${testUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testKey}`,
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeout)
        const elapsed = Math.round(performance.now() - startTime)

        if (!res.ok) {
          setConnTest({ state: 'failed', duration: elapsed, tokens: '0', testedAt: Date.now() })
          saveConnState({ state: 'failed', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt: Date.now() })
          return
        }

        try {
          const json = await res.json()
          const usage = json?.usage
          const actualTokens = usage
            ? `in:${usage.prompt_tokens ?? '?'} out:${usage.completion_tokens ?? '?'}`
            : CONN_TEST_ESTIMATED_TOKENS

          if (json?.choices?.[0]?.message?.content !== undefined) {
            setConnTest({ state: 'connected', duration: elapsed, tokens: actualTokens, testedAt: Date.now() })
            saveConnState({ state: 'connected', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt: Date.now() })
          } else {
            setConnTest({ state: 'failed', duration: elapsed, tokens: actualTokens, testedAt: Date.now() })
            saveConnState({ state: 'failed', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt: Date.now() })
          }
        } catch {
          const elapsed2 = Math.round(performance.now() - startTime)
          setConnTest({ state: 'failed', duration: elapsed2, tokens: '0', testedAt: Date.now() })
          saveConnState({ state: 'failed', duration: elapsed2, testedUrl: testUrl, testedModel: testModel, testedAt: Date.now() })
        }
      })
      .catch(() => {
        clearTimeout(timeout)
        const elapsed = Math.round(performance.now() - startTime)
        setConnTest({ state: 'failed', duration: elapsed, tokens: '0', testedAt: Date.now() })
        saveConnState({ state: 'failed', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt: Date.now() })
      })
  }, [customKey, customUrl, customModel])

  const handleSaveAPIConfig = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saved')
    saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
    runConnTest()
  }, [runConnTest])

  const handleClearAPIConfig = useCallback(() => {
    setProvider('deepseek')
    setCustomKey('')
    setCustomUrl('')
    setCustomModel('')
    setSelectedVendorIdx(null)
    setSelectedModelName(null)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('cleared')
    saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [setProvider, setCustomKey, setCustomUrl, setCustomModel])

  const currentThinkLabel = '关闭' // Simplified since we use dropdowns in Tab 2

  return (
    <div>
      {/* ===== 预设模型 ===== */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--color-border)' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '-0.2px' }}>
          预设模型
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
            <span onClick={(e) => { e.stopPropagation(); toggleHelp('preset-model') }} style={{ fontSize: 12, cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--color-border)', lineHeight: 1, userSelect: 'none' }} title="点击查看说明">ⓘ</span>
            {helpOpen['preset-model'] && (
              <div style={{ position: 'absolute', left: 'calc(100% + 6px)', top: -8, zIndex: 100, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', width: 280, whiteSpace: 'normal' }}>
                {HELP_DATA['preset-model']}
              </div>
            )}
          </span>
        </div>
        <div style={{ padding: '12px 16px 16px' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 10px', lineHeight: 1.5 }}>
            选择模型厂商和对应模型，系统自动填入 API 地址和模型名称，仅需填入 API Key 即可使用。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {vendorList.map((vendor, idx) => (
              <button key={idx}
                onClick={() => { setSelectedVendorIdx(selectedVendorIdx === idx ? null : idx); setSelectedModelName(null) }}
                title={vendor.notes}
                style={{
                  flex: '1 1 calc(50% - 3px)', minWidth: 0, padding: '7px 8px',
                  fontSize: 13, borderRadius: 8, cursor: 'pointer',
                  border: selectedVendorIdx === idx ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: selectedVendorIdx === idx ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                  color: 'var(--color-text-primary)', fontWeight: selectedVendorIdx === idx ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'all 0.2s ease',
                }}>
                {vendor.icon} {vendor.name}
              </button>
            ))}
          </div>

          {selectedVendorIdx !== null && vendorList[selectedVendorIdx] && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                选择模型（{vendorList[selectedVendorIdx].name}）
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {vendorList[selectedVendorIdx].models.map(m => (
                  <button key={m.name}
                    onClick={() => handlePresetSelect(selectedVendorIdx, m.name)}
                    title={m.notes}
                    style={{
                      flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                      border: selectedModelName === m.name ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: selectedModelName === m.name ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                      color: 'var(--color-text-primary)', fontWeight: selectedModelName === m.name ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'all 0.2s ease',
                    }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* 选中模型的详细说明 */}
              {selectedModelName && (() => {
                const selectedModel = vendorList[selectedVendorIdx].models.find(m => m.name === selectedModelName)
                if (!selectedModel?.notes) return null
                return (
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: -4, marginBottom: 12, lineHeight: 1.7, padding: '8px 10px', borderRadius: 8, background: 'var(--color-primary)' + '0d', border: '1px solid var(--color-primary)' + '1a', whiteSpace: 'pre-line' }}>
                    {selectedModel.notes}
                  </div>
                )
              })()}
            </div>
          )}

          {vendorList[selectedVendorIdx ?? -1]?.notes && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
              💡 {vendorList[selectedVendorIdx!].notes}
            </p>
          )}

          {selectedVendorIdx !== null && vendorList[selectedVendorIdx]?.id === 'deepseek' && (
            <p style={{ fontSize: 11, color: 'var(--color-primary)', marginTop: 8, lineHeight: 1.6, padding: '8px 10px', borderRadius: 8, background: 'var(--color-primary)' + '0d', border: '1px solid var(--color-primary)' + '30' }}>
              🔑 API Key 获取途径：访问 <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontWeight: 500 }}>platform.deepseek.com</a> 注册后在「API Keys」页面创建即可<br />
              💰 该模型价格低廉且性能优异，性价比极高，推荐作为默认 AI 引擎
            </p>
          )}
        </div>
      </div>

      {/* ===== 自定义 AI 模型 ===== */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--color-border)' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '-0.2px' }}>
          自定义 AI 模型
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
            <span onClick={(e) => { e.stopPropagation(); toggleHelp('custom-model') }} style={{ fontSize: 12, cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--color-border)', lineHeight: 1, userSelect: 'none' }} title="点击查看说明">ⓘ</span>
            {helpOpen['custom-model'] && (
              <div style={{ position: 'absolute', left: 'calc(100% + 6px)', top: -8, zIndex: 100, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', width: 280, whiteSpace: 'normal' }}>
                {HELP_DATA['custom-model']}
              </div>
            )}
           </span>
        </div>
        <div style={{ padding: '12px 16px 16px' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {selectedModelName ? '已选中预设模型，API 地址和模型名已自动填入，请输入 API Key 后保存配置。' : '手动填入 API Key、网址和模型名以使用自己的模型。'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="password" className={styles.presetInput} placeholder="API Key（如 sk-xxx）" value={customKey} onChange={e => setCustomKey(e.target.value)} style={{ fontSize: 13, padding: '9px 12px', borderRadius: 8 }} />
            <input className={styles.presetInput} placeholder="API 网址（如 https://api.deepseek.com/v1）" value={customUrl} onChange={e => setCustomUrl(e.target.value)} style={{ fontSize: 13, padding: '9px 12px', borderRadius: 8 }} />
            <input className={styles.presetInput} placeholder="模型名称（如 deepseek-v4-flash）" value={customModel} onChange={e => setCustomModel(e.target.value)} style={{ fontSize: 13, padding: '9px 12px', borderRadius: 8 }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>当前状态：{customKey ? `✅ 已配置 · ${customModel || '未选模型'}` : '⚠️ 未配置 API Key'} · 推理：{currentThinkLabel}</span>
            {/* Apple 风格连通性光点 */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{
                fontSize: 10, color: 'var(--color-text-tertiary)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: connTest.state === 'connected' ? '#34c759'
                    : connTest.state === 'failed' ? '#ff3b30'
                    : connTest.state === 'testing' ? '#ff9f0a'
                    : '#8e8e93',
                  boxShadow: connTest.state === 'connected' ? '0 0 6px #34c759'
                    : connTest.state === 'failed' ? '0 0 6px #ff3b30'
                    : connTest.state === 'testing' ? '0 0 6px #ff9f0a'
                    : 'none',
                  transition: 'all 0.3s ease',
                  animation: connTest.state === 'testing' ? 'pulse 1s ease-in-out infinite' : 'none',
                }} />
                {connTest.state === 'idle' && '未测试'}
                {connTest.state === 'testing' && '测试中...'}
                {connTest.state === 'connected' && `已连通 · ${connTest.duration ? connTest.duration + 'ms' : ''} · ${connTest.tokens}`}
                {connTest.state === 'failed' && '连接失败'}
                {/* 手动重测按钮 */}
                <button
                  type="button"
                  title="重新测试连通性"
                  onClick={(e) => { e.stopPropagation(); runConnTest() }}
                  disabled={connTest.state === 'testing'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--color-border)',
                    background: 'transparent', cursor: connTest.state === 'testing' ? 'default' : 'pointer',
                    opacity: connTest.state === 'testing' ? 0.4 : 0.7,
                    fontSize: 10, lineHeight: 1, padding: 0, marginLeft: 2,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => { if (connTest.state !== 'testing') (e.target as HTMLButtonElement).style.opacity = '1' }}
                  onMouseLeave={(e) => { if (connTest.state !== 'testing') (e.target as HTMLButtonElement).style.opacity = '0.7' }}
                >
                  ↻
                </button>
              </span>
            </span>
          </p>
        </div>
      </div>

      {/* ===== 自定义 API 参数 ===== */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--color-border)' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '-0.2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>自定义 API 参数
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
              <span onClick={(e) => { e.stopPropagation(); toggleHelp('custom-param') }} style={{ fontSize: 12, cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--color-border)', lineHeight: 1, userSelect: 'none' }} title="点击查看说明">ⓘ</span>
              {helpOpen['custom-param'] && (
                <div style={{ position: 'absolute', left: 'calc(100% + 6px)', top: -8, zIndex: 100, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', width: 280, whiteSpace: 'normal' }}>
                  {HELP_DATA['custom-param']}
                </div>
              )}
            </span>
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
            <input type="checkbox" checked={extraParamEnabled} onChange={e => setExtraParamEnabled(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }} />
            启用
          </label>
        </div>
        <div style={{ padding: '12px 16px 16px' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 10px', lineHeight: 1.5 }}>
            为自定义模型添加额外的 API 请求参数。参数值填写字符串（如 enabled）或 JSON 字面量。
          </p>
          {extraParamEnabled && (
            <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
              <input className={styles.presetInput} placeholder="参数名，例如 thinking" value={extraParamName} onChange={e => setExtraParamName(e.target.value)} style={{ fontSize: 13, padding: '9px 12px', borderRadius: 8 }} />
              <input className={styles.presetInput} placeholder={'参数值，例如 enabled 或 {"type":"enabled","budget_tokens":2048}'} value={extraParamValue} onChange={e => setExtraParamValue(e.target.value)} style={{ fontSize: 13, padding: '9px 12px', borderRadius: 8 }} />
            </div>
          )}
        </div>
      </div>

      {/* ===== 配置操作 ===== */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--color-border)' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '-0.2px' }}>
          配置操作
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>保存当前 API 配置或恢复到默认设置</span>
        </div>
        <div style={{ padding: '12px 16px 16px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSaveAPIConfig} style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer', background: saveState === 'saved' ? 'var(--color-primary)' + '1a' : 'transparent', color: saveState === 'saved' ? 'var(--color-success, #16a34a)' : 'var(--color-primary)', border: saveState === 'saved' ? '1px solid var(--color-success, #16a34a)' : '1px solid var(--color-primary)', fontWeight: 600, transition: 'all 0.2s ease', boxShadow: saveState === 'saved' ? 'none' : '0 0 8px rgba(59,130,246,0.1)' }}>{saveState === 'saved' ? '✅ 已保存' : '💾 保存配置'}</button>
            <button onClick={handleClearAPIConfig} style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: saveState === 'cleared' ? '1px solid var(--color-success, #16a34a)' : '1px solid var(--color-border)', background: saveState === 'cleared' ? 'var(--color-success, #16a34a)' + '1a' : 'var(--color-bg)', color: saveState === 'cleared' ? 'var(--color-success, #16a34a)' : 'var(--color-text-primary)', transition: 'all 0.2s ease' }}>{saveState === 'cleared' ? '✅ 已恢复' : '🔄 恢复默认'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
