/**
 * Purpose: Coordinate long-lived character identity and lifespan form fields.
 * Owner: mod-pages/character-create
 * Responsibility: Form projections and setters only; attribute allocation lives in the dedicated attribute step.
 */

'use client'

import { useCallback, useState } from 'react'

import { useCharacterCreationDraftStore } from '../../helpers/character-creation-draft-store'

export interface UseCharacterCreateFormReturn {
  name: string
  nameError: string
  gender: 'male' | 'female'
  race: string
  background: string
  customGenders: string[]
  customRaces: string[]
  backgroundPresets: Record<string, string>
  manualLifespan: string
  manualStartingAge: string
  setName: (v: string) => void
  setNameError: (v: string) => void
  setGender: (v: 'male' | 'female') => void
  setRace: (v: string) => void
  setBackground: (v: string) => void
  setCustomGenders: (v: string[]) => void
  setCustomRaces: (v: string[]) => void
  setBackgroundPresets: (v: Record<string, string>) => void
  setManualLifespan: (v: string) => void
  setManualStartingAge: (v: string) => void
}

export function useCharacterCreateForm(): UseCharacterCreateFormReturn {
  const draft = useCharacterCreationDraftStore((state) => state.draft)
  const updateDraft = useCharacterCreationDraftStore((state) => state.updateDraft)
  const [nameError, setNameError] = useState('')
  const {
    name,
    gender,
    race,
    background,
    customGenders,
    customRaces,
    backgroundPresets,
    manualLifespan,
    manualStartingAge,
  } = draft

  const setName = useCallback((v: string) => updateDraft({ name: v }), [updateDraft])
  const setGender = useCallback((v: 'male' | 'female') => updateDraft({ gender: v }), [updateDraft])
  const setRace = useCallback((v: string) => updateDraft({ race: v }), [updateDraft])
  const setBackground = useCallback((v: string) => updateDraft({ background: v }), [updateDraft])
  const setCustomGenders = useCallback((v: string[]) => updateDraft({ customGenders: v }), [updateDraft])
  const setCustomRaces = useCallback((v: string[]) => updateDraft({ customRaces: v }), [updateDraft])
  const setBackgroundPresets = useCallback((v: Record<string, string>) => {
    updateDraft({ backgroundPresets: v })
  }, [updateDraft])
  const setManualLifespan = useCallback((v: string) => updateDraft({ manualLifespan: v }), [updateDraft])
  const setManualStartingAge = useCallback((v: string) => {
    updateDraft({ manualStartingAge: v })
  }, [updateDraft])

  return {
    name, nameError, gender: gender as 'male' | 'female', race, background,
    customGenders, customRaces, backgroundPresets, manualLifespan, manualStartingAge,
    setName, setNameError, setGender, setRace, setBackground,
    setCustomGenders, setCustomRaces, setBackgroundPresets,
    setManualLifespan, setManualStartingAge,
  }
}
