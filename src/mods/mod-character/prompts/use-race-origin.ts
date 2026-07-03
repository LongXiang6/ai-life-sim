/**
 * @module use-race-origin.ts
 * @description 种族由来生成 Hook —— 非人类种族时自动调用 AI 生成物种来源说明
 * @mod mod-character
 */

'use client'

import { useEffect, useState, useCallback } from 'react'

import { useCharacterStore } from '../store'

import { callAI } from '@/core'

import { raceOriginPrompt } from './race-origin'

import { estimateTokenBudget } from '@/mods/mod-engine'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { AIModelConfig } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

/** 默认 AI 配置（用于种族由来生成，maxTokens 基于标准量 × 120% 冗余） */
const DEFAULT_CONFIG: AIModelConfig = {
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  maxTokens: estimateTokenBudget(
    raceOriginPrompt.systemPrompt,
    raceOriginPrompt.userPromptTemplate,
    80,  // 输出 50-100 字 ~80 tokens
  ),
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
  regenerate: () => void
} {
  const race = useCharacterStore((s: { race: string }) => s.race)
  const background = useCharacterStore((s: { background: string }) => s.background)
  const raceOrigin = useCharacterStore((s: { raceOrigin: string }) => s.raceOrigin)
  const setRaceOrigin = useCharacterStore((s: { setRaceOrigin: (origin: string) => void }) => s.setRaceOrigin)

  const [isGenerating, setIsGenerating] = useState(false)
  const [hasAttempted, setHasAttempted] = useState(false)

  const generateOrigin = useCallback(async () => {
    // 人类种族不需要生成由来
    if (race === 'human') {
      setRaceOrigin('')
      return
    }

    // 没有世界描述时跳过
    if (!worldDescription) return

    setIsGenerating(true)
    setHasAttempted(true)

    try {
      const userPrompt = stringifyPrompt({
        worldDescription,
        race,
        characterBackground: background,
      })

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
        // AI 返回空内容，使用默认描述
        setRaceOrigin(`作为${race}，你在这个世界中有着独特的存在意义。`)
      }
    } catch {
      // AI 调用失败，使用默认描述（不阻塞角色创建流程）
      setRaceOrigin(`作为${race}，你在这个世界中有着独特的存在意义。`)
    } finally {
      setIsGenerating(false)
    }
  }, [race, background, worldDescription, setRaceOrigin])

  // 种族或世界描述变化时自动重新生成（数据获取 effect，在回调中异步调用 AI）
  useEffect(() => {
    if (!hasAttempted && race !== 'human' && worldDescription) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void generateOrigin()
    }
  }, [race, worldDescription, hasAttempted, generateOrigin])

  return {
    raceOrigin,
    isGenerating,
    regenerate: () => {
      setHasAttempted(false)
      void generateOrigin()
    },
  }
}
