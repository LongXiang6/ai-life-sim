'use client'

/**
 * @module CharacterCreateContent.tsx
 * @description 角色创建统一表单（响应式 + mod-ui 组件）
 * @mod mod-pages
 */

import { useCallback, useState } from 'react'

import { useRouter } from 'next/navigation'

import { useCharacterStore, RACE_LIFESPAN, useRaceOrigin } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { useGoldenFingerStore, GOLDEN_FINGER_TEMPLATES } from '@/mods/mod-golden-finger'
import { Button, Input, PageScroll, BottomActionBar } from '@/mods/mod-ui'

import { useCharacterCreateForm, ATTRIBUTES } from './useCharacterCreateForm'

import styles from './CharacterCreateContent.module.css'

/** 仅系统面板类金手指 */
const PANEL_TEMPLATES = GOLDEN_FINGER_TEMPLATES.filter((t) =>
  ['attribute_panel', 'quest_system', 'gacha_wheel', 'check_in', 'shop_panel',
   'appraisal_skill', 'achievement_system', 'skill_deduction', 'sim_management', 'time_retrospect',
  ].includes(t.kind)
)

export function CharacterCreateContent() {
  const router = useRouter()
  const setName = useCharacterStore((s) => s.setName)
  const setGender = useCharacterStore((s) => s.setGender)
  const setCharacterBase = useCharacterStore((s) => s.setCharacterBase)
  const setLifespan = useCharacterStore((s) => s.setLifespan)

  const {
    name, nameError, gender, race, background, attributes, remainingPoints,
    setName: setFormName, setNameError, setGender: setFormGender, setRace, setBackground, handleAttrChange,
  } = useCharacterCreateForm()

  const worldConfig = useWorldStore((s) => s.worldConfig)
  useRaceOrigin(worldConfig?.description ?? '')

  const raceInfo = RACE_LIFESPAN[race]

  // ---- 金手指 ----
  const [gfMode, setGfMode] = useState<'off' | 'random' | 'manual'>('off')
  const [gfPanelId, setGfPanelId] = useState<string | null>(null)
  const setGoldenFinger = useGoldenFingerStore((s) => s.setGoldenFinger)
  // ---- end ----

  const handleNext = useCallback(() => {
    if (!name.trim()) {
      setNameError('请先输入角色名称')
      return
    }
    setNameError('')

    setName(name.trim())
    setGender(gender)
    setCharacterBase({
      base: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      current: { ...attributes } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
    })

    if (raceInfo) {
      setLifespan({ race: raceInfo, maxAge: raceInfo.baseMaxAge, baseMaxAge: raceInfo.baseMaxAge })
    }

    useCharacterStore.getState().setRace(race)
    useCharacterStore.getState().setBackground(background)

    // 写入金手指配置
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

    router.push('/timeline-analysis')
  }, [name, gender, setNameError, setName, setGender, setCharacterBase, setLifespan, raceInfo, race, background, attributes, router, gfMode, gfPanelId, setGoldenFinger])

  const handleBack = useCallback(() => router.push('/new-game'), [router])

  return (
    <>
      <PageScroll className={styles.pageScroll}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.headerIcon}>👤</div>
            <h2 className={styles.headerTitle}>角色设定</h2>
            <p className={styles.headerSubtitle}>设定你的性别和物种</p>
          </div>

          <div className={styles.section}>
            <Input
              label="名称"
              placeholder="输入你的角色名"
              value={name}
              onChange={(v) => { setFormName(v); setNameError('') }}
              error={nameError}
            />
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              性别 <span className={styles.sectionLabelHint}>（默认：男）</span>
            </span>
            <div className={styles.optionGrid}>
              {[{ v: 'male' as const, l: '♂ 男' }, { v: 'female' as const, l: '♀ 女' }].map((opt) => (
                <Button
                  key={opt.v}
                  variant={gender === opt.v ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setFormGender(opt.v)}
                >
                  {opt.l}
                </Button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>种族</span>
            <div className={styles.optionGrid}>
              {Object.entries(RACE_LIFESPAN).map(([key, info]) => (
                <Button
                  key={key}
                  variant={race === key ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setRace(key)}
                >
                  {info.name}
                </Button>
              ))}
            </div>
            {raceInfo && race !== 'human' && (
              <div className={styles.raceInfo}>
                {raceInfo.name} · 基础寿命 {raceInfo.baseMaxAge} 年 · 衰减倍率 {raceInfo.decayMultiplier}x
              </div>
            )}
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>背景出身</span>
            <div className={styles.optionGrid}>
              {[
                { v: 'commoner', l: '平民' },
                { v: 'noble', l: '贵族' },
                { v: 'merchant', l: '商人' },
                { v: 'orphan', l: '孤儿' },
                { v: 'scholar', l: '学者' },
                { v: 'street', l: '街头' },
                { v: 'farmer', l: '农家' },
                { v: 'wanderer', l: '流浪者' },
              ].map((opt) => (
                <Button
                  key={opt.v}
                  variant={background === opt.v ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setBackground(opt.v)}
                >
                  {opt.l}
                </Button>
              ))}
            </div>
          </div>

          {/* 金手指配置 */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>金手指</span>
            <div className={styles.optionGrid}>
              {([
                { v: 'off' as const, l: '关闭金手指' },
                { v: 'random' as const, l: '随机金手指' },
                { v: 'manual' as const, l: '手动选择' },
              ]).map((opt) => (
                <Button
                  key={opt.v}
                  variant={gfMode === opt.v ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setGfMode(opt.v)}
                >
                  {opt.l}
                </Button>
              ))}
            </div>
            {gfMode === 'manual' && (
              <div className={styles.optionGrid} style={{ marginTop: 10 }}>
                {PANEL_TEMPLATES.map((t) => (
                  <Button
                    key={t.id}
                    variant={gfPanelId === t.id ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setGfPanelId(t.id)}
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* 属性分配 — 参照废弃项目 +/- 按钮样式 */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              属性分配 <span className={styles.sectionLabelHint}>剩余点数：{remainingPoints}</span>
            </span>
            {ATTRIBUTES.map((attr) => (
              <div key={attr.key} className={styles.attrRow}>
                <div className={styles.attrLabelCol}>
                  <div className={styles.attrLabel}>{attr.label}</div>
                  <div className={styles.attrDesc}>{attr.desc}</div>
                </div>
                <div className={styles.attrControls}>
                  <button
                    type="button"
                    className={styles.attrBtn}
                    onClick={() => handleAttrChange(attr.key, attributes[attr.key] - 1)}
                    disabled={attributes[attr.key] <= 1}
                  >−</button>
                  <span className={styles.attrValue}>{attributes[attr.key]}</span>
                  <button
                    type="button"
                    className={styles.attrBtn}
                    onClick={() => handleAttrChange(attr.key, attributes[attr.key] + 1)}
                    disabled={remainingPoints <= 0 || attributes[attr.key] >= 10}
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageScroll>

      <BottomActionBar
        onBack={handleBack}
        backTitle="返回世界选择"
        onConfirm={handleNext}
        confirmText="确认"
      />
    </>
  )
}
