/**
 * Purpose: Coordinate final creation review and commit the confirmed opening state.
 * Owner: mod-pages/fate-preview
 * Responsibility: Fate-preview page orchestration; normalization and initialization UI live in sibling modules.
 */

'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'

import { useRouter } from 'next/navigation'

import { useCharacterStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar, FlowRunningHead } from '@/mods/mod-ui'

import {
  DESTINY_PATTERN_RARITY_CONFIG,
  PATTERN_LOADOUT_SLOT_COUNT,
  ATTRIBUTE_NAMES,
  ATTR_KEYS,
  getPatternLoadoutCount,
  isPatternLoadoutValid,
} from '@/mods/mod-character'

import styles from './FatePreview.module.css'
import {
  ATTRIBUTE_ICONS,
  GENDER_LABELS,
  hasConfirmedCharacter,
  resolvePreviewRaceInfo,
} from './fate-preview-helpers'
import { useFatePreviewStart } from './useFatePreviewStart'
import { useFatePreviewBirthProfile } from './useFatePreviewBirthProfile'
import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'

function FatePreviewContent() {
  const router = useRouter()

  const name = useCharacterStore((s) => s.name)
  const gender = useCharacterStore((s) => s.gender)
  const race = useCharacterStore((s) => s.race)
  const characterBase = useCharacterStore((s) => s.characterBase)
  const destinyPatterns = useCharacterStore((s) => s.destinyPatterns)
  const equippedReincarnationTalents = useCharacterStore((s) => s.equippedReincarnationTalents)
  const lifespan = useCharacterStore((s) => s.lifespanDraft)

  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const worldInitialized = useWorldStore((s) => s.initialized)
  const genderLabel = GENDER_LABELS[gender] ?? gender
  const startingAge = characterBase.startingAge
  const settingsStorySeed = useSettingsStore((s) => s.storySeed)
  const setSettingsStorySeed = useSettingsStore((s) => s.setStorySeed)
  const [storySeed, _setStorySeed] = useState(settingsStorySeed ?? '')

  const setStorySeed = useCallback((v: string) => {
    _setStorySeed(v)
    setSettingsStorySeed(v)
  }, [setSettingsStorySeed])

  const selectedPatterns = useMemo(() => destinyPatterns.patterns ?? [], [destinyPatterns.patterns])
  const characterConfirmed = hasConfirmedCharacter(name, race, startingAge, lifespan)
  const patternLoadoutConfirmed = isPatternLoadoutValid(selectedPatterns, equippedReincarnationTalents)
  const patternLoadoutCount = getPatternLoadoutCount(selectedPatterns, equippedReincarnationTalents)
  const creationGateReason = !characterConfirmed
    ? '角色资料尚未确认，请返回角色创建完成确认。'
    : !patternLoadoutConfirmed
      ? `当前已确认 ${patternLoadoutCount} 项命格，超过 ${PATTERN_LOADOUT_SLOT_COUNT} 个携带槽的容量。`
      : null
  const worldReady = worldInitialized && !!worldConfig && worldCode > 0
  const {
    birthProfile,
    isLoading: birthLoading,
    error: birthError,
    retry: retryBirthProfile,
  } = useFatePreviewBirthProfile({
    enabled: worldReady && characterConfirmed && patternLoadoutConfirmed,
    worldCode,
  })
  const birthReady = Boolean(birthProfile) && !birthLoading && !birthError
  const { allModsLoaded, handleStartLife, isStarting, startError } = useFatePreviewStart({
    worldReady,
    characterBase,
    characterConfirmed,
    patternLoadoutConfirmed,
    birthReady,
    gender,
    name,
    startingAge,
    storySeed,
    worldConfig,
  })
  const runtimeGateReason = !allModsLoaded
    ? '核心模拟系统正在加载，请稍候。'
    : birthLoading
      ? '正在铺展你的来处，请稍候。'
      : birthError
        ? '你的来处暂未铺展，请重试。'
        : !birthProfile
          ? '你的来处尚未铺展。'
          : null
  const startNotice = startError ?? creationGateReason ?? runtimeGateReason

  /** 属性加成汇总 */
  const attrBonuses = useMemo(() => {
    const bonuses: Record<string, number> = {}
    for (const p of selectedPatterns) {
      if (p.attrBonus) {
        for (const [key, value] of Object.entries(p.attrBonus)) {
          if (typeof value === 'number') bonuses[key] = (bonuses[key] ?? 0) + value
        }
      }
    }
    return bonuses
  }, [selectedPatterns])

  const raceInfo = useMemo(() => resolvePreviewRaceInfo(race, lifespan), [race, lifespan])

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={`${styles.page} final-flow-page-surface`}>
            <div className={styles.paper}>
          <header className={styles.header}>
            <FlowRunningHead stepLabel="06 / 07" />
            <div className={styles.titleCopy}>
              <h1>核对命书</h1>
              <p>确认所有起点，然后开启人生。</p>
            </div>
          </header>

          <section className={`${styles.section} ${styles.worldSection}`} aria-labelledby="world-character-title">
            <div className={styles.sectionHead}>
              <small id="world-character-title">命书所载 · 此界此身</small>
            </div>
            <div className={styles.reviewWorld}>
              <span className={styles.worldSource}>{worldConfig ? '已确认世界 · 描述原文' : '世界资料待确认'}</span>
              <h2>{worldConfig?.name ?? '尚未建立世界'}</h2>
              <p>{worldConfig?.description || '返回创建流程完成世界选择与规则确认。'}</p>
            </div>
            <div className={styles.ritualDivider} aria-hidden="true"><i>✦</i></div>
            <div className={styles.reviewIdentity}>
              <strong>{name || '未命名'} · {genderLabel || '未设定'} · {raceInfo.name}</strong>
              <span className={styles.startingAge}><span>起始年龄：</span><b>{startingAge} 岁</b></span>
            </div>
            <div className={styles.ritualDivider} aria-hidden="true"><i>✦</i></div>
            <div className={styles.stats}>
              <div><b>{lifespan.maximumLifespanYears > 0 ? lifespan.maximumLifespanYears : raceInfo.baseLifespanYears} 年</b><span><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">⏳</span>预期寿命</span></div>
              <div><b>{startingAge} 岁</b><span><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">🌱</span>起始年龄</span></div>
            </div>
          </section>

          <section className={`${styles.section} ${styles.birthSection}`} aria-labelledby="birth-profile-title">
            <div className={styles.sectionHead}>
              <small id="birth-profile-title">落地人间 · 此身来处</small>
            </div>
            {birthLoading ? (
              <p className={styles.birthLoading}>正在为你铺展初临此世的景象……</p>
            ) : birthProfile ? (
              <>
                <div className={styles.birthNarrativeBlock}>
                  <small className={styles.birthNarrativeLabel}>初临此世</small>
                  <p className={styles.birthNarrative}>{birthProfile.叙事背景}</p>
                </div>
                <div className={styles.birthFacts}>
                  <small className={styles.birthFactsLabel}>你的来处</small>
                  <div className={styles.birthGrid}>
                    <div className={styles.birthItem}><small>降生之地</small><strong>{birthProfile.出生地点}</strong></div>
                    <div className={styles.birthItem}><small>家中亲缘</small><strong>{birthProfile.家庭结构}</strong></div>
                    <div className={styles.birthItem}><small>最初照料</small><strong>{birthProfile.照料者}</strong></div>
                    <div className={styles.birthItem}><small>家中底色</small><strong>{birthProfile.家庭资源}</strong></div>
                    <div className={styles.birthItem}><small>所处世道</small><strong>{birthProfile.社会处境}</strong></div>
                  </div>
                </div>
                <div className={styles.birthLists}>
                  <div><small>眼前门径</small><ul>{birthProfile.机会.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div><small>所受掣肘</small><ul>{birthProfile.限制.map((item) => <li key={item}>{item}</li>)}</ul></div>
                </div>
              </>
            ) : (
              <div className={styles.birthError}>
                <p>{birthError ? '你的来处暂未铺展，请重试。' : '你的来处尚未铺展。'}</p>
                <button type="button" className={styles.retryBtn} onClick={() => void retryBirthProfile()}>
                  重新铺展
                </button>
              </div>
            )}
          </section>

          <section className={`${styles.section} ${styles.attributesSection}`} aria-labelledby="attributes-patterns-title">
            <div className={styles.sectionHead}>
              <small id="attributes-patterns-title">属性既定 · 命格相赠</small>
            </div>
            <div className={styles.attrGrid}>
              {ATTR_KEYS.map((key) => {
                const bonus = attrBonuses[key] ?? 0
                const baseValue = characterBase.base[key] ?? 0
                const finalValue = baseValue + bonus
                return (
                  <div key={key} className={styles.attrItem}>
                    <span><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">{ATTRIBUTE_ICONS[key]}</span>{ATTRIBUTE_NAMES[key]}</span>
                    <b className={styles.attrValue}>{finalValue}</b>
                  </div>
                )
              })}
            </div>
            <div className={styles.ritualDivider} aria-hidden="true"><i>✦</i></div>
            <div className={styles.talentRow}>
              {selectedPatterns.length > 0 ? selectedPatterns.map((pattern) => {
                const rarity = DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity]
                return (
                  <div
                    key={pattern.id}
                    className={`${styles.patternRow} ${styles.rarityRow}`}
                    style={{ '--rarity-color': rarity.color } as CSSProperties}
                  >
                    <div className={styles.patternHeading}>
                      <strong>{pattern.name}</strong>
                      <small>{rarity.label}</small>
                    </div>
                    <span>{pattern.description}</span>
                  </div>
                )
              }) : equippedReincarnationTalents.length === 0 ? <p className={styles.emptyText}>未携带天赋。</p> : null}
              {equippedReincarnationTalents.map((pattern) => (
                <div
                  key={pattern.id}
                  className={`${styles.patternRow} ${styles.isRebirth} ${styles.rarityRow}`}
                  style={{ '--rarity-color': DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].color } as CSSProperties}
                >
                  <div className={styles.patternHeading}>
                    <strong>轮回 · {pattern.name}</strong>
                    <small>轮回天赋</small>
                  </div>
                  <span>{pattern.description}：{pattern.effect}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${styles.section} ${styles.seedSection}`} aria-labelledby="seed-title">
            <div className={styles.sectionHead}>
              <small id="seed-title">同因同果 · 命途自循</small>
            </div>
            <div className={styles.seedRow}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={storySeed}
                onChange={(event) => setStorySeed(event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="最多 8 位数字"
                className={styles.seedInput}
                aria-label="自定义模拟种子"
              />
              <button type="button" onClick={() => setStorySeed(String(Math.floor(Math.random() * 100000000)))} className={styles.seedBtn}>随机</button>
            </div>
            <p className={styles.seedHint}>相同种子与相同操作会得到相近的剧情走向。</p>
          </section>

          {startNotice ? <p className={styles.gateNotice} role="alert">{startNotice}</p> : null}
            </div>
          </main>

          <BottomActionBar
        onBack={() => router.push(!characterConfirmed ? '/new-game/character-create' : '/attribute-alloc')}
        backTitle={!characterConfirmed ? '返回确认角色' : '返回确认属性'}
        backText="返回"
        backDescription={!characterConfirmed ? '返回确认角色' : '返回确认属性'}
        onConfirm={handleStartLife}
        confirmText={creationGateReason ? '创建信息未完成' : runtimeGateReason ? '铺展你的来处' : isStarting ? '正在确认…' : '开始人生'}
        confirmNumber="07"
        confirmDescription={creationGateReason ?? runtimeGateReason ?? '世界与角色资料已确认 · 开启人生'}
        confirmDisabled={Boolean(creationGateReason || runtimeGateReason || isStarting) || !worldReady}
        confirmTitle={creationGateReason ?? runtimeGateReason ?? (!worldReady ? '世界资料尚未确认' : '开始人生')}
          />
        </div>
      </div>
    </div>
  )
}

export default function FatePreviewPage() {
  const router = useRouter()
  const storesHydrated = useCreationStoresHydrated()
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const worldInitialized = useWorldStore((state) => state.initialized)
  const characterName = useCharacterStore((state) => state.name)
  const selectedPatterns = useCharacterStore((state) => state.destinyPatterns.patterns)
  const equippedReincarnationTalents = useCharacterStore((state) => state.equippedReincarnationTalents)
  const hasWorld = Boolean(worldConfig && worldCode > 0 && worldInitialized)
  const hasCharacter = Boolean(characterName.trim())
  const hasPatterns = isPatternLoadoutValid(selectedPatterns, equippedReincarnationTalents)

  useEffect(() => {
    if (!storesHydrated) return
    if (!hasWorld) router.replace('/new-game/world-select')
    else if (!hasCharacter) router.replace('/new-game/character-create')
    else if (!hasPatterns) router.replace('/talent-draw')
  }, [hasCharacter, hasPatterns, hasWorld, router, storesHydrated])

  if (!storesHydrated || !hasWorld || !hasCharacter || !hasPatterns) return null
  return <FatePreviewContent />
}
