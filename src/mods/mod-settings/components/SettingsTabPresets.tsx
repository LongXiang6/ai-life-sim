'use client'

/**
 * @module SettingsTabPresets.tsx
 * @description "模型调用" Tab —— 玩家自有 API 与 DeepSeek 预设填充
 * @mod mod-settings
 */

import { useCallback, useState } from 'react'

import { configStore } from '@/core'
import {
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
  DEEPSEEK_PRESET_BASE_URL,
  DEEPSEEK_PRESET_MODEL,
} from '@/core/ai-service'

import { useSettingsStore } from '../store'
import { SettingsHelpTooltip } from './SettingsHelpTooltip'

import styles from './SettingsTabPresets.module.css'

const CONN_STATE_KEY = 'mod-settings:conn-test'
const CONN_TEST_TIMEOUT = 10000
const CONN_TEST_ESTIMATED_TOKENS = '≤8'

interface ConnPersistState {
  state: 'idle' | 'connected' | 'failed'
  duration: number | null
  testedTarget: string
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
  'custom-model': '需要填写自己的 API Key、兼容 OpenAI 协议的接口地址和模型名称。DeepSeek 预设只填入网址与模型，不会修改已经输入的 Key。',
}

function connectionTargetKey(customUrl: string): string {
  return `custom:${customUrl.trim()}`
}

export function SettingsTabPresets() {
  const {
    customKey,
    customUrl,
    customModel,
    setProvider,
    setCustomKey,
    setCustomUrl,
    setCustomModel,
  } = useSettingsStore()
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({})
  const toggleHelp = useCallback((key: string) => {
    setHelpOpen((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  const [connTest, setConnTest] = useState<ConnectionTestState>(() => {
    const saved = loadConnState()
    if (!saved) return { state: 'idle', duration: null, tokens: '', testedAt: null }

    const store = useSettingsStore.getState()
    const activeTarget = connectionTargetKey(store.customUrl)
    const activeModel = store.customModel || DEFAULT_AI_MODEL
    if (saved.testedTarget === activeTarget && saved.testedModel === activeModel) {
      return {
        state: saved.state,
        duration: saved.duration,
        tokens: CONN_TEST_ESTIMATED_TOKENS,
        testedAt: saved.testedAt,
      }
    }
    return { state: 'idle', duration: null, tokens: '', testedAt: null }
  })

  const markConnectionUntested = useCallback((testedTarget: string, testedModel: string) => {
    setConnTest({ state: 'idle', duration: null, tokens: '', testedAt: null })
    saveConnState({
      state: 'idle',
      duration: null,
      testedTarget,
      testedModel: testedModel || DEFAULT_AI_MODEL,
      testedAt: Date.now(),
    })
  }, [])

  const handleApplyDeepSeekPreset = useCallback(() => {
    setProvider(DEFAULT_AI_PROVIDER_ID)
    setCustomUrl(DEEPSEEK_PRESET_BASE_URL)
    setCustomModel(DEEPSEEK_PRESET_MODEL)
    markConnectionUntested(connectionTargetKey(DEEPSEEK_PRESET_BASE_URL), DEEPSEEK_PRESET_MODEL)
  }, [markConnectionUntested, setCustomModel, setCustomUrl, setProvider])

  const handleClearKey = useCallback(() => {
    setCustomKey('')
    markConnectionUntested(connectionTargetKey(customUrl), customModel)
  }, [customModel, customUrl, markConnectionUntested, setCustomKey])

  const runConnTest = useCallback(() => {
    setConnTest({ state: 'testing', duration: null, tokens: '', testedAt: null })
    const testTarget = connectionTargetKey(customUrl)
    const testModel = customModel || DEFAULT_AI_MODEL

    if (!customKey.trim() || !customUrl.trim() || !customModel.trim()) {
      const testedAt = Date.now()
      setConnTest({ state: 'failed', duration: null, tokens: '', testedAt })
      saveConnState({ state: 'failed', duration: null, testedTarget: testTarget, testedModel: testModel, testedAt })
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), CONN_TEST_TIMEOUT)
    const startTime = performance.now()

    fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cache_pool: 'connectivity-test',
        model: testModel,
        messages: [{ role: 'user', content: `ping-${Date.now()}` }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
        deadline_context: {
          callKind: 'connectivity-test',
          reasoningEffort: 'disabled',
        },
        providerId: DEFAULT_AI_PROVIDER_ID,
        baseUrl: customUrl.trim(),
        apiKey: customKey.trim(),
        thinking: testModel.toLowerCase().includes('deepseek')
          ? { type: 'disabled' }
          : undefined,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        window.clearTimeout(timeout)
        const elapsed = Math.round(performance.now() - startTime)
        const testedAt = Date.now()

        if (!response.ok) {
          setConnTest({ state: 'failed', duration: elapsed, tokens: '0', testedAt })
          saveConnState({ state: 'failed', duration: elapsed, testedTarget: testTarget, testedModel: testModel, testedAt })
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
            saveConnState({ state: 'connected', duration: elapsed, testedTarget: testTarget, testedModel: testModel, testedAt })
          } else {
            setConnTest({ state: 'failed', duration: elapsed, tokens: actualTokens, testedAt })
            saveConnState({ state: 'failed', duration: elapsed, testedTarget: testTarget, testedModel: testModel, testedAt })
          }
        } catch {
          const parseElapsed = Math.round(performance.now() - startTime)
          const parseTestedAt = Date.now()
          setConnTest({ state: 'failed', duration: parseElapsed, tokens: '0', testedAt: parseTestedAt })
          saveConnState({ state: 'failed', duration: parseElapsed, testedTarget: testTarget, testedModel: testModel, testedAt: parseTestedAt })
        }
      })
      .catch(() => {
        window.clearTimeout(timeout)
        const elapsed = Math.round(performance.now() - startTime)
        const testedAt = Date.now()
        setConnTest({ state: 'failed', duration: elapsed, tokens: '0', testedAt })
        saveConnState({ state: 'failed', duration: elapsed, testedTarget: testTarget, testedModel: testModel, testedAt })
      })
  }, [customKey, customModel, customUrl])

  const connectionLabel = connTest.state === 'connected'
    ? `已连通${connTest.duration !== null ? ` · ${connTest.duration}ms` : ''}${connTest.tokens ? ` · ${connTest.tokens}` : ''}`
    : connTest.state === 'testing'
      ? '测试中…'
      : connTest.state === 'failed'
        ? '连接失败'
        : '尚未测试'

  return (
    <div className={styles.tabRoot}>
      <section className={styles.section} aria-labelledby="settings-custom-model-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-custom-model-heading">
            自己的 API
            <SettingsHelpTooltip
              helpKey="custom-model"
              helpOpen={helpOpen}
              helpData={HELP_DATA}
              toggleHelp={toggleHelp}
              width={300}
            />
          </h3>
          <span>修改后自动保存</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.cardBody}>
            <div className={styles.presetRow}>
              <p className={styles.supportingText}>
                填写自己的 Key、API 网址和模型名称。受保护主叙事当前支持 DeepSeek 官方接口。
              </p>
              <button type="button" className={styles.secondaryButton} onClick={handleApplyDeepSeekPreset}>
                填入 DeepSeek 预设
              </button>
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>API Key</span>
                <input
                  type="password"
                  autoComplete="off"
                  className={styles.presetInput}
                  placeholder="例如 sk-xxx"
                  value={customKey}
                  onChange={(event) => {
                    setProvider(DEFAULT_AI_PROVIDER_ID)
                    setCustomKey(event.target.value)
                    markConnectionUntested(connectionTargetKey(customUrl), customModel)
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>API 网址</span>
                <input
                  inputMode="url"
                  className={styles.presetInput}
                  placeholder="https://example.com/v1"
                  value={customUrl}
                  onChange={(event) => {
                    setProvider(DEFAULT_AI_PROVIDER_ID)
                    setCustomUrl(event.target.value)
                    markConnectionUntested(connectionTargetKey(event.target.value), customModel)
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>模型名称</span>
                <input
                  className={styles.presetInput}
                  placeholder="例如 deepseek-v4-flash"
                  value={customModel}
                  onChange={(event) => {
                    setProvider(DEFAULT_AI_PROVIDER_ID)
                    setCustomModel(event.target.value)
                    markConnectionUntested(connectionTargetKey(customUrl), event.target.value)
                  }}
                />
              </label>
            </div>

            <p className={styles.providerGuide}>
              DeepSeek API Key 可在
              {' '}<a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer">DeepSeek 开放平台</a>{' '}
              创建。预设按钮不会覆盖已经输入的 Key。
            </p>

            <div className={styles.connectionRow} aria-live="polite">
              <div className={styles.configSummary}>
                <span>配置状态</span>
                <strong>{customKey.trim() && customUrl.trim() && customModel.trim()
                  ? `自己的 API · ${customModel.trim()}`
                  : '请完整填写 Key、网址和模型'}</strong>
              </div>
              <div className={styles.connectionStatus} data-state={connTest.state}>
                <span className={styles.statusDot} aria-hidden="true" />
                <span>{connectionLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-config-actions-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-config-actions-heading">配置操作</h3>
          <span>使用玩家自己的凭据</span>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={connTest.state === 'testing'}
            onClick={runConnTest}
          >
            {connTest.state === 'testing' ? '测试中…' : '测试连接'}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleApplyDeepSeekPreset}>
            恢复 DeepSeek 预设
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleClearKey}>
            清空 Key
          </button>
        </div>
      </section>
    </div>
  )
}
