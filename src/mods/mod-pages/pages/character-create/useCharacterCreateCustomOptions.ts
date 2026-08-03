/**
 * Purpose: Manage custom gender, race catalog, and background-preset editor state.
 * Owner: mod-pages/character-create
 * Responsibility: Character option editing only; base form, lifespan, and navigation remain in the parent hook.
 */

import { useCallback, useMemo, useState } from 'react'

import { RACE_LIFESPAN } from '@/mods/mod-character'

interface UseCharacterCreateCustomOptionsOptions {
  background: string
  backgroundPresets: Record<string, string>
  gender: string
  race: string
  setBackground: (value: string) => void
  setBackgroundPresets: (value: Record<string, string>) => void
  setCustomGenders: (value: string[]) => void
  setCustomRaces: (value: string[]) => void
  setGender: (value: 'male' | 'female') => void
  setRace: (value: string) => void
  storedCustomGenders: string[]
  storedCustomRaces: string[]
}

export function useCharacterCreateCustomOptions({
  background,
  backgroundPresets,
  gender,
  race,
  setBackground,
  setBackgroundPresets,
  setCustomGenders,
  setCustomRaces,
  setGender,
  setRace,
  storedCustomGenders,
  storedCustomRaces,
}: UseCharacterCreateCustomOptionsOptions) {
  const [showCustomGender, setShowCustomGender] = useState(false)
  const [customGenderInput, setCustomGenderInput] = useState('')
  const [showCustomRace, setShowCustomRace] = useState(false)
  const [showRaceCatalog, setShowRaceCatalog] = useState(false)
  const [raceSearch, setRaceSearch] = useState('')
  const [customRaceInput, setCustomRaceInput] = useState('')
  const [showBgPresetInput, setShowBgPresetInput] = useState(false)
  const [bgPresetNameInput, setBgPresetNameInput] = useState('')

  const customGenders = useMemo(() => {
    const selected = gender !== 'male' && gender !== 'female' ? [gender] : []
    return [...new Set([...selected, ...storedCustomGenders])]
  }, [gender, storedCustomGenders])
  const customRaces = useMemo(() => {
    const selected = race && !RACE_LIFESPAN[race] ? [race] : []
    return [...new Set([...selected, ...storedCustomRaces])]
  }, [race, storedCustomRaces])
  const allGenders = useMemo(() => ['男', '女', ...customGenders], [customGenders])
  const allRaces = useMemo(() => ['human', ...customRaces], [customRaces])
  const raceCatalogOptions = useMemo(() => {
    const query = raceSearch.trim().toLowerCase()
    return Object.entries(RACE_LIFESPAN)
      .map(([id, info]) => ({ id, name: info.name }))
      .filter((item) => !query
        || item.id.toLowerCase().includes(query)
        || item.name.includes(raceSearch.trim()))
  }, [raceSearch])

  const handleAddCustomGender = useCallback(() => {
    const value = customGenderInput.trim()
    if (value && !allGenders.includes(value)) {
      setCustomGenders([...customGenders, value])
      setCustomGenderInput('')
    }
  }, [allGenders, customGenderInput, customGenders, setCustomGenders])
  const removeCustomGender = useCallback((value: string) => {
    setCustomGenders(customGenders.filter((item) => item !== value))
    if (gender === value) setGender('male')
  }, [customGenders, gender, setCustomGenders, setGender])
  const handleAddCustomRace = useCallback(() => {
    const value = customRaceInput.trim()
    if (value && !allRaces.includes(value)) {
      setCustomRaces([...customRaces, value])
      setRace(value)
      setRaceSearch('')
      setCustomRaceInput('')
      setShowCustomRace(false)
      setShowRaceCatalog(false)
    }
  }, [allRaces, customRaceInput, customRaces, setCustomRaces, setRace])
  const removeCustomRace = useCallback((value: string) => {
    setCustomRaces(customRaces.filter((item) => item !== value))
    if (race === value) setRace('human')
  }, [customRaces, race, setCustomRaces, setRace])
  const handleAddBgPreset = useCallback(() => {
    const content = background.trim()
    if (!content) return
    const inputName = bgPresetNameInput.trim()
    const fallbackName = `背景预设${Object.keys(backgroundPresets).length + 1}`
    let name = inputName || fallbackName
    let suffix = 2
    while (backgroundPresets[name]) {
      name = `${inputName || fallbackName}-${suffix}`
      suffix++
    }
    setBackgroundPresets({ ...backgroundPresets, [name]: content })
    setBgPresetNameInput('')
    setShowBgPresetInput(false)
  }, [background, backgroundPresets, bgPresetNameInput, setBackgroundPresets])
  const selectBgPreset = useCallback((name: string) => {
    if (backgroundPresets[name]) setBackground(backgroundPresets[name])
  }, [backgroundPresets, setBackground])
  const removeBgPreset = useCallback((name: string) => {
    const next = { ...backgroundPresets }
    delete next[name]
    setBackgroundPresets(next)
  }, [backgroundPresets, setBackgroundPresets])

  return {
    allGenders,
    allRaces,
    bgPresetNameInput,
    customGenderInput,
    customGenders,
    customRaceInput,
    customRaces,
    handleAddBgPreset,
    handleAddCustomGender,
    handleAddCustomRace,
    raceCatalogOptions,
    raceSearch,
    removeBgPreset,
    removeCustomGender,
    removeCustomRace,
    selectBgPreset,
    setBgPresetNameInput,
    setCustomGenderInput,
    setCustomRaceInput,
    setRaceSearch,
    setShowBgPresetInput,
    setShowCustomGender,
    setShowCustomRace,
    setShowRaceCatalog,
    showBgPresetInput,
    showCustomGender,
    showCustomRace,
    showRaceCatalog,
  }
}
