/**
 * Purpose: Coordinate character-creation form state and navigation commands.
 * Owner: mod-pages/character-create
 * Responsibility: Hook state orchestration only; pure rules, display metadata, and types live in sibling modules.
 */

'use client'

import { useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import {
  useCharacterStore, RACE_LIFESPAN, randomName,
  filterDigitsOnly,
} from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'

import { useCharacterCreateForm } from './useCharacterCreateForm'
import {
  ADDITIONAL_GENDERS,
  LABELS,
  genderOptionToValue,
  getBgPresetIcon,
  getGenderIcon,
  getRaceDisplayName,
  getRaceIcon,
  isGenderOptionActive,
} from './character-create-options'
import {
  buildAgeSetupPreview,
  buildConfirmedRaceLifespan,
  computeMaxAge,
  isPrimitiveWorld,
} from './character-create-helpers'
import type { UseCharacterCreateLogicReturn } from './character-create.types'
import { useCharacterCreateCustomOptions } from './useCharacterCreateCustomOptions'

export { LABELS } from './character-create-options'
export type { UseCharacterCreateLogicReturn } from './character-create.types'

// ============================================================
// Hook
// ============================================================

export function useCharacterCreateLogic(): UseCharacterCreateLogicReturn {
  const router = useRouter()
  const store = useCharacterStore
  const setName = store((s) => s.setName)
  const setGender = store((s) => s.setGender)
  const setAge = store((s) => s.setAge)
  const setCharacterBase = store((s) => s.setCharacterBase)
  const setLifespanDraft = store((s) => s.setLifespanDraft)

  // 检测是否为原始社会
  const eraStartYear = useWorldStore((s) => s.eraStartYear)
  const worldTags = useWorldStore((s) => s.worldTags)
  const primitiveWorld = useMemo(
    () => isPrimitiveWorld(eraStartYear, worldTags),
    [eraStartYear, worldTags],
  )

  const {
    name, nameError, gender, race, background,
    customGenders: storedCustomGenders,
    customRaces: storedCustomRaces,
    backgroundPresets: bgPresets,
    manualLifespan: storedManualLifespan,
    manualStartingAge: storedManualStartingAge,
    setName: setFormName, setNameError, setGender: setFormGender, setRace, setBackground,
    setCustomGenders: setStoredCustomGenders,
    setCustomRaces: setStoredCustomRaces,
    setBackgroundPresets,
    setManualLifespan: setStoredManualLifespan,
    setManualStartingAge: setStoredManualStartingAge,
  } = useCharacterCreateForm()

  const {
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
  } = useCharacterCreateCustomOptions({
    background,
    backgroundPresets: bgPresets,
    gender,
    race,
    setBackground,
    setBackgroundPresets,
    setCustomGenders: setStoredCustomGenders,
    setCustomRaces: setStoredCustomRaces,
    setGender: setFormGender,
    setRace,
    storedCustomGenders,
    storedCustomRaces,
  })

  // ---- 寿命 ----
  const [computedLifespan, setComputedLifespan] = useState<number | null>(() => (
    storedManualLifespan ? computeMaxAge(race, Number.parseInt(storedManualLifespan, 10)) : null
  ))
  const [computedStartingAge, setComputedStartingAge] = useState<number | null>(() => (
    storedManualStartingAge ? Number.parseInt(storedManualStartingAge, 10) : null
  ))

  const setManualLifespan = useCallback((v: string) => {
    setStoredManualLifespan(filterDigitsOnly(v))
  }, [setStoredManualLifespan])
  const setManualStartingAge = useCallback((v: string) => {
    setStoredManualStartingAge(filterDigitsOnly(v))
  }, [setStoredManualStartingAge])

  const manualLifespan = storedManualLifespan
  const manualStartingAge = storedManualStartingAge

  // 输入框保留“出生”的空值语义；预览值单独推导，避免把 0 写回受控输入造成 090、09018 等前缀累积。
  const ageSetupPreview = useMemo(() => buildAgeSetupPreview({
    computedLifespan,
    manualLifespan,
    manualStartingAge,
    race,
  }), [computedLifespan, manualLifespan, manualStartingAge, race])

  // ---- 随机名称 ----
  const handleDice = useCallback(() => {
    if (!gender) {
      setNameError('请先选择性别后再随机生成姓名')
      return
    }
    const genderForName = gender === 'male' ? '男' : gender === 'female' ? '女' : undefined
    const newName = randomName(genderForName, primitiveWorld)
    setFormName(newName)
  }, [gender, primitiveWorld, setFormName, setNameError])

  // ---- 寿命检测 ----
  const handleDetectLifespan = useCallback(() => {
    setComputedLifespan(ageSetupPreview.maxAge)
    setComputedStartingAge(ageSetupPreview.startingAge)
  }, [ageSetupPreview])

  // ============================================================
  // 种族信息
  // ============================================================

  const raceInfo = RACE_LIFESPAN[race]

  const resolveAgeSetup = useCallback(() => {
    return { maxAge: ageSetupPreview.maxAge, startingAge: ageSetupPreview.startingAge }
  }, [ageSetupPreview])

  const nextBlockReason = !name.trim() || name.trim() === 'AI命名'
    ? '请先填写角色姓名，或使用随机生成'
    : ageSetupPreview.error
  const canProceed = nextBlockReason === null

  // ============================================================
  // 导航
  // ============================================================

  const handleNext = useCallback(() => {
    if (nameError) setNameError('')

    const trimmed = name.trim()
    if (!trimmed || trimmed === 'AI命名') {
      setNameError('请先填写角色姓名，或使用随机生成')
      return
    }
    if (ageSetupPreview.error) return
    setName(trimmed)
    setGender(gender)
    const { maxAge, startingAge } = resolveAgeSetup()
    setAge(startingAge)
    setCharacterBase({ startingAge })

    const confirmedRace = buildConfirmedRaceLifespan(race, maxAge)
    setLifespanDraft({ raceId: race, race: confirmedRace, maximumLifespanYears: maxAge })

    store.getState().setRace(race)
    store.getState().setBackground(background)

    router.push('/talent-draw')
  }, [name, nameError, gender, race, setName, setGender, setAge, setCharacterBase, setLifespanDraft, background, router, setNameError, store, resolveAgeSetup, ageSetupPreview.error])

  const handleBack = useCallback(() => {
    setGender(gender)
    const { maxAge, startingAge } = resolveAgeSetup()
    setAge(startingAge)
    store.getState().setRace(race)
    store.getState().setBackground(background)
    setCharacterBase({ startingAge })
    const confirmedRace = buildConfirmedRaceLifespan(race, maxAge)
    setLifespanDraft({ raceId: race, race: confirmedRace, maximumLifespanYears: maxAge })
    router.push('/new-game/world-customize')
  }, [gender, race, background, router, setGender, setAge, setCharacterBase, setLifespanDraft, store, resolveAgeSetup])

  return {
    // 表单
    name, nameError, gender, race, background,
    setFormName, setNameError, setFormGender, setRace, setBackground,

    // 姓名
    handleDice,

    // 性别
    allGenders, customGenders,
    showCustomGender, setShowCustomGender,
    customGenderInput, setCustomGenderInput,
    handleAddCustomGender, removeCustomGender,
    getGenderIcon,
    isGenderOptionActive,
    genderOptionToValue,
    ADDITIONAL_GENDERS,

    // 种族
    allRaces, customRaces,
    showCustomRace, setShowCustomRace,
    showRaceCatalog, setShowRaceCatalog,
    raceSearch, setRaceSearch,
    customRaceInput, setCustomRaceInput,
    handleAddCustomRace, removeCustomRace,
    getRaceIcon,
    getRaceDisplayName,
    raceInfo,
    raceCatalogOptions,

    // 背景预设
    bgPresets, showBgPresetInput, setShowBgPresetInput,
    bgPresetNameInput, setBgPresetNameInput,
    handleAddBgPreset, selectBgPreset, removeBgPreset,
    getBgPresetIcon,

    // 寿命
    manualLifespan, setManualLifespan,
    manualStartingAge, setManualStartingAge,
    computedLifespan, computedStartingAge,
    previewLifespan: ageSetupPreview.maxAge,
    previewStartingAge: ageSetupPreview.startingAge,
    ageSetupError: ageSetupPreview.error,
    canProceed,
    nextBlockReason,
    handleDetectLifespan,

    // 导航
    handleBack, handleNext,

    // 常量
    LABELS,
    RACE_LIFESPAN,
  }
}
