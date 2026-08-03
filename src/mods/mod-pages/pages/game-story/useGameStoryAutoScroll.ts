/**
 * Purpose: Keep the continuous story reading surface positioned at newly appended entries.
 * Owner: mod-pages/game-story
 * Responsibility: Narrative scroll ref and append-position restoration only.
 */

import { useEffect, useRef } from 'react'

import { clamp } from '@/core/shared'

export function useGameStoryAutoScroll(projectedNarrativeLength: number) {
  const narrativeEndRef = useRef<HTMLDivElement>(null)
  const prevEventsLenRef = useRef(0)

  useEffect(() => {
    const container = narrativeEndRef.current
    if (!container) return
    if (projectedNarrativeLength > prevEventsLenRef.current) {
      const newEventIndex = projectedNarrativeLength - 1
      const separator = container.querySelector(`[data-separator-for="${newEventIndex}"]`)
      if (separator) {
        const targetScroll = separator.getBoundingClientRect().top
          - container.getBoundingClientRect().top
          + container.scrollTop
          - 12
        container.scrollTo({ top: clamp(targetScroll, 0, Infinity), behavior: 'smooth' })
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      }
    }
    prevEventsLenRef.current = projectedNarrativeLength
  }, [projectedNarrativeLength])

  return narrativeEndRef
}
