/**
 * Purpose: Manage story time-step options, selection, and menu dismissal behavior.
 * Owner: mod-pages/game-story
 * Responsibility: Time-step menu UI state and command forwarding only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AVAILABLE_TIME_STEPS,
  encodeTimeStepKey,
  setSimulationTimeStepByKey,
} from '@/mods/mod-engine/engine-api'

type TimeStepLike = Parameters<typeof encodeTimeStepKey>[0]

export function useGameStoryTimeStepMenu(timeStep: TimeStepLike) {
  const activeTimeStepKey = encodeTimeStepKey(timeStep)
  const [showStepMenu, setShowStepMenu] = useState(false)
  const stepMenuRef = useRef<HTMLDivElement>(null)
  const stepButtonRef = useRef<HTMLButtonElement>(null)
  const timeStepOptions = useMemo(
    () => AVAILABLE_TIME_STEPS.map((step) => ({
      label: step.label,
      value: encodeTimeStepKey(step),
      icon: step.icon,
      experimental: step.experimental,
    })),
    [],
  )
  const activeTimeStepLabel = timeStepOptions.find((option) => option.value === activeTimeStepKey)?.label ?? '年'

  const handleTimeStepChange = useCallback((key: string) => {
    setSimulationTimeStepByKey(key)
    setShowStepMenu(false)
  }, [])

  useEffect(() => {
    if (!showStepMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!stepMenuRef.current?.contains(event.target as Node)) setShowStepMenu(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setShowStepMenu(false)
      stepButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showStepMenu])

  return {
    activeTimeStepKey,
    activeTimeStepLabel,
    handleTimeStepChange,
    setShowStepMenu,
    showStepMenu,
    stepButtonRef,
    stepMenuRef,
    timeStepOptions,
  }
}
