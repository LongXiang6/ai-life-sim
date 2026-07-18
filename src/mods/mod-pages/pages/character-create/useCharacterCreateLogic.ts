'use client'

/**
 * @file useCharacterCreateLogic.ts
 * @description 角色创建共享业务逻辑 hook —— 供单一响应式创建界面复用
 * @mod mod-pages
 */

import { useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import {
  useCharacterStore, RACE_LIFESPAN, randomName,
  MAX_LIFESPAN_CAP, BASE_HUMAN_LIFESPAN,
  filterDigitsOnly,
} from '@/mods/mod-character'
import type { BaseAttributes, RaceLifespanConfig } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'

import { useCharacterCreateForm, ATTRIBUTES } from './useCharacterCreateForm'

// ============================================================
// 常量
// ============================================================

/** 默认性别图标 */
const DEFAULT_GENDER_ICONS: Record<string, string> = {
  '男': '♂️', '女': '♀️',
}

/** 扩展性别选项 */
const ADDITIONAL_GENDERS: Record<string, string> = {
  '哈基米': '🐱', '赛博生命体': '🤖', '无性别': '⚪', '神': '☀️',
  '男娘': '💅', '双性': '⚧', '非二元': '🏳️‍⚧️', '跨性别': '🏳️‍⚧️',
  '流性别': '⬌', '薛定谔的性别': '🌀', '不方便透露': '🚫', '奶龙': '🐉',
  '武装直升机': '🚁', '外星生物': '👽', '机器人': '🤖', '独角兽': '🦄',
  '沃尔玛购物袋': '🛒', '性感母蟑螂': '🪳', '香菜': '🥬', '神奇海螺': '🐚',
}

/** 种族图标 */
const DEFAULT_RACE_ICONS: Record<string, string> = {
  '人类': '🧑', '妖族': '🦊', '魔族': '👿', '精灵': '🧝', '龙裔': '🐲',
  'AI意识体': '💻', '灵兽': '🐉', '灵体': '👻', '半妖': '👤',
}

/** 背景预设图标 */
const BG_PRESET_ICONS: Record<string, string> = {
  '贵族': '👑', '平民': '👤', '科学家': '🔬', '武士': '⚔️',
  '忍者': '🥷', '浪人': '🍂', '商人': '💰', '孤儿': '💔',
  '学者': '📚', '街头': '🏚️', '农家': '🌾', '流浪者': '🚶',
}

// ============================================================
// 帮助函数
// ============================================================

/** 角色创建阶段只使用显式覆盖或结构化种族寿命。 */
function computeMaxAge(race: string, manualOverride?: number): number {
  if (manualOverride && manualOverride > 0) {
    return Math.min(manualOverride, MAX_LIFESPAN_CAP)
  }

  const raceInfo = RACE_LIFESPAN[race]
  let maxAge = BASE_HUMAN_LIFESPAN

  if (raceInfo && raceInfo.baseMaxAge > maxAge) maxAge = raceInfo.baseMaxAge

  return Math.min(Math.max(maxAge, 1), MAX_LIFESPAN_CAP)
}

/** 将目录种族或玩家自定义种族统一写成 Character Store 已有的结构化寿命形状。 */
function buildConfirmedRaceLifespan(race: string, maxAge: number): RaceLifespanConfig {
  const catalogRace = RACE_LIFESPAN[race]
  if (catalogRace) return { ...catalogRace }

  const humanDefaults = RACE_LIFESPAN.human!
  return {
    ...humanDefaults,
    name: race.trim() || '自定义种族',
    baseMaxAge: maxAge,
  }
}

/** 只把当前四项公开基础属性写入角色状态，忽略旧编辑态中的遗留字段。 */
function toBaseAttributes(attributes: Record<string, number>): BaseAttributes {
  return {
    physique: attributes.physique ?? 0,
    mind: attributes.mind ?? 0,
    talentAptitude: attributes.talentAptitude ?? 0,
    charisma: attributes.charisma ?? 0,
  }
}

function readStoredAgeSetup(race: string): { maxAge: number; startingAge: number } | null {
  const character = useCharacterStore.getState()
  const expectedRaceName = RACE_LIFESPAN[race]?.name ?? race.trim()
  const { lifespan, characterBase } = character

  if (
    !character.name.trim()
    || character.race !== race
    || !expectedRaceName
    || lifespan.race.name !== expectedRaceName
    || !Number.isFinite(lifespan.maxAge)
    || lifespan.maxAge <= 0
    || !Number.isFinite(characterBase.startingAge)
    || characterBase.startingAge < 0
    || characterBase.startingAge >= lifespan.maxAge
  ) {
    return null
  }

  return { maxAge: lifespan.maxAge, startingAge: characterBase.startingAge }
}

function isGenderOptionActive(option: string, current: string): boolean {
  if (option === '男') return current === 'male'
  if (option === '女') return current === 'female'
  return current === option
}

function genderOptionToValue(option: string): 'male' | 'female' {
  if (option === '男') return 'male'
  if (option === '女') return 'female'
  return option as 'male' | 'female'
}

// ============================================================
// LABELS — 所有硬编码文案，从 Desktop 逐字提取
// ============================================================

export const LABELS = {
  // Header
  headerIcon: '👤' as const,
  headerTitle: '角色设定' as const,
  headerSubtitle: '设定你的性别和物种' as const,

  // 姓名
  nameLabel: '姓名' as const,
  nameHint: '(可选，留空则从本地姓名库随机生成)' as const,
  namePlaceholder: '输入角色姓名...' as const,
  diceBtnTitle: '随机名称' as const,

  // 性别
  genderLabel: '性别' as const,
  genderHint: '（默认：男）' as const,
  moreBtnText: '更多' as const,
  moreGenderBtnTitle: '添加更多性别选项' as const,
  maleText: '男' as const,
  femaleText: '女' as const,

  // 自定义性别面板
  customGenderPlaceholder: '输入性别名称...' as const,
  customAddBtn: '添加' as const,

  // 种族
  raceLabel: '种族' as const,
  moreRaceBtnTitle: '添加更多种族选项' as const,
  humanRaceText: '人类' as const,
  customRaceText: '自定义' as const,
  raceSearchPlaceholder: '搜索种族...' as const,

  // 自定义种族面板
  customRacePlaceholder: '输入种族名称...' as const,

  // 寿命检测
  lifespanLabel: '寿命设定' as const,
  detectBtnText: '🔄 检测寿命' as const,
  detectBtnTitle: '根据种族/背景重新计算寿命与起始年龄' as const,
  lifespanPlaceholder: '寿命上限(岁)' as const,
  startingAgePlaceholder: '起始年龄(岁)' as const,
  autoHint: '留空则自动' as const,
  lifespanPrefix: '🕐 寿命约' as const,
  lifespanUnit: '岁' as const,
  startingAgePrefix: '· 起始' as const,
  startingAgeUnit: '岁' as const,
  birthText: '· 出生' as const,

  // 背景信息
  bgLabel: '背景信息' as const,
  bgHint: '(可选)' as const,
  bgPlaceholder: '告诉命运编织者更多关于你的角色的事...' as const,
  presetNamePlaceholder: '预设名称...' as const,
  saveBtn: '保存' as const,
  cancelBtn: '取消' as const,
  savePresetBtn: '+ 保存预设' as const,

  // 属性分配
  attrLabel: '属性分配' as const,
  remainingPointsHint: '剩余点数：' as const,

  // 底部操作栏
  backTitle: '返回世界选择' as const,
  backTitleMobile: '返回' as const,
  confirmText: '确认' as const,

  // 其他
  raceInfoPrefix: '基础寿命' as const,
  raceInfoDecay: '衰减倍率' as const,
  raceInfoYearUnit: '年' as const,
  charCountSeparator: '/' as const,

  // 种族信息（非人类时显示）
  raceDisplaySeparator: ' · ' as const,

}

// ============================================================
// 导出类型
// ============================================================

export interface UseCharacterCreateLogicReturn {
  // 表单数据
  name: string
  nameError: string
  gender: 'male' | 'female'
  race: string
  background: string
  attributes: Record<string, number>
  usedPoints: number
  remainingPoints: number
  maxPoints: number
  attrMin: number
  attrMax: number

  // 表单操作
  setFormName: (v: string) => void
  setNameError: (v: string) => void
  setFormGender: (v: 'male' | 'female') => void
  setRace: (v: string) => void
  setBackground: (v: string) => void
  handleAttrChange: (key: string, value: number) => void

  // 姓名
  handleDice: () => void

  // 性别
  allGenders: string[]
  customGenders: string[]
  showCustomGender: boolean
  setShowCustomGender: (v: boolean) => void
  customGenderInput: string
  setCustomGenderInput: (v: string) => void
  handleAddCustomGender: () => void
  removeCustomGender: (g: string) => void
  getGenderIcon: (g: string) => string
  isGenderOptionActive: (option: string, current: string) => boolean
  genderOptionToValue: (option: string) => 'male' | 'female'
  ADDITIONAL_GENDERS: Record<string, string>

  // 种族
  allRaces: string[]
  customRaces: string[]
  showCustomRace: boolean
  setShowCustomRace: (v: boolean) => void
  showRaceCatalog: boolean
  setShowRaceCatalog: (v: boolean) => void
  raceSearch: string
  setRaceSearch: (v: string) => void
  customRaceInput: string
  setCustomRaceInput: (v: string) => void
  handleAddCustomRace: () => void
  removeCustomRace: (r: string) => void
  getRaceIcon: (r: string) => string
  getRaceDisplayName: (r: string) => string
  raceInfo: typeof RACE_LIFESPAN[string] | undefined
  raceCatalogOptions: Array<{ id: string; name: string }>

  // 背景预设
  bgPresets: Record<string, string>
  showBgPresetInput: boolean
  setShowBgPresetInput: (v: boolean) => void
  bgPresetNameInput: string
  setBgPresetNameInput: (v: string) => void
  handleAddBgPreset: () => void
  selectBgPreset: (name: string) => void
  removeBgPreset: (name: string) => void
  getBgPresetIcon: (n: string) => string

  // 寿命检测
  manualLifespan: string
  setManualLifespan: (v: string) => void
  manualStartingAge: string
  setManualStartingAge: (v: string) => void
  computedLifespan: number | null
  computedStartingAge: number | null
  previewLifespan: number
  previewStartingAge: number
  ageSetupError: string | null
  canProceed: boolean
  nextBlockReason: string | null
  handleDetectLifespan: () => void

  // 导航
  handleBack: () => void
  handleNext: () => void

  // 常量
  LABELS: typeof LABELS
  ATTRIBUTES: typeof ATTRIBUTES
  RACE_LIFESPAN: typeof RACE_LIFESPAN
}

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
  const setLifespan = store((s) => s.setLifespan)

  // 检测是否为原始社会
  const eraStartYear = useWorldStore((s) => s.eraStartYear)
  const worldTags = useWorldStore((s) => s.worldTags)
  const isPrimitiveWorld = useMemo(() => {
    if (eraStartYear < -10000) return true
    const primitiveKeywords = ['原始', '上古', '远古', '石器', '洪荒', '史前', 'primitive', 'prehistoric']
    return worldTags.some((t) => primitiveKeywords.some((kw) => t.includes(kw)))
  }, [eraStartYear, worldTags])

  const {
    name, nameError, gender, race, background, attributes,
    usedPoints, remainingPoints, maxPoints, attrMin, attrMax,
    setName: setFormName, setNameError, setGender: setFormGender, setRace, setBackground,
    handleAttrChange,
  } = useCharacterCreateForm()

  // ---- 自定义性别 ----
  const [customGenders, setCustomGenders] = useState<string[]>(() => {
    const selectedGender = gender as string
    return selectedGender !== 'male' && selectedGender !== 'female' ? [selectedGender] : []
  })
  const [showCustomGender, setShowCustomGender] = useState(false)
  const [customGenderInput, setCustomGenderInput] = useState('')

  // ---- 自定义种族 ----
  const [customRaces, setCustomRaces] = useState<string[]>(() =>
    race && !RACE_LIFESPAN[race] ? [race] : [],
  )
  const [showCustomRace, setShowCustomRace] = useState(false)
  const [showRaceCatalog, setShowRaceCatalog] = useState(false)
  const [raceSearch, setRaceSearch] = useState('')
  const [customRaceInput, setCustomRaceInput] = useState('')

  // ---- 背景 ----
  const [bgPresets, setBgPresets] = useState<Record<string, string>>({})
  const [showBgPresetInput, setShowBgPresetInput] = useState(false)
  const [bgPresetNameInput, setBgPresetNameInput] = useState('')

  // ---- 寿命 ----
  const [storedAgeSetup] = useState(() => readStoredAgeSetup(race))
  const [_manualLifespan, _setManualLifespan] = useState(() => storedAgeSetup ? String(storedAgeSetup.maxAge) : '')
  const [_manualStartingAge, _setManualStartingAge] = useState(() => (
    storedAgeSetup && storedAgeSetup.startingAge > 0 ? String(storedAgeSetup.startingAge) : ''
  ))
  const [computedLifespan, setComputedLifespan] = useState<number | null>(() => storedAgeSetup?.maxAge ?? null)
  const [computedStartingAge, setComputedStartingAge] = useState<number | null>(() => storedAgeSetup?.startingAge ?? null)

  const setManualLifespan = useCallback((v: string) => _setManualLifespan(filterDigitsOnly(v)), [])
  const setManualStartingAge = useCallback((v: string) => _setManualStartingAge(filterDigitsOnly(v)), [])

  const manualLifespan = _manualLifespan
  const manualStartingAge = _manualStartingAge

  // 输入框保留“出生”的空值语义；预览值单独推导，避免把 0 写回受控输入造成 090、09018 等前缀累积。
  const ageSetupPreview = useMemo(() => {
    const confirmedManualMaxAge = manualLifespan
      ? Number.parseInt(manualLifespan, 10)
      : undefined
    const maxAge = confirmedManualMaxAge !== undefined && Number.isFinite(confirmedManualMaxAge)
      ? computeMaxAge(race, confirmedManualMaxAge)
      : computedLifespan ?? computeMaxAge(race)
    const parsedStartingAge = manualStartingAge ? Number.parseInt(manualStartingAge, 10) : 0
    const startingAge = Number.isFinite(parsedStartingAge) ? parsedStartingAge : 0
    const error = startingAge >= maxAge
      ? `起始年龄必须小于预期寿命（${maxAge} 岁）`
      : null
    return { maxAge, startingAge, error }
  }, [computedLifespan, manualLifespan, manualStartingAge, race])

  // ---- 合并选项列表 ----
  const allGenders = useMemo(() => ['男', '女', ...customGenders], [customGenders])
  const allRaces = useMemo(() => ['human', ...customRaces], [customRaces])
  const raceCatalogOptions = useMemo(() => {
    const q = raceSearch.trim().toLowerCase()
    return Object.entries(RACE_LIFESPAN)
      .map(([id, info]) => ({ id, name: info.name }))
      .filter((item) => !q || item.id.toLowerCase().includes(q) || item.name.includes(raceSearch.trim()))
  }, [raceSearch])

  // ---- 图标获取器 ----
  const getGenderIcon = (g: string) => DEFAULT_GENDER_ICONS[g] || ADDITIONAL_GENDERS[g] || '👤'
  const getRaceDisplayName = (r: string) => RACE_LIFESPAN[r]?.name || r
  const getRaceIcon = (r: string) => DEFAULT_RACE_ICONS[getRaceDisplayName(r)] || '👤'
  const getBgPresetIcon = (n: string) => BG_PRESET_ICONS[n] || '📋'

  // ---- 随机名称 ----
  const handleDice = useCallback(() => {
    if (!gender) {
      setNameError('请先选择性别后再随机生成姓名')
      return
    }
    const genderForName = gender === 'male' ? '男' : gender === 'female' ? '女' : undefined
    const newName = randomName(genderForName, isPrimitiveWorld)
    setFormName(newName)
  }, [gender, isPrimitiveWorld, setFormName, setNameError])

  // ---- 寿命检测 ----
  const handleDetectLifespan = useCallback(() => {
    setComputedLifespan(ageSetupPreview.maxAge)
    setComputedStartingAge(ageSetupPreview.startingAge)
  }, [ageSetupPreview])

  // ---- 自定义性别操作 ----
  const handleAddCustomGender = useCallback(() => {
    const v = customGenderInput.trim()
    if (v && !allGenders.includes(v)) {
      setCustomGenders((prev) => [...prev, v])
      setCustomGenderInput('')
    }
  }, [customGenderInput, allGenders])

  const removeCustomGender = (g: string) => {
    setCustomGenders((prev) => prev.filter((x) => x !== g))
    if (gender === g) setFormGender('male')
  }

  // ---- 自定义种族操作 ----
  const handleAddCustomRace = useCallback(() => {
    const v = customRaceInput.trim()
    if (v && !allRaces.includes(v)) {
      setCustomRaces((prev) => [...prev, v])
      setRace(v)
      setRaceSearch('')
      setCustomRaceInput('')
      setShowCustomRace(false)
      setShowRaceCatalog(false)
    }
  }, [customRaceInput, allRaces, setRace])

  const removeCustomRace = (r: string) => {
    setCustomRaces((prev) => prev.filter((x) => x !== r))
    if (race === r) setRace('human')
  }

  // ---- 背景预设操作 ----
  const handleAddBgPreset = useCallback(() => {
    const content = background.trim()
    if (!content) return

    const inputName = bgPresetNameInput.trim()
    const fallbackName = `背景预设${Object.keys(bgPresets).length + 1}`
    let n = inputName || fallbackName
    let suffix = 2
    while (bgPresets[n]) {
      n = `${inputName || fallbackName}-${suffix}`
      suffix++
    }

    if (n) {
      setBgPresets((prev) => ({ ...prev, [n]: content }))
      setBgPresetNameInput('')
      setShowBgPresetInput(false)
    }
  }, [bgPresetNameInput, background, bgPresets])

  const selectBgPreset = (name: string) => {
    if (bgPresets[name]) setBackground(bgPresets[name])
  }

  const removeBgPreset = (name: string) => {
    setBgPresets((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

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

    const confirmedAttributes = toBaseAttributes(attributes)
    setCharacterBase({
      base: confirmedAttributes,
      current: { ...confirmedAttributes },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      startingAge,
    })

    const confirmedRace = buildConfirmedRaceLifespan(race, maxAge)
    setLifespan({ race: confirmedRace, maxAge, baseMaxAge: confirmedRace.baseMaxAge })

    store.getState().setRace(race)
    store.getState().setBackground(background)

    router.push('/talent-draw')
  }, [name, nameError, gender, race, setName, setGender, setAge, setCharacterBase, setLifespan, background, attributes, router, setNameError, store, resolveAgeSetup, ageSetupPreview.error])

  const handleBack = useCallback(() => {
    setGender(gender)
    const { maxAge, startingAge } = resolveAgeSetup()
    setAge(startingAge)
    store.getState().setRace(race)
    store.getState().setBackground(background)
    const confirmedAttributes = toBaseAttributes(attributes)
    setCharacterBase({
      base: confirmedAttributes,
      current: { ...confirmedAttributes },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      startingAge,
    })
    const confirmedRace = buildConfirmedRaceLifespan(race, maxAge)
    setLifespan({ race: confirmedRace, maxAge, baseMaxAge: confirmedRace.baseMaxAge })
    router.push('/new-game/world-customize')
  }, [gender, race, attributes, background, router, setGender, setAge, setCharacterBase, setLifespan, store, resolveAgeSetup])

  return {
    // 表单
    name, nameError, gender, race, background, attributes,
    usedPoints, remainingPoints, maxPoints, attrMin, attrMax,
    setFormName, setNameError, setFormGender, setRace, setBackground, handleAttrChange,

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
    ATTRIBUTES,
    RACE_LIFESPAN,
  }
}
