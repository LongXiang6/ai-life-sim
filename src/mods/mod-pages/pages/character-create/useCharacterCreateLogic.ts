'use client'

/**
 * @file useCharacterCreateLogic.ts
 * @description 角色创建共享业务逻辑 hook —— 从 CharacterCreateDesktop 提取，供 Desktop/Mobile 复用
 * @mod mod-pages
 */

import { useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import {
  useCharacterStore, RACE_LIFESPAN, randomName,
  MAX_LIFESPAN_CAP, BASE_HUMAN_LIFESPAN,
  LIFESPAN_BG_BONUS_KEYWORDS, filterDigitsOnly,
} from '@/mods/mod-character'
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

/** 默认可见种族（对齐废弃项目 DEFAULT_RACES 少量核心种族） */
const DEFAULT_VISIBLE_RACES: string[] = [
  'human', 'elf', 'dwarf', 'orc', 'goblin', 'dragon', 'beastman',
]

/** 种族图标 */
const DEFAULT_RACE_ICONS: Record<string, string> = {
  '人类': '🧑', '妖族': '🦊', '魔族': '👿', '精灵': '🧝', '龙裔': '🐲',
  'AI意识体': '💻', '灵兽': '🐉', '灵体': '👻', '半妖': '👤',
}

/** 更多面板中的额外种族 */
const ADDITIONAL_RACES: Record<string, string> = {
  '猫人': '🐱', '魔法少女': '✨', '虫族': '🐛', '狼人': '🐺',
  '蘑菇人': '🍄', '神族': '⚡', '魅魔': '😈', '半精灵': '🧝', '半神': '⚡',
  '巨龙': '🐉', '天使': '👼', '恶魔': '😈', '吸血鬼': '🧛', '不死族': '💀',
  '亡灵': '💀', '丧尸': '🧟', '狐妖': '🦊', '亚人': '👤',
  '兽人': '🐺', '哥布林': '👺', '人鱼': '🧜', '元素灵': '🌊', '树人': '🌳',
  '史莱姆': '💧', '仿生人': '🤖', '数字生命': '🔢', '新人类': '👤',
  '外星人': '👽', '人工智能': '🤖', '赛亚人': '👊', '克苏鲁': '🐙', '奇美拉': '🐉',
}

/** 背景预设图标 */
const BG_PRESET_ICONS: Record<string, string> = {
  '贵族': '👑', '平民': '👤', '科学家': '🔬', '武士': '⚔️',
  '忍者': '🥷', '浪人': '🍂', '商人': '💰', '孤儿': '💔',
  '学者': '📚', '街头': '🏚️', '农家': '🌾', '流浪者': '🚶',
}

/** 穿越者关键词 */
const TRANSMIGRATOR_KEYWORDS = [
  '穿越', '魂穿', '重生', '转世', '夺舍', '附身', '觉醒',
  '系统', '绑定', '降临', '投影', '异世界', '魂越',
]

// ============================================================
// 帮助函数
// ============================================================

/** 简单寿命计算（对齐 lifespan-system.computeMaxAge） */
function computeMaxAge(race: string, background: string, manualOverride?: number): number {
  if (manualOverride && manualOverride > 0) {
    return Math.min(manualOverride, MAX_LIFESPAN_CAP)
  }

  const raceInfo = RACE_LIFESPAN[race]
  let maxAge = BASE_HUMAN_LIFESPAN

  if (raceInfo && raceInfo.baseMaxAge > maxAge) maxAge = raceInfo.baseMaxAge

  for (const [kw, bonus] of Object.entries(LIFESPAN_BG_BONUS_KEYWORDS)) {
    if (background.includes(kw) && bonus > maxAge) maxAge = bonus
  }

  return Math.min(Math.max(maxAge, 1), MAX_LIFESPAN_CAP)
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

function detectStartingAge(background: string): number {
  const isTransmigrator = TRANSMIGRATOR_KEYWORDS.some((kw) => background.includes(kw))
  if (isTransmigrator) {
    if (background.includes('婴儿') || background.includes('降生') || background.includes('出生')) return 0
    return 18
  }
  return 0
}

function clampStartingAge(age: number, maxAge: number): number {
  const finiteAge = Number.isFinite(age) ? Math.trunc(age) : 0
  const finiteMaxAge = Number.isFinite(maxAge) && maxAge > 0 ? Math.trunc(maxAge) : BASE_HUMAN_LIFESPAN
  return Math.min(Math.max(finiteAge, 0), Math.max(finiteMaxAge - 1, 0))
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
  customRaceInput: string
  setCustomRaceInput: (v: string) => void
  handleAddCustomRace: () => void
  removeCustomRace: (r: string) => void
  getRaceIcon: (r: string) => string
  raceInfo: typeof RACE_LIFESPAN[string] | undefined
  ADDITIONAL_RACES: Record<string, string>

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
  const [customGenders, setCustomGenders] = useState<string[]>([])
  const [showCustomGender, setShowCustomGender] = useState(false)
  const [customGenderInput, setCustomGenderInput] = useState('')

  // ---- 自定义种族 ----
  const [customRaces, setCustomRaces] = useState<string[]>([])
  const [showCustomRace, setShowCustomRace] = useState(false)
  const [customRaceInput, setCustomRaceInput] = useState('')

  // ---- 背景 ----
  const [bgPresets, setBgPresets] = useState<Record<string, string>>({})
  const [showBgPresetInput, setShowBgPresetInput] = useState(false)
  const [bgPresetNameInput, setBgPresetNameInput] = useState('')

  // ---- 寿命 ----
  const [_manualLifespan, _setManualLifespan] = useState('')
  const [_manualStartingAge, _setManualStartingAge] = useState('')
  const [computedLifespan, setComputedLifespan] = useState<number | null>(null)
  const [computedStartingAge, setComputedStartingAge] = useState<number | null>(null)

  const setManualLifespan = useCallback((v: string) => _setManualLifespan(filterDigitsOnly(v)), [])
  const setManualStartingAge = useCallback((v: string) => _setManualStartingAge(filterDigitsOnly(v)), [])

  const manualLifespan = _manualLifespan
  const manualStartingAge = _manualStartingAge

  // ---- 合并选项列表 ----
  const allGenders = useMemo(() => ['男', '女', ...customGenders], [customGenders])
  const allRaces = useMemo(() => [...DEFAULT_VISIBLE_RACES, ...customRaces], [customRaces])

  // ---- 图标获取器 ----
  const getGenderIcon = (g: string) => DEFAULT_GENDER_ICONS[g] || ADDITIONAL_GENDERS[g] || '👤'
  const getRaceIcon = (r: string) => DEFAULT_RACE_ICONS[r] || ADDITIONAL_RACES[r] || '👤'
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
    const manualOverride = manualLifespan ? parseInt(manualLifespan, 10) : undefined
    const maxAge = computeMaxAge(race, background, isNaN(manualOverride as number) ? undefined : manualOverride)
    const startAge = manualStartingAge
      ? parseInt(manualStartingAge, 10)
      : detectStartingAge(background)
    setComputedLifespan(maxAge)
    setComputedStartingAge(isNaN(startAge) ? detectStartingAge(background) : startAge)
  }, [race, background, manualLifespan, manualStartingAge])

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
      setCustomRaceInput('')
    }
  }, [customRaceInput, allRaces])

  const removeCustomRace = (r: string) => {
    setCustomRaces((prev) => prev.filter((x) => x !== r))
    if (race === r) setRace('human')
  }

  // ---- 背景预设操作 ----
  const handleAddBgPreset = useCallback(() => {
    const n = bgPresetNameInput.trim()
    if (n && background.trim() && !bgPresets[n]) {
      setBgPresets((prev) => ({ ...prev, [n]: background }))
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
    const manualOverride = manualLifespan ? parseInt(manualLifespan, 10) : undefined
    const maxAge = computedLifespan
      ?? (raceInfo?.baseMaxAge ?? computeMaxAge(race, background, isNaN(manualOverride as number) ? undefined : manualOverride))
    const manualStart = manualStartingAge ? parseInt(manualStartingAge, 10) : undefined
    const detectedStart = computedStartingAge ?? detectStartingAge(background)
    const startingAge = clampStartingAge(
      manualStart !== undefined && !isNaN(manualStart) ? manualStart : detectedStart,
      maxAge,
    )
    return { maxAge, startingAge }
  }, [background, computedLifespan, computedStartingAge, manualLifespan, manualStartingAge, race, raceInfo])

  // ============================================================
  // 导航
  // ============================================================

  const handleNext = useCallback(() => {
    if (nameError) setNameError('')

    const trimmed = name.trim()
    const genderForName = gender === 'male' ? '男' : gender === 'female' ? '女' : undefined
    const finalName = trimmed && trimmed !== 'AI命名' ? trimmed : randomName(genderForName)
    setName(finalName)
    setGender(gender)
    const { maxAge, startingAge } = resolveAgeSetup()
    setAge(startingAge)

    setCharacterBase({
      base: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      current: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
      startingAge,
    })

    if (raceInfo) {
      setLifespan({ race: raceInfo, maxAge, baseMaxAge: raceInfo.baseMaxAge })
    }

    store.getState().setRace(race)
    store.getState().setBackground(background)

    router.push('/talent-draw')
  }, [name, nameError, gender, race, setName, setGender, setAge, setCharacterBase, setLifespan, raceInfo, background, attributes, router, setNameError, store, resolveAgeSetup])

  const handleBack = useCallback(() => {
    const trimmed = name.trim()
    const genderForName = gender === 'male' ? '男' : gender === 'female' ? '女' : undefined
    const finalName = trimmed && trimmed !== 'AI命名' ? trimmed : randomName(genderForName)
    setName(finalName)
    setGender(gender)
    const { maxAge, startingAge } = resolveAgeSetup()
    setAge(startingAge)
    store.getState().setRace(race)
    store.getState().setBackground(background)
    setCharacterBase({
      base: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      current: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
      startingAge,
    })
    if (raceInfo) {
      setLifespan({ race: raceInfo, maxAge, baseMaxAge: raceInfo.baseMaxAge })
    }
    router.push('/new-game/world-customize')
  }, [name, gender, race, attributes, background, router, setName, setGender, setAge, setCharacterBase, setLifespan, raceInfo, store, resolveAgeSetup])

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
    customRaceInput, setCustomRaceInput,
    handleAddCustomRace, removeCustomRace,
    getRaceIcon,
    raceInfo,
    ADDITIONAL_RACES,

    // 背景预设
    bgPresets, showBgPresetInput, setShowBgPresetInput,
    bgPresetNameInput, setBgPresetNameInput,
    handleAddBgPreset, selectBgPreset, removeBgPreset,
    getBgPresetIcon,

    // 寿命
    manualLifespan, setManualLifespan,
    manualStartingAge, setManualStartingAge,
    computedLifespan, computedStartingAge,
    handleDetectLifespan,

    // 导航
    handleBack, handleNext,

    // 常量
    LABELS,
    ATTRIBUTES,
    RACE_LIFESPAN,
  }
}
