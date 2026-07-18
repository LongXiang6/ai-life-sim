'use client'

/**
 * @file useCharacterCreateForm.ts
 * @description 角色创建表单共享状态逻辑（含 localStorage 持久化，按世界编码隔离）
 * @mod mod-pages
 */

import { useState, useMemo, useCallback } from 'react'

import { configStore } from '@/core'
import { useWorldStore } from '@/mods/mod-world'

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

/** 表单持久化数据结构 */
interface SavedFormState {
  name: string
  gender: string
  race: string
  background: string
  attributes: Record<string, number>
}

export interface CharacterFormData {
  name: string
  gender: 'male' | 'female'
  race: string
  background: string
  attributes: Record<string, number>
}

export interface UseCharacterCreateFormReturn {
  name: string
  nameError: string
  gender: 'male' | 'female'
  race: string
  background: string
  attributes: Record<string, number>
  usedPoints: number
  remainingPoints: number
  setName: (v: string) => void
  setNameError: (v: string) => void
  setGender: (v: 'male' | 'female') => void
  setRace: (v: string) => void
  setBackground: (v: string) => void
  handleAttrChange: (key: string, value: number) => void
  maxPoints: number
  attrMin: number
  attrMax: number
}

/** 获取按世界编码隔离的存储键 */
function getStorageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `character-create-form:${worldCode || 0}`
}

/** 从 localStorage 加载已保存的表单状态 */
function loadSavedState(): SavedFormState | null {
  return configStore.get<SavedFormState>('mod-pages', getStorageKey())
}

/** 持久化表单状态到 localStorage */
function persistState(state: SavedFormState): void {
  configStore.set('mod-pages', getStorageKey(), state)
}

export function clearCharacterCreateDrafts(): void {
  for (const key of configStore.keys('mod-pages')) {
    if (key.startsWith('character-create-form:')) {
      configStore.remove('mod-pages', key)
    }
  }
}

const DEFAULT_ATTRIBUTES: Record<string, number> = {
  physique: 0,
  mind: 0,
  talentAptitude: 0,
  charisma: 0,
}

function sanitizeAttributes(input: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(ATTRIBUTES.map(({ key }) => {
    const value = input?.[key]
    return [key, typeof value === 'number' && Number.isFinite(value) ? value : 0]
  }))
}

export function useCharacterCreateForm(): UseCharacterCreateFormReturn {
  const saved = loadSavedState()

  const [name, _setName] = useState(saved?.name ?? '')
  const [nameError, setNameError] = useState('')
  const [gender, _setGender] = useState<'male' | 'female'>(
    (saved?.gender === 'male' || saved?.gender === 'female') ? saved.gender : 'male',
  )
  const [race, _setRace] = useState(saved?.race ?? 'human')
  const [background, _setBackground] = useState(saved?.background ?? '')
  const [attributes, setAttributes] = useState<Record<string, number>>(
    saved?.attributes && Object.keys(saved.attributes).length > 0
      ? sanitizeAttributes(saved.attributes)
      : { ...DEFAULT_ATTRIBUTES },
  )

  const usedPoints = useMemo(() => {
    return Object.values(attributes).reduce((sum, v) => sum + v, 0)
  }, [attributes])

  const remainingPoints = MAX_ATTRIBUTE_POINTS - usedPoints

  /** 构建当前快照 */
  const buildSnapshot = useCallback((): SavedFormState => ({
    name,
    gender,
    race,
    background,
    attributes,
  }), [name, gender, race, background, attributes])

  const setName = useCallback((v: string) => {
    _setName(v)
    configStore.set('mod-pages', getStorageKey(), { name: v, gender, race, background, attributes })
  }, [_setName, gender, race, background, attributes])

  const setGender = useCallback((v: 'male' | 'female') => {
    _setGender(v)
    persistState({ name, gender: v, race, background, attributes })
  }, [_setGender, name, race, background, attributes])

  const setRace = useCallback((v: string) => {
    _setRace(v)
    persistState({ name, gender, race: v, background, attributes })
  }, [_setRace, name, gender, background, attributes])

  const setBackground = useCallback((v: string) => {
    _setBackground(v)
    persistState({ name, gender, race, background: v, attributes })
  }, [_setBackground, name, gender, race, attributes])

  const handleAttrChange = useCallback((key: string, value: number) => {
    const current = attributes[key]
    const delta = value - current
    if (usedPoints + delta > MAX_ATTRIBUTE_POINTS && delta > 0) return
    if (value < ATTR_MIN || value > ATTR_MAX) return
    setAttributes((prev) => {
      const next = { ...prev, [key]: value }
      persistState({ name, gender, race, background, attributes: next })
      return next
    })
  }, [attributes, usedPoints, name, gender, race, background])

  // 标记 buildSnapshot 为已使用（导出供外部读取当前快照）
  void buildSnapshot

  return {
    name, nameError, gender, race, background, attributes,
    usedPoints, remainingPoints,
    setName, setNameError, setGender, setRace, setBackground,
    handleAttrChange,
    maxPoints: MAX_ATTRIBUTE_POINTS,
    attrMin: ATTR_MIN,
    attrMax: ATTR_MAX,
  }
}
