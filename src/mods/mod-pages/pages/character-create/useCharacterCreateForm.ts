'use client'

/**
 * @file useCharacterCreateForm.ts
 * @description 角色创建表单共享状态逻辑（跨世界、跨新人生持久化）
 * @mod mod-pages
 */

import { useState, useMemo, useCallback } from 'react'

import { useCharacterCreationDraftStore } from '../../helpers/character-creation-draft-store'

const MAX_ATTRIBUTE_POINTS = 30
const ATTR_MIN = 0
const ATTR_MAX = 10

export interface AttrDef {
  key: string
  label: string
  desc: string
}

export const ATTRIBUTES: AttrDef[] = [
  { key: 'physique', label: '体魄', desc: '影响生命值、体力、抗病能力' },
  { key: 'mind', label: '心智', desc: '影响学习效率、技能上限、谋略' },
  { key: 'talentAptitude', label: '悟性', desc: '影响修炼速度、顿悟概率' },
  { key: 'charisma', label: '魅力', desc: '影响社交关系、人际品质' },
]

export interface CharacterFormData {
  name: string
  gender: 'male' | 'female'
  race: string
  background: string
  attributes: Record<string, number>
  customGenders: string[]
  customRaces: string[]
  backgroundPresets: Record<string, string>
  manualLifespan: string
  manualStartingAge: string
}

export interface UseCharacterCreateFormReturn {
  name: string
  nameError: string
  gender: 'male' | 'female'
  race: string
  background: string
  attributes: Record<string, number>
  customGenders: string[]
  customRaces: string[]
  backgroundPresets: Record<string, string>
  manualLifespan: string
  manualStartingAge: string
  usedPoints: number
  remainingPoints: number
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
  handleAttrChange: (key: string, value: number) => void
  maxPoints: number
  attrMin: number
  attrMax: number
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
    attributes,
    customGenders,
    customRaces,
    backgroundPresets,
    manualLifespan,
    manualStartingAge,
  } = draft

  const usedPoints = useMemo(() => {
    return Object.values(attributes).reduce((sum, v) => sum + v, 0)
  }, [attributes])

  const remainingPoints = MAX_ATTRIBUTE_POINTS - usedPoints

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

  const handleAttrChange = useCallback((key: string, value: number) => {
    const current = attributes[key as keyof typeof attributes]
    const delta = value - current
    if (usedPoints + delta > MAX_ATTRIBUTE_POINTS && delta > 0) return
    if (value < ATTR_MIN || value > ATTR_MAX) return
    updateDraft({ attributes: { ...attributes, [key]: value } })
  }, [attributes, usedPoints, updateDraft])

  return {
    name, nameError, gender: gender as 'male' | 'female', race, background, attributes,
    customGenders, customRaces, backgroundPresets, manualLifespan, manualStartingAge,
    usedPoints, remainingPoints,
    setName, setNameError, setGender, setRace, setBackground,
    setCustomGenders, setCustomRaces, setBackgroundPresets,
    setManualLifespan, setManualStartingAge,
    handleAttrChange,
    maxPoints: MAX_ATTRIBUTE_POINTS,
    attrMin: ATTR_MIN,
    attrMax: ATTR_MAX,
  }
}
