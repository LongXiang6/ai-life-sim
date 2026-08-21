/**
 * @module use-race-origin.ts
 * @description 种族由来生成 Hook —— 仅在玩家显式操作时调用 AI
 * @mod mod-character
 */

'use client'

import { useState, useCallback } from 'react'

import { useCharacterStore } from '../store'

import { callAI } from '@/core'

import { raceOriginPrompt } from './race-origin'


import type { AIModelConfig } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

/** 默认 AI 配置：提供调用模型与格式，不设置输出上限。 */
const DEFAULT_CONFIG: AIModelConfig = {
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  responseFormat: { type: 'text' },
  reasoningEffort: 'disabled',
  stream: false,
}

/**
 * 生成种族由来说明
 *
 * 非人类种族时调用 AI 生成存在解释，人类种族返回空字符串。
 * 生成结果自动写入 characterStore.raceOrigin。
 */
export function useRaceOrigin(worldDescription: string): {
  raceOrigin: string
  isGenerating: boolean
  error: string | null
  regenerate: () => void
} {
  const race = useCharacterStore((s: { race: string }) => s.race)
  const background = useCharacterStore((s: { background: string }) => s.background)
  const raceOrigin = useCharacterStore((s: { raceOrigin: string }) => s.raceOrigin)
  const setRaceOrigin = useCharacterStore((s: { setRaceOrigin: (origin: string) => void }) => s.setRaceOrigin)

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateOrigin = useCallback(async () => {
    // 人类种族不需要生成由来
    if (race === 'human') {
      setRaceOrigin('')
      setError(null)
      return
    }

    // 没有世界描述时跳过
    if (!worldDescription) return

    setIsGenerating(true)
    setError(null)

    try {
      const userPrompt = stringifyPrompt({
        worldDescription,
        race,
        characterBackground: background,
      })

      // 延迟加载设置 MOD，使角色 Prompt Hook 与引擎入口保持单向运行依赖。
      const { useSettingsStore } = await import('@/mods/mod-settings')
      const { useWorldStore } = await import('@/mods/mod-world')
      const { customKey, customUrl, provider, customModel } = useSettingsStore.getState()
      const model = customModel || DEFAULT_CONFIG.model
      const lowfSessionId = String(useWorldStore.getState().worldCode)
      const result = await callAI(
        raceOriginPrompt.systemPrompt,
        userPrompt,
        {
          config: { ...DEFAULT_CONFIG, model },
          pool: 'lowFrequency',
          sessionId: lowfSessionId,
          providerId: provider,
          customBaseUrl: customUrl || undefined,
          customModel: model,
          apiKey: customKey || undefined,
          logContext: { pool: 'lowFrequency', sessionId: lowfSessionId, callKind: 'race-origin' },
          logMeta: { userId: `lowf-${lowfSessionId}` },
        },
      )

      if (result && result.trim() !== '' && result.trim() !== '无') {
        setRaceOrigin(result.trim())
      } else {
        setRaceOrigin('')
        setError('种族由来生成返回空内容，请重新生成。')
      }
    } catch (generationError) {
      setRaceOrigin('')
      setError(generationError instanceof Error ? generationError.message : '种族由来生成失败，请重新生成。')
    } finally {
      setIsGenerating(false)
    }
  }, [race, background, worldDescription, setRaceOrigin])

  return {
    raceOrigin,
    isGenerating,
    error,
    regenerate: () => void generateOrigin(),
  }
}
