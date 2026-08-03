/**
 * Purpose: Coordinate manual and delayed retry attempts for one story round.
 * Owner: mod-pages/game-story
 * Responsibility: Retry budget, timer, and retry command gating only.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createAutoNarrativeRetryGate,
  getAutoNarrativeRetryDelay,
  invalidateAutoNarrativeRetry,
  runAutoNarrativeRetryAttempt,
} from './narrative-retry-policy'

interface UseGameStoryAutoRetryOptions {
  advanceRound: () => Promise<unknown>
  hasUnresolvedBranch: boolean
  isAdvancing: boolean
  isComplete: boolean
  isDead: boolean
  isRuntimeReady: boolean
  narrativeError?: string | null
}

export function useGameStoryAutoRetry({
  advanceRound,
  hasUnresolvedBranch,
  isAdvancing,
  isComplete,
  isDead,
  isRuntimeReady,
  narrativeError,
}: UseGameStoryAutoRetryOptions) {
  const [autoRetryAttempt, setAutoRetryAttempt] = useState(0)
  const autoRetryGateRef = useRef(createAutoNarrativeRetryGate())

  const runNarrativeAttempt = useCallback(async () => {
    if (!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch) return
    await advanceRound()
  }, [advanceRound, hasUnresolvedBranch, isAdvancing, isComplete, isDead, isRuntimeReady])

  const handleNarrativeAdvance = useCallback(async () => {
    if (narrativeError) {
      invalidateAutoNarrativeRetry(autoRetryGateRef.current)
      setAutoRetryAttempt(0)
    }
    await runNarrativeAttempt()
  }, [narrativeError, runNarrativeAttempt])

  useEffect(() => {
    if (!narrativeError) {
      if (!isAdvancing) {
        invalidateAutoNarrativeRetry(autoRetryGateRef.current)
        /* eslint-disable react-hooks/set-state-in-effect -- reset local retry budget after a completed request */
        setAutoRetryAttempt(0)
        /* eslint-enable react-hooks/set-state-in-effect */
      }
      return
    }
    if (!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch) return

    const attemptIndex = autoRetryAttempt
    const retryDelay = getAutoNarrativeRetryDelay(attemptIndex)
    if (retryDelay === null) return
    const gate = autoRetryGateRef.current
    const generation = gate.generation
    const retryTimer = window.setTimeout(() => {
      void runAutoNarrativeRetryAttempt(gate, generation, runNarrativeAttempt)
        .then((started) => {
          if (!started || generation !== gate.generation) return
          setAutoRetryAttempt(attemptIndex + 1)
        })
    }, retryDelay)
    return () => window.clearTimeout(retryTimer)
  }, [
    autoRetryAttempt,
    hasUnresolvedBranch,
    isAdvancing,
    isComplete,
    isDead,
    isRuntimeReady,
    narrativeError,
    runNarrativeAttempt,
  ])

  const autoRetryPending = Boolean(
    narrativeError
      && isRuntimeReady
      && !isDead
      && !isComplete
      && !isAdvancing
      && !hasUnresolvedBranch
      && getAutoNarrativeRetryDelay(autoRetryAttempt) !== null,
  )

  return { autoRetryPending, handleNarrativeAdvance }
}
