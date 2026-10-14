/**
 * Purpose: Prepare the authoritative birth background before life begins.
 * Owner: mod-pages/fate-preview
 * Responsibility: Preview lifecycle and presentation state; control-plane data remains owned by mod-engine.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import type { AIModelConfig, NarrativeBirthProfile } from '@/foundation'
import {
  ensureOrchestratorContextFromStores,
  orchestrator,
} from '@/mods/mod-engine/engine-api'
import { useCharacterStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'

interface UseFatePreviewBirthProfileOptions {
  enabled: boolean
  worldCode: number
}

export function useFatePreviewBirthProfile({
  enabled,
  worldCode,
}: UseFatePreviewBirthProfileOptions) {
  const [birthProfile, setBirthProfile] = useState<NarrativeBirthProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const prepare = useCallback(async () => {
    if (!enabled) return
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      if (!ensureOrchestratorContextFromStores()) {
        throw new Error('当前世界与角色的模拟上下文尚未准备完成')
      }
      const settings = useSettingsStore.getState()
      const aiConfig: AIModelConfig = {
        model: settings.customModel || DEFAULT_AI_MODEL,
        temperature: settings.temperature ?? 0.8,
        stream: false,
        reasoningEffort: settings.reasoningEffort,
      }
      const characterId = useCharacterStore.getState().characterId
      const result = await orchestrator.prepareBirthBackground(
        aiConfig,
        characterId ? `fate-preview-${characterId}` : `fate-preview-world-${worldCode}`,
      )
      if (currentRequest !== requestId.current) return
      if (!result) throw new Error('你的来处未能生成')
      setBirthProfile(result)
    } catch (cause) {
      if (currentRequest !== requestId.current) return
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false)
    }
  }, [enabled, worldCode])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void prepare()
    })
    return () => {
      cancelled = true
      requestId.current += 1
    }
  }, [prepare])

  return {
    birthProfile,
    isLoading,
    error,
    retry: prepare,
  }
}
