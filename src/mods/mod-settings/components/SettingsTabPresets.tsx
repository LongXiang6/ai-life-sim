'use client'

/**
 * @module SettingsTabPresets.tsx
 * @description "模型调用" Tab —— 预设模型、自定义 API 与连通性测试
 * @mod mod-settings
 */

import { useCallback, useState } from 'react'

import { configStore } from '@/core'
import {
  AI_PROVIDERS,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
} from '@/core/ai-service'

import { useSettingsStore } from '../store'
import { SettingsHelpTooltip } from './SettingsHelpTooltip'

import styles from './SettingsTabPresets.module.css'

const CONN_STATE_KEY = 'mod-settings:conn-test'
const CONN_TEST_TIMEOUT = 10000
const CONN_TEST_ESTIMATED_TOKENS = '≤8'
const PROVIDER_OPTIONS = Object.values(AI_PROVIDERS)

interface ConnPersistState {
  state: 'idle' | 'connected' | 'failed'
  duration: number | null
  testedUrl: string
  testedModel: string
  testedAt: number
}

interface ConnectionTestState {
  state: 'idle' | 'testing' | 'connected' | 'failed'
  duration: number | null
  tokens: string
  testedAt: number | null
}

function loadConnState(): ConnPersistState | null {
  try {
    return configStore.get<ConnPersistState>('mod-settings', CONN_STATE_KEY) ?? null
  } catch {
    return null
  }
}

function saveConnState(state: ConnPersistState): void {
  try {
    configStore.set('mod-settings', CONN_STATE_KEY, state)
  } catch {
    // 连通性状态只用于提示，不应阻断模型配置。
  }
}

const HELP_DATA: Record<string, string> = {
  'preset-model': '从预设列表选择厂商和模型后，系统会自动填入对应的 API 地址与模型名称。',
  'custom-model': '使用自定义 AI 模型时，需要填入 API Key、兼容 OpenAI 协议的接口地址和模型名称。',
}

export function SettingsTabPresets() {
  const {
    provider,
    customKey,
    customUrl,
    customModel,
    setProvider,
    setCustomKey,
    setCustomUrl,
    setCustomModel,
  } = useSettingsStore()

  const initialVendorIndex = PROVIDER_OPTIONS.findIndex((vendor) => vendor.id === provider)
  const [selectedVendorIdx, setSelectedVendorIdx] = useState<number | null>(
    initialVendorIndex >= 0 ? initialVendorIndex : null,
  )
  const [selectedModelName, setSelectedModelName] = useState<string | null>(() => {
    if (initialVendorIndex < 0) return null
    return PROVIDER_OPTIONS[initialVendorIndex].models.some((model) => model.name === customModel)
      ? customModel
      : null
  })
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({})
  const toggleHelp = useCallback((key: string) => {
    setHelpOpen((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  const [connTest, setConnTest] = useState<ConnectionTestState>(() => {
    const saved = loadConnState()
    if (!saved) return { state: 'idle', duration: null, tokens: '', testedAt: null }

    const store = useSettingsStore.getState()
    const activeUrl = store.customUrl || DEFAULT_AI_BASE_URL
    const activeModel = store.customModel || DEFAULT_AI_MODEL
    if (saved.testedUrl === activeUrl && saved.testedModel === activeModel) {
      return {
        state: saved.state,
        duration: saved.duration,
        tokens: CONN_TEST_ESTIMATED_TOKENS,
        testedAt: saved.testedAt,
      }
    }
    return { state: 'idle', duration: null, tokens: '', testedAt: null }
  })

  const selectedVendor = selectedVendorIdx === null ? null : PROVIDER_OPTIONS[selectedVendorIdx]
  const selectedModel = selectedVendor?.models.find((model) => model.name === selectedModelName) ?? null

  const markCustomProvider = useCallback(() => {
    setProvider('custom')
    setSelectedVendorIdx(null)
    setSelectedModelName(null)
  }, [setProvider])

  const markConnectionUntested = useCallback((testedUrl: string, testedModel: string) => {
    setConnTest({ state: 'idle', duration: null, tokens: '', testedAt: null })
    saveConnState({
      state: 'idle',
      duration: null,
      testedUrl: testedUrl || DEFAULT_AI_BASE_URL,
      testedModel: testedModel || DEFAULT_AI_MODEL,
      testedAt: Date.now(),
    })
  }, [])

  const handleVendorToggle = useCallback((index: number) => {
    setSelectedVendorIdx((current) => current === index ? null : index)
    setSelectedModelName(null)
  }, [])

  const handlePresetSelect = useCallback((index: number, modelName: string) => {
    const vendor = PROVIDER_OPTIONS[index]
    setSelectedModelName(modelName)
    setProvider(vendor.id)
    setCustomModel(modelName)
    setCustomUrl(vendor.baseUrl)
    markConnectionUntested(vendor.baseUrl, modelName)
  }, [markConnectionUntested, setCustomModel, setCustomUrl, setProvider])

  const runConnTest = useCallback(() => {
    setConnTest({ state: 'testing', duration: null, tokens: '', testedAt: null })
    const providerConfig = AI_PROVIDERS[provider]
    const testUrl = customUrl || providerConfig?.baseUrl || DEFAULT_AI_BASE_URL
    const testModel = customModel || providerConfig?.models[0]?.name || DEFAULT_AI_MODEL

    if (provider === 'custom' && (!customKey || !customUrl || !customModel)) {
      const testedAt = Date.now()
      setConnTest({ state: 'failed', duration: null, tokens: '', testedAt })
      saveConnState({ state: 'failed', duration: null, testedUrl: testUrl, testedModel: testModel, testedAt })
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), CONN_TEST_TIMEOUT)
    const startTime = performance.now()

    fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: `ping-${Date.now()}` }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
        providerId: provider,
        baseUrl: provider === 'custom' ? testUrl : undefined,
        apiKey: customKey || undefined,
        thinking: provider === 'deepseek' ? { type: 'disabled' } : undefined,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        window.clearTimeout(timeout)
        const elapsed = Math.round(performance.now() - startTime)
        const testedAt = Date.now()

        if (!response.ok) {
          setConnTest({ state: 'failed', duration: elapsed, tokens: '0', testedAt })
          saveConnState({ state: 'failed', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt })
          return
        }

        try {
          const json = await response.json()
          const usage = json?.usage
          const actualTokens = usage
            ? `in:${usage.prompt_tokens ?? '?'} out:${usage.completion_tokens ?? '?'}`
            : CONN_TEST_ESTIMATED_TOKENS
          const isValidResponse = json?.choices?.[0]?.message?.content !== undefined

          if (isValidResponse) {
            setConnTest({ state: 'connected', duration: elapsed, tokens: actualTokens, testedAt })
            saveConnState({ state: 'connected', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt })
          } else {
            setConnTest({ state: 'failed', duration: elapsed, tokens: actualTokens, testedAt })
            saveConnState({ state: 'failed', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt })
          }
        } catch {
          const parseElapsed = Math.round(performance.now() - startTime)
          const parseTestedAt = Date.now()
          setConnTest({ state: 'failed', duration: parseElapsed, tokens: '0', testedAt: parseTestedAt })
          saveConnState({ state: 'failed', duration: parseElapsed, testedUrl: testUrl, testedModel: testModel, testedAt: parseTestedAt })
        }
      })
      .catch(() => {
        window.clearTimeout(timeout)
        const elapsed = Math.round(performance.now() - startTime)
        const testedAt = Date.now()
        setConnTest({ state: 'failed', duration: elapsed, tokens: '0', testedAt })
        saveConnState({ state: 'failed', duration: elapsed, testedUrl: testUrl, testedModel: testModel, testedAt })
      })
  }, [customKey, customModel, customUrl, provider])

  const handleClearAPIConfig = useCallback(() => {
    setProvider(DEFAULT_AI_PROVIDER_ID)
    setCustomKey('')
    setCustomUrl(DEFAULT_AI_BASE_URL)
    setCustomModel(DEFAULT_AI_MODEL)
    setSelectedVendorIdx(PROVIDER_OPTIONS.findIndex((vendor) => vendor.id === DEFAULT_AI_PROVIDER_ID))
    setSelectedModelName(DEFAULT_AI_MODEL)
    markConnectionUntested(DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL)
  }, [markConnectionUntested, setCustomKey, setCustomModel, setCustomUrl, setProvider])

  const connectionLabel = connTest.state === 'connected'
    ? `已连通${connTest.duration !== null ? ` · ${connTest.duration}ms` : ''}${connTest.tokens ? ` · ${connTest.tokens}` : ''}`
    : connTest.state === 'testing'
      ? '测试中…'
      : connTest.state === 'failed'
        ? '连接失败'
        : '尚未测试'

  return (
    <div className={styles.tabRoot}>
      <section className={styles.section} aria-labelledby="settings-provider-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-provider-heading">
            预设模型
            <SettingsHelpTooltip
              helpKey="preset-model"
              helpOpen={helpOpen}
              helpData={HELP_DATA}
              toggleHelp={toggleHelp}
              width={280}
            />
          </h3>
          <span>先选厂商，再选模型</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.cardBody}>
            <p className={styles.supportingText}>
              选中模型后会自动填写 API 地址与模型名称；预设厂商可使用本地服务端密钥，也可填写自己的 Key 覆盖。
            </p>
            <div className={styles.vendorGrid} role="group" aria-label="模型厂商">
              {PROVIDER_OPTIONS.map((vendor, index) => (
                <button
                  key={vendor.id}
                  type="button"
                  className={styles.vendorButton}
                  title={vendor.notes}
                  aria-pressed={selectedVendorIdx === index}
                  aria-expanded={selectedVendorIdx === index}
                  onClick={() => handleVendorToggle(index)}
                >
                  {vendor.name}
                </button>
              ))}
            </div>

            {selectedVendor && selectedVendorIdx !== null && (
              <div className={styles.modelPicker}>
                <div className={styles.groupHeading}>
                  <span>{selectedVendor.name} 模型</span>
                  <span>{selectedVendor.models.length} 个选项</span>
                </div>
                <div className={styles.modelGrid} role="group" aria-label={`${selectedVendor.name} 模型`}>
                  {selectedVendor.models.map((model) => (
                    <button
                      key={model.name}
                      type="button"
                      className={styles.modelButton}
                      title={model.notes}
                      aria-pressed={selectedModelName === model.name}
                      onClick={() => handlePresetSelect(selectedVendorIdx, model.name)}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>

                {selectedModel?.notes && (
                  <p className={styles.modelNotes}>{selectedModel.notes}</p>
                )}
                {selectedVendor.notes && (
                  <p className={styles.vendorNotes}>{selectedVendor.notes}</p>
                )}
                {selectedVendor.id === 'deepseek' && (
                  <p className={styles.providerGuide}>
                    API Key 可在
                    {' '}<a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer">DeepSeek 开放平台</a>{' '}
                    的「API Keys」页面创建。该厂商适合作为默认测试引擎。
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-custom-model-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-custom-model-heading">
            API 配置
            <SettingsHelpTooltip
              helpKey="custom-model"
              helpOpen={helpOpen}
              helpData={HELP_DATA}
              toggleHelp={toggleHelp}
              width={280}
            />
          </h3>
          <span>修改后自动保存</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.cardBody}>
            <p className={styles.supportingText}>
              {selectedModelName
                ? provider === DEFAULT_AI_PROVIDER_ID
                  ? '免费体验地址与模型已填入；API Key 留空时由服务器安全提供，也可填写自己的 Key 覆盖。'
                  : '预设模型的地址与名称已填入；可使用本地服务端密钥测试，也可填写 Key 覆盖。'
                : '手动填写兼容 OpenAI 协议的 API Key、接口地址与模型名称。'}
            </p>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>API Key</span>
                <input
                  type="password"
                  autoComplete="off"
                  className={styles.presetInput}
                  placeholder={provider === DEFAULT_AI_PROVIDER_ID ? '服务器已托管；填写后使用自己的 Key' : '例如 sk-xxx'}
                  value={customKey}
                  onChange={(event) => {
                    setCustomKey(event.target.value)
                    markConnectionUntested(customUrl, customModel)
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>API 网址</span>
                <input
                  inputMode="url"
                  className={styles.presetInput}
                  placeholder={DEFAULT_AI_BASE_URL}
                  value={customUrl}
                  onChange={(event) => {
                    markCustomProvider()
                    setCustomUrl(event.target.value)
                    markConnectionUntested(event.target.value, customModel)
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>模型名称</span>
                <input
                  className={styles.presetInput}
                  placeholder={`例如 ${DEFAULT_AI_MODEL}`}
                  value={customModel}
                  onChange={(event) => {
                    markCustomProvider()
                    setCustomModel(event.target.value)
                    markConnectionUntested(customUrl, event.target.value)
                  }}
                />
              </label>
            </div>

            <div className={styles.connectionRow} aria-live="polite">
              <div className={styles.configSummary}>
                <span>配置状态</span>
                <strong>{customKey
                  ? `已配置 · ${customModel || '未选模型'}`
                  : provider === 'custom'
                    ? '自定义接口需要 API Key'
                    : provider === DEFAULT_AI_PROVIDER_ID
                      ? `服务器免费体验 · ${customModel || DEFAULT_AI_MODEL}`
                      : '可使用本地服务端密钥'}</strong>
              </div>
              <div className={styles.connectionStatus} data-state={connTest.state}>
                <span className={styles.statusDot} aria-hidden="true" />
                <span>{connectionLabel}</span>
                <button
                  type="button"
                  className={styles.retryButton}
                  title="重新测试连通性"
                  disabled={connTest.state === 'testing'}
                  onClick={(event) => {
                    event.stopPropagation()
                    runConnTest()
                  }}
                >
                  重测
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-extra-params-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-extra-params-heading">额外请求参数</h3>
          <span>尚未开放</span>
        </div>
        <div className={`${styles.sectionCard} ${styles.mutedCard}`}>
          <div className={styles.cardBody}>
            <p className={styles.supportingText}>
              当前版本不会把额外参数写入 AI 请求，因此暂不展示无效的参数输入控件。
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-config-actions-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-config-actions-heading">配置操作</h3>
          <span>测试或恢复默认</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.actionBody}>
            <p className={styles.supportingText}>
              测试会发送一条最短请求；恢复默认会清空本地 Key，并切回服务器免费体验通道。
            </p>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={connTest.state === 'testing'}
                onClick={runConnTest}
              >
                {connTest.state === 'testing' ? '测试中…' : '测试连接'}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleClearAPIConfig}>
                恢复默认
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
