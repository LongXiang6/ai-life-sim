'use client'

/**
 * @file CharacterCreateDesktop.tsx
 * @description 角色创建桌面端 —— 完全对齐废弃项目 character-create
 * @mod mod-pages
 *
 * 对齐废弃项目：
 *   - 姓名输入 + 🎲 随机名称（调用 randomName）
 *   - 性别选择 + ✨ 更多面板
 *   - 种族选择（默认少量核心种族）+ ✨ 更多面板
 *   - 背景信息 textarea + 预设保存
 *   - 寿命检测 + 手动寿命/起始年龄输入
 *   - 金手指（新功能保留）
 *   - 留空姓名不阻塞，由 AI 生成
 */

import { useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { configStore } from '@/core'
import { useCharacterStore, RACE_LIFESPAN, randomName, MAX_LIFESPAN_CAP, BASE_HUMAN_LIFESPAN, LIFESPAN_BG_BONUS_KEYWORDS, filterDigitsOnly } from '@/mods/mod-character'
import { useGoldenFingerStore, GOLDEN_FINGER_TEMPLATES } from '@/mods/mod-golden-finger'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar } from '@/mods/mod-ui'
import { useCharacterCreateForm } from './useCharacterCreateForm'

import styles from './CharacterCreateDesktop.module.css'

// ============================================================
// 常量
// ============================================================

/** 金手指系统面板 */
const PANEL_TEMPLATES = GOLDEN_FINGER_TEMPLATES.filter((t) =>
  ['attribute_panel', 'quest_system', 'gacha_wheel', 'check_in', 'shop_panel',
   'appraisal_skill', 'achievement_system', 'skill_deduction', 'sim_management', 'time_retrospect',
  ].includes(t.kind)
)

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

/** 金手指持久化键（按世界编码隔离） */
function gfStorageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `character-create-gf:${worldCode || 0}`
}

interface SavedGfState {
  gfMode: 'off' | 'random' | 'manual'
  gfPanelId: string | null
}

function loadGfState(): SavedGfState | null {
  return configStore.get<SavedGfState>('mod-pages', gfStorageKey())
}

function persistGfState(state: SavedGfState): void {
  configStore.set('mod-pages', gfStorageKey(), state)
}

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

// ============================================================
// 组件
// ============================================================

export function CharacterCreateDesktop() {
  const router = useRouter()
  const store = useCharacterStore
  const setName = store((s) => s.setName)
  const setGender = store((s) => s.setGender)
  const setCharacterBase = store((s) => s.setCharacterBase)
  const setLifespan = store((s) => s.setLifespan)

  // 检测是否为原始社会（纪元起始年 < -10000 或世界标签含原始关键词）
  const eraStartYear = useWorldStore((s) => s.eraStartYear)
  const worldTags = useWorldStore((s) => s.worldTags)
  const isPrimitiveWorld = useMemo(() => {
    if (eraStartYear < -10000) return true
    const primitiveKeywords = ['原始', '上古', '远古', '石器', '洪荒', '史前', 'primitive', 'prehistoric']
    return worldTags.some((t) => primitiveKeywords.some((kw) => t.includes(kw)))
  }, [eraStartYear, worldTags])

  const {
    name, nameError, gender, race, background, attributes,
    setName: setFormName, setNameError, setGender: setFormGender, setRace, setBackground,
  } = useCharacterCreateForm()

  // ---- 金手指 ----
  const savedGf = loadGfState()
  const [gfMode, _setGfMode] = useState<'off' | 'random' | 'manual'>(savedGf?.gfMode ?? 'off')
  const [gfPanelId, _setGfPanelId] = useState<string | null>(savedGf?.gfPanelId ?? null)
  const setGoldenFinger = useGoldenFingerStore((s) => s.setGoldenFinger)

  const setGfMode = useCallback((v: 'off' | 'random' | 'manual') => {
    _setGfMode(v)
    persistGfState({ gfMode: v, gfPanelId })
  }, [gfPanelId])

  const setGfPanelId = useCallback((v: string | null) => {
    _setGfPanelId(v)
    persistGfState({ gfMode, gfPanelId: v })
  }, [gfMode])

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
  const [manualLifespan, setManualLifespan] = useState('')
  const [manualStartingAge, setManualStartingAge] = useState('')
  const [computedLifespan, setComputedLifespan] = useState<number | null>(null)
  const [computedStartingAge, setComputedStartingAge] = useState<number | null>(null)

  // ---- 合并选项列表 ----
  const allGenders = useMemo(() => ['男', '女', ...customGenders], [customGenders])

  /** 可见种族：默认少量核心种族 + 自定义种族 */
  const allRaces = useMemo(() => [...DEFAULT_VISIBLE_RACES, ...customRaces], [customRaces])

  // 获取图标
  const getGenderIcon = (g: string) => DEFAULT_GENDER_ICONS[g] || ADDITIONAL_GENDERS[g] || '👤'
  const getRaceIcon = (r: string) => DEFAULT_RACE_ICONS[r] || ADDITIONAL_RACES[r] || '👤'
  const getBgPresetIcon = (n: string) => BG_PRESET_ICONS[n] || '📋'

  // ---- 随机名称 ----
  const handleDice = useCallback(() => {
    const newName = randomName(gender, isPrimitiveWorld)
    setFormName(newName)
  }, [gender, isPrimitiveWorld, setFormName])

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
  // 导航
  // ============================================================

  const raceInfo = RACE_LIFESPAN[race]

  const handleNext = useCallback(() => {
    if (nameError) setNameError('')

    const trimmed = name.trim()
    const genderForName = gender === 'male' ? '男' : gender === 'female' ? '女' : undefined
    const finalName = trimmed && trimmed !== 'AI命名' ? trimmed : randomName(genderForName)
    setName(finalName)
    setGender(gender)

    setCharacterBase({
      base: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      current: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
    })

    if (raceInfo) {
      const mAge = computedLifespan ?? raceInfo.baseMaxAge
      setLifespan({ race: raceInfo, maxAge: mAge, baseMaxAge: raceInfo.baseMaxAge })
    }

    store.getState().setRace(race)
    store.getState().setBackground(background)

    if (gfMode !== 'off') {
      setGoldenFinger({
        mode: gfMode,
        assigned: gfMode === 'random',
        template: gfMode === 'manual' && gfPanelId
          ? GOLDEN_FINGER_TEMPLATES.find((t) => t.id === gfPanelId) ?? null
          : null,
        level: 0,
        levelProgress: 0,
        unlockedFeatures: [],
      })
    }

    router.push('/talent-draw')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, nameError, gender, race, setName, setGender, setCharacterBase, setLifespan, raceInfo, computedLifespan, background, attributes, router, gfMode, gfPanelId, setGoldenFinger])

  const handleBack = useCallback(() => {
    // 保存当前表单数据到 store，对齐废弃项目的持久化行为
    const trimmed = name.trim()
    const genderForName = gender === 'male' ? '男' : gender === 'female' ? '女' : undefined
    const finalName = trimmed && trimmed !== 'AI命名' ? trimmed : randomName(genderForName)
    setName(finalName)
    setGender(gender)
    store.getState().setRace(race)
    store.getState().setBackground(background)
    setCharacterBase({
      base: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      current: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
    })
    if (gfMode !== 'off') {
      setGoldenFinger({
        mode: gfMode,
        assigned: gfMode === 'random',
        template: gfMode === 'manual' && gfPanelId
          ? GOLDEN_FINGER_TEMPLATES.find((t) => t.id === gfPanelId) ?? null
          : null,
        level: 0,
        levelProgress: 0,
        unlockedFeatures: [],
      })
    }
    router.push('/new-game/world-customize')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, gender, race, attributes, background, router, gfMode, gfPanelId])

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <>
      <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--color-bg)', padding: '24px 32px 120px' }}>
        <div className={styles.inner}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIcon}>👤</div>
            <h2 className={styles.headerTitle}>角色设定</h2>
            <p className={styles.headerSubtitle}>设定你的性别和物种</p>
          </div>

          {/* ======== 姓名 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>
              姓名 <span className={styles.sectionLabelHint}>(可选，留空则由AI自动生成)</span>
            </label>
            <div className={styles.nameRow}>
              <input
                className={styles.nameInput}
                placeholder="输入角色姓名..."
                value={name}
                onChange={(e) => { setFormName(e.target.value); setNameError('') }}
              />
              <button className={styles.diceBtn} title="随机名称" type="button" onClick={handleDice}>🎲</button>
            </div>
          </div>

          {/* ======== 性别 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>
              性别 <span className={styles.sectionLabelHint}>（默认：男）</span>
            </label>
            <div className={styles.optionGrid}>
              {allGenders.map((g) => {
                const icon = getGenderIcon(g)
                const isCustom = customGenders.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setFormGender(genderOptionToValue(g))}
                    className={`${styles.optionBtn} ${isGenderOptionActive(g, gender) ? styles.optionBtnActive : ''}`}
                    style={{ position: 'relative' }}
                  >
                    <span className={styles.optionIcon}>{icon}</span>
                    <span className={styles.optionText}>{g}</span>
                    {isCustom && (
                      <span
                        className={styles.itemDeleteBtn}
                        onClick={(e) => { e.stopPropagation(); removeCustomGender(g) }}
                      >×</span>
                    )}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setShowCustomGender(!showCustomGender)}
                className={styles.optionBtn}
                title="添加更多性别选项"
              >
                <span className={styles.optionIcon}>✨</span>
                <span className={styles.optionText}>更多</span>
              </button>
            </div>

            {/* 自定义性别面板 */}
            {showCustomGender && (
              <div className={styles.customPanel}>
                <div className={styles.customInputRow}>
                  <input
                    className={styles.customInput}
                    placeholder="输入性别名称..."
                    value={customGenderInput}
                    onChange={(e) => setCustomGenderInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomGender() }}
                  />
                  <button className={styles.customAddBtn} onClick={handleAddCustomGender}>添加</button>
                </div>
                <div className={styles.moreGrid}>
                  {Object.entries(ADDITIONAL_GENDERS).map(([nm, icon]) => (
                    <button
                      key={nm}
                      type="button"
                      onClick={() => {
                        if (!allGenders.includes(nm)) {
                          setCustomGenders((prev) => [...prev, nm])
                          setFormGender(genderOptionToValue(nm))
                        } else {
                          setFormGender(genderOptionToValue(nm))
                        }
                      }}
                      className={`${styles.optionBtn} ${isGenderOptionActive(nm, gender) ? styles.optionBtnActive : ''}`}
                    >
                      <span className={styles.optionIcon}>{icon}</span>
                      <span className={styles.optionText}>{nm}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ======== 种族 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>种族</label>
            <div className={styles.optionGrid}>
              {allRaces.map((r) => {
                const displayName = RACE_LIFESPAN[r]?.name || r
                const icon = getRaceIcon(displayName)
                const isCustom = customRaces.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRace(r)}
                    className={`${styles.optionBtn} ${race === r ? styles.optionBtnActive : ''}`}
                    style={{ position: 'relative' }}
                  >
                    <span className={styles.optionIcon}>{icon}</span>
                    <span className={styles.optionText}>{displayName}</span>
                    {isCustom && (
                      <span
                        className={styles.itemDeleteBtn}
                        onClick={(e) => { e.stopPropagation(); removeCustomRace(r) }}
                      >×</span>
                    )}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setShowCustomRace(!showCustomRace)}
                className={styles.optionBtn}
                title="添加更多种族选项"
              >
                <span className={styles.optionIcon}>✨</span>
                <span className={styles.optionText}>更多</span>
              </button>
            </div>
            {raceInfo && race !== 'human' && (
              <div className={styles.raceInfo}>
                {raceInfo.name} · 基础寿命 {raceInfo.baseMaxAge} 年 · 衰减倍率 {raceInfo.decayMultiplier}x
              </div>
            )}

            {/* 自定义种族面板 */}
            {showCustomRace && (
              <div className={styles.customPanel}>
                <div className={styles.customInputRow}>
                  <input
                    className={styles.customInput}
                    placeholder="输入种族名称..."
                    value={customRaceInput}
                    onChange={(e) => setCustomRaceInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomRace() }}
                  />
                  <button className={styles.customAddBtn} onClick={handleAddCustomRace}>添加</button>
                </div>
                <div className={styles.moreGrid}>
                  {Object.entries(ADDITIONAL_RACES).map(([nm, icon]) => (
                    <button
                      key={nm}
                      type="button"
                      onClick={() => {
                        if (!allRaces.includes(nm)) {
                          setCustomRaces((prev) => [...prev, nm])
                          setRace(nm)
                        } else {
                          setRace(nm)
                        }
                      }}
                      className={`${styles.optionBtn} ${race === nm ? styles.optionBtnActive : ''}`}
                    >
                      <span className={styles.optionIcon}>{icon}</span>
                      <span className={styles.optionText}>{nm}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ======== 寿命检测 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>寿命设定</label>
            <div className={styles.presetSaveRow}>
              <button
                onClick={handleDetectLifespan}
                className={styles.outlineBtn}
                title="根据种族/背景重新计算寿命与起始年龄"
              >
                🔄 检测寿命
              </button>
              {computedLifespan !== null && (
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  🕐 寿命约
                  <b style={{ color: computedLifespan > 200 ? 'var(--color-primary)' : 'var(--color-success)' }}>
                    {computedLifespan.toLocaleString()}岁
                  </b>
                  {computedStartingAge !== null && computedStartingAge > 0 && (
                    <span>
                      · 起始 <b style={{ color: 'var(--color-warning)' }}>{computedStartingAge}岁</b>
                    </span>
                  )}
                  {computedStartingAge === 0 && <span>· 出生</span>}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input
                className={styles.presetNameInput}
                placeholder="寿命上限(岁)"
                value={manualLifespan}
                inputMode="numeric"
                onChange={(e) => setManualLifespan(filterDigitsOnly(e.target.value))}
                onBlur={handleDetectLifespan}
              />
              <input
                className={styles.presetNameInput}
                placeholder="起始年龄(岁)"
                value={manualStartingAge}
                inputMode="numeric"
                onChange={(e) => setManualStartingAge(filterDigitsOnly(e.target.value))}
                onBlur={handleDetectLifespan}
              />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>留空则自动</span>
            </div>
          </div>

          {/* ======== 背景信息 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>
              背景信息 <span className={styles.sectionLabelHint}>(可选)</span>
            </label>

            {/* 背景预设卡片网格 */}
            {Object.keys(bgPresets).length > 0 && (
              <div className={styles.optionGrid}>
                {Object.entries(bgPresets).map(([nm, content]) => {
                  const isActive = background === content
                  return (
                    <button
                      key={nm}
                      type="button"
                      onClick={() => selectBgPreset(nm)}
                      className={`${styles.optionBtn} ${styles.optionBtnWide} ${isActive ? styles.optionBtnActive : ''}`}
                      style={{ position: 'relative', flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{getBgPresetIcon(nm)}</span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{nm}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                        {content.slice(0, 40)}{content.length > 40 ? '...' : ''}
                      </span>
                      <span
                        className={styles.itemDeleteBtn}
                        onClick={(e) => { e.stopPropagation(); removeBgPreset(nm) }}
                      >×</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* 背景文本 textarea */}
            <textarea
              className={styles.textarea}
              placeholder="告诉命运编织者更多关于你的角色的事..."
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              maxLength={5000}
            />
            <div className={styles.charCount}>
              {background.length}/5000
            </div>

            {/* 背景预设保存行 */}
            <div className={styles.presetSaveRow}>
              {showBgPresetInput ? (
                <>
                  <input
                    className={styles.presetNameInput}
                    placeholder="预设名称..."
                    value={bgPresetNameInput}
                    onChange={(e) => setBgPresetNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddBgPreset() }}
                  />
                  <button className={styles.customAddBtn} onClick={handleAddBgPreset}>保存</button>
                  <button
                    className={styles.outlineBtn}
                    onClick={() => { setShowBgPresetInput(false); setBgPresetNameInput('') }}
                  >取消</button>
                </>
              ) : (
                <button className={styles.outlineBtn} onClick={() => setShowBgPresetInput(true)}>
                  + 保存预设
                </button>
              )}
            </div>
          </div>

          {/* ======== 金手指（新功能保留） ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>金手指</label>
            <div className={styles.optionGrid}>
              {([
                { v: 'off' as const, l: '🔒 关闭' },
                { v: 'random' as const, l: '🎲 随机' },
                { v: 'manual' as const, l: '✋ 手动' },
              ]).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setGfMode(opt.v)}
                  className={`${styles.optionBtn} ${gfMode === opt.v ? styles.optionBtnActive : ''}`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            {gfMode === 'manual' && (
              <div className={styles.optionGrid} style={{ marginTop: 10 }}>
                {PANEL_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setGfPanelId(t.id)}
                    title={t.description}
                    className={`${styles.optionBtn} ${gfPanelId === t.id ? styles.optionBtnActive : ''}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            {/* 金手指详情面板 */}
            {gfMode === 'manual' && gfPanelId && (() => {
              const selected = PANEL_TEMPLATES.find((t) => t.id === gfPanelId)
              if (!selected) return null
              const tierLabels: Record<string, string> = {
                legendary: '传说', rare: '稀有', uncommon: '特殊', unique: '独一无二',
              }
              return (
                <div className={styles.gfDetail}>
                  <div className={styles.gfDetailHeader}>
                    <span className={styles.gfDetailName}>{selected.name}</span>
                    <span className={styles.gfDetailTier}>
                      {tierLabels[selected.tier] || selected.tier}
                    </span>
                  </div>
                  <p className={styles.gfDetailDesc}>{selected.description}</p>
                  {selected.features.length > 0 && (
                    <>
                      <p className={styles.gfDetailSubtitle}>功能模块</p>
                      <ul className={styles.gfDetailList}>
                        {selected.features.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </>
                  )}
                  {selected.rules.length > 0 && (
                    <>
                      <p className={styles.gfDetailSubtitle}>运行规则</p>
                      <ul className={styles.gfDetailList}>
                        {selected.rules.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </>
                  )}
                  {selected.targetSubsystems.length > 0 && (
                    <p className={styles.gfDetailTarget}>
                      关联系统：{selected.targetSubsystems.join('、')}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      <BottomActionBar
        onBack={handleBack}
        backTitle="返回世界选择"
        onConfirm={handleNext}
        confirmText="确认"
      />
    </>
  )
}

export default CharacterCreateDesktop
