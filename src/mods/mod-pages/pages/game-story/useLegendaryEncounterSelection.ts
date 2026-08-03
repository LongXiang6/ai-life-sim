/**
 * Purpose: Load the one-time legendary encounter selection for the active life run.
 * Owner: mod-pages/game-story
 * Responsibility: Legendary encounter fetch and Store handoff only.
 */

import { useEffect } from 'react'

import { fetchLegendaryEncounter } from '@/core/player-content/player-content-client'
import { useEngineStore } from '@/mods/mod-engine'

export function useLegendaryEncounterSelection() {
  const lifeRunId = useEngineStore((state) => state.lifeRunId)
  const checkedLifeRunId = useEngineStore((state) => state.legendaryEncounterCheckedForLifeRunId)
  const setSelection = useEngineStore((state) => state.setLegendaryEncounterSelection)

  useEffect(() => {
    if (!lifeRunId || checkedLifeRunId === lifeRunId) return
    let active = true
    void fetchLegendaryEncounter(lifeRunId)
      .then((encounter) => {
        if (active) setSelection(lifeRunId, encounter)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [checkedLifeRunId, lifeRunId, setSelection])
}
