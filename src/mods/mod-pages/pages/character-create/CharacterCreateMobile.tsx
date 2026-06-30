/**
 * @module CharacterCreateMobile.tsx
 * @description 角色创建移动端页面 —— 设定角色名称、性别、种族、背景及初始属性分配
 * @mod mod-pages
 * 参照废弃项目 CharacterCreateMobile 重写
 */

'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

import { useCharacterStore, RACE_LIFESPAN } from '@/mods/mod-character'
import { useCharacterCreateForm, ATTRIBUTES } from './useCharacterCreateForm'

import styles from './CharacterCreateMobile.module.css'

export function CharacterCreateMobile() {
  const router = useRouter()
  const setCharacterBase = useCharacterStore((s) => s.setCharacterBase)
  const setLifespan = useCharacterStore((s) => s.setLifespan)

  const {
    name, nameError, gender, race, background, attributes, remainingPoints,
    setName, setNameError, setGender, setRace, setBackground, handleAttrChange,
  } = useCharacterCreateForm()

  const raceInfo = RACE_LIFESPAN[race]

  const handleNext = useCallback(() => {
    if (!name.trim()) {
      setNameError('请先输入角色名称')
      return
    }
    setNameError('')

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

    router.push('/talent-draw')
  }, [name, setNameError, setCharacterBase, setLifespan, raceInfo, race, background, attributes, router])

  const handleBack = useCallback(() => router.push('/new-game'), [router])

  return (
    <>
      <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
        <div className={styles.container}>
          <div className={styles.inner}>
            <div className={styles.header}>
              <div className={styles.headerIcon}>👤</div>
              <h2 className={styles.headerTitle}>角色设定</h2>
              <p className={styles.headerSubtitle}>设定你的性别和物种</p>
            </div>

            {/* 名称 */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>名称</label>
              <div className={styles.nameRow}>
                <input className={styles.nameInput} placeholder="输入你的角色名"
                  value={name} onChange={e => { setName(e.target.value); setNameError('') }} />
                <button className={styles.diceBtn} title="随机名称">🎲</button>
              </div>
              {nameError && <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{nameError}</p>}
            </div>

            {/* 性别 */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>
                性别 <span className={styles.sectionLabelHint}>（默认：男）</span>
              </label>
              <div className={styles.optionGrid}>
                {[{ v: 'male' as const, l: '♂ 男' }, { v: 'female' as const, l: '♀ 女' }].map(opt => (
                  <button key={opt.v} onClick={() => setGender(opt.v)}
                    className={`${styles.optionBtn} ${gender === opt.v ? styles.optionBtnActive : ''}`}>{opt.l}</button>
                ))}
              </div>
            </div>

            {/* 种族 */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>种族</label>
              <div className={styles.optionGrid}>
                {Object.entries(RACE_LIFESPAN).slice(0, 8).map(([key, info]) => (
                  <button key={key} onClick={() => setRace(key)}
                    className={`${styles.optionBtn} ${race === key ? styles.optionBtnActive : ''}`}>{info.name}</button>
                ))}
              </div>
              {raceInfo && race !== 'human' && (
                <div className={styles.raceInfo}>
                  {raceInfo.name} · 基础寿命 {raceInfo.baseMaxAge} 年
                </div>
              )}
            </div>

            {/* 背景 */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>背景出身</label>
              <div className={styles.optionGrid}>
                {[
                  { v: 'commoner', l: '平民' }, { v: 'noble', l: '贵族' },
                  { v: 'merchant', l: '商人' }, { v: 'orphan', l: '孤儿' },
                  { v: 'scholar', l: '学者' }, { v: 'street', l: '街头' },
                  { v: 'farmer', l: '农家' }, { v: 'wanderer', l: '流浪者' },
                ].map(opt => (
                  <button key={opt.v} onClick={() => setBackground(opt.v)}
                    className={`${styles.optionBtn} ${background === opt.v ? styles.optionBtnActive : ''}`}>{opt.l}</button>
                ))}
              </div>
            </div>

            {/* 属性分配 */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>
                属性分配 <span className={styles.sectionLabelHint}>剩余：{remainingPoints}</span>
              </label>
              {ATTRIBUTES.map(attr => (
                <div key={attr.key} className={styles.attrRow}>
                  <div className={styles.attrLabelCol}>
                    <div className={styles.attrLabel}>{attr.label}</div>
                    <div className={styles.attrDesc}>{attr.desc}</div>
                  </div>
                  <input type="range" min={1} max={10} value={attributes[attr.key]}
                    onChange={e => handleAttrChange(attr.key, Number(e.target.value))}
                    className={styles.attrSlider} />
                  <span className={styles.attrValue}>{attributes[attr.key]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <button onClick={handleBack} className={styles.bottomBtnSecondary}>返回</button>
        <button onClick={handleNext} className={styles.bottomBtnPrimary}>进入命格选择 →</button>
      </div>
    </>
  )
}
