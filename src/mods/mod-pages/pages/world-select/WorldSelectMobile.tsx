/**
 * @file WorldSelectMobile.tsx
 * @description 世界选择移动端 —— 预设世界 + 更多世界 + 自定义世界（完整版）
 * @mod mod-pages
 * 参照废弃项目 WorldSelectMobile 完整移植
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import {
  PRESET_WORLDS,
  allocateWorldCode,
  buildWorldConfigFromCustom,
  resolvePresetWorldCode,
  type PresetWorld,
} from '@/mods/mod-world'
import { startBackgroundWorldInitForCustom } from '@/mods/mod-world/world-init-api'
import { clearWorldGeneratedCache } from '@/mods/mod-world/world-init-api'
import { BottomActionBar } from '@/mods/mod-ui'

import {
  useWorldSelectForm,
  DIFFICULTY_CONFIG,
  DIFFICULTY_TITLES,
  type Difficulty,
  type EraEntry,
  type SavedCustomWorld,
} from './useWorldSelectForm'
import { isApiConfigured, useWorldConfirm } from './useWorldConfirm'
import { useWorldSelectCache } from './useWorldSelectCache'
import { saveStore } from '@/core'

import styles from './WorldSelectMobile.module.css'

// ============================================================
// 组件
// ============================================================

export function WorldSelectMobile() {
  const router = useRouter()
  const { handleConfirm: confirmWorld, conflictModal } = useWorldConfirm()
  const { worldCodesWithCache, rotatingWorldCode, handleClearWorldCache } = useWorldSelectCache()
  const [isConfirming, setIsConfirming] = useState(false)

  const [selectedWorld, setSelectedWorld] = useState<PresetWorld | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const {
    difficulty,
    setDifficulty,
  } = useWorldSelectForm()

  const [customName, setCustomName] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customEraName, setCustomEraName] = useState('')
  const [customEraYear, setCustomEraYear] = useState('')
  const [autoEraEnabled, setAutoEraEnabled] = useState(false)
  const [eraTimelineEntries, setEraTimelineEntries] = useState<EraEntry[]>([])
  const [_newEraEntryName, _setNewEraEntryName] = useState('')
  const [_newEraEntryYear, _setNewEraEntryYear] = useState('')
  const [worldview, setWorldview] = useState('auto')
  const [savedWorlds, setSavedWorlds] = useState<SavedCustomWorld[]>(() => {
    try {
      const parsed = saveStore.get<SavedCustomWorld[]>('mod-pages', 0, 'custom-worlds') ?? []
      return parsed.map((w) => ({
        ...w,
        worldCode: w.worldCode ?? allocateWorldCode(),
      }))
    } catch { return [] }
  })
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null)

  const persistSaved = useCallback((worlds: SavedCustomWorld[]) => {
    setSavedWorlds(worlds)
    saveStore.set('mod-pages', 0, 'custom-worlds', worlds)
  }, [])

  const { presetMain, presetMore } = useMemo(() => ({
    presetMain: PRESET_WORLDS.slice(0, 6),
    presetMore: PRESET_WORLDS.slice(6),
  }), [])

  const handleSelectPreset = (w: PresetWorld) => {
    setSelectedWorld(w)
    setEditingWorldId(null)
  }

  const triggerCustomWorldBackgroundInit = useCallback((cw: SavedCustomWorld) => {
    if (!isApiConfigured()) return
    const config = buildWorldConfigFromCustom(
      { name: cw.name, description: cw.description, worldview: cw.worldview },
      difficulty,
    )
    startBackgroundWorldInitForCustom(config, cw.worldCode)
  }, [difficulty])

  const handleSelectCustomWorld = (cw: SavedCustomWorld) => {
    setSelectedWorld({
      id: cw.id, name: cw.name, description: cw.description,
      worldviewId: (cw.worldview === 'auto' ? 'idealist' : cw.worldview) as PresetWorld['worldviewId'],
      category: 'modern' as PresetWorld['category'],
      summary: cw.description.slice(0, 50),
      era: `${cw.eraName}${cw.eraStartYear}年`,
      config: { eraStartYear: cw.eraStartYear, worldCode: cw.worldCode, worldview: cw.worldview },
      races: ['人类'], genders: ['男', '女'], icon: '🌍',
    })
    setEditingWorldId(null)
  }

  const handleAddCustom = () => {
    if (!customName.trim() || !customDesc.trim()) return
    const worldCode = allocateWorldCode()
    const newWorld: SavedCustomWorld = {
      id: `custom-${worldCode}`, name: customName.trim(), description: customDesc.trim(),
      eraName: customEraName.trim() || '公元', eraStartYear: parseInt(customEraYear) || 1,
      currentEraYear: parseInt(customEraYear) || 1,
      eraTimeline: autoEraEnabled ? [...eraTimelineEntries] : undefined,
      worldview, dynamicAttrTags: ['wealth', 'fame', 'power', 'ability', 'connections'],
      worldCode,
    }
    persistSaved([...savedWorlds, newWorld])
    triggerCustomWorldBackgroundInit(newWorld)
    resetCustomForm()
    setSelectedWorld({
      id: newWorld.id, name: newWorld.name, description: newWorld.description,
      worldviewId: (worldview === 'auto' ? 'idealist' : worldview) as PresetWorld['worldviewId'],
      category: 'modern' as PresetWorld['category'],
      summary: newWorld.description.slice(0, 50),
      era: `${newWorld.eraName}${newWorld.eraStartYear}年`,
      config: { eraStartYear: newWorld.eraStartYear, worldCode: newWorld.worldCode, worldview: newWorld.worldview },
      races: ['人类'], genders: ['男', '女'], icon: '🌍',
    })
  }

  const handleStartEdit = (cw: SavedCustomWorld) => {
    setEditingWorldId(cw.id)
    setCustomName(cw.name); setCustomDesc(cw.description)
    setCustomEraName(cw.eraName); setCustomEraYear(String(cw.eraStartYear))
    setAutoEraEnabled(!!cw.eraTimeline); setEraTimelineEntries(cw.eraTimeline || [])
    setWorldview(cw.worldview); setShowCustomForm(true)
  }

  const handleSaveEdit = () => {
    if (!customName.trim() || !customDesc.trim() || !editingWorldId) return
    const updated = savedWorlds.map((cw) =>
      cw.id === editingWorldId ? { ...cw, name: customName.trim(), description: customDesc.trim(), eraName: customEraName.trim() || '公元', eraStartYear: parseInt(customEraYear) || 1, currentEraYear: parseInt(customEraYear) || 1, eraTimeline: autoEraEnabled ? [...eraTimelineEntries] : undefined, worldview } : cw)
    persistSaved(updated)
    resetCustomForm()
    const edited = updated.find((cw) => cw.id === editingWorldId)
    if (edited) {
      triggerCustomWorldBackgroundInit(edited)
      setSelectedWorld({
        id: edited.id, name: edited.name, description: edited.description,
        worldviewId: (edited.worldview === 'auto' ? 'idealist' : edited.worldview) as PresetWorld['worldviewId'],
        category: 'modern' as PresetWorld['category'],
        summary: edited.description.slice(0, 50),
        era: `${edited.eraName}${edited.eraStartYear}年`,
        config: { eraStartYear: edited.eraStartYear, worldCode: edited.worldCode, worldview: edited.worldview },
        races: ['人类'], genders: ['男', '女'], icon: '🌍',
      })
    }
  }

  const handleDeleteCustom = (cw: SavedCustomWorld) => {
    clearWorldGeneratedCache(cw.worldCode)
    persistSaved(savedWorlds.filter((w) => w.id !== cw.id))
    if (selectedWorld?.id === cw.id) setSelectedWorld(null)
  }

  const resetCustomForm = () => {
    setEditingWorldId(null)
    setCustomName(''); setCustomDesc(''); setCustomEraName(''); setCustomEraYear('')
    setAutoEraEnabled(false); setEraTimelineEntries([])
    _setNewEraEntryName(''); _setNewEraEntryYear(''); setWorldview('auto')
  }

  const handleConfirm = async () => {
    if (!selectedWorld || isConfirming) return
    setIsConfirming(true)
    const worldCode = typeof selectedWorld.config.worldCode === 'number'
      ? selectedWorld.config.worldCode
      : undefined
    const customWorldview = typeof selectedWorld.config.worldview === 'string'
      ? selectedWorld.config.worldview
      : undefined
    await confirmWorld(selectedWorld, difficulty, { worldCode, customWorldview })
    setIsConfirming(false)
  }

  return (
    <>
      {conflictModal}
      <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.headerIcon}>🌍</div>
            <h2 className={styles.headerTitle}>AI人生模拟器</h2>
            <p className={styles.headerSubtitle}>选择一个你的世界</p>
          </div>

          <div className={styles.presetGrid}>
            {presetMain.map((w) => {
              const isSel = selectedWorld?.id === w.id
              const worldCode = resolvePresetWorldCode(w)
              return (
                <div key={w.id} onClick={() => handleSelectPreset(w)}
                  className={`${styles.presetCard} ${isSel ? styles.presetCardSelected : ''}`}>
                  <div className={styles.presetCardIcon}>{w.icon}</div>
                  <div className={`${styles.presetCardName} ${isSel ? styles.presetCardNameSel : ''}`}>{w.name}</div>
                  <div className={styles.presetCardSubtitle}>{w.era}</div>
                  {worldCodesWithCache.has(worldCode) && (
                    <div className={styles.cardBadge}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleClearWorldCache(worldCode) }}
                        className={`${styles.btnRefresh} ${rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                        title="清空该世界 AI 生成缓存"
                      >🔄</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className={styles.tabBar}>
            <button onClick={() => { setShowMore(!showMore); setShowCustom(false); setShowCustomForm(false) }}
              className={`${styles.tab} ${showMore ? styles.tabActive : ''}`}>
              <span>更多世界</span><span className={styles.tabArrow}>{showMore ? '▲' : '▼'}</span>
            </button>
            <button onClick={() => { setShowCustom(!showCustom); setShowMore(false); setShowCustomForm(false) }}
              className={`${styles.tab} ${showCustom ? styles.tabActive : ''}`}>
              <span>已保存</span><span className={styles.tabArrow}>{showCustom ? '▲' : '▼'}</span>
            </button>
            <button onClick={() => { setShowCustomForm(!showCustomForm); setShowMore(false); setShowCustom(false) }}
              className={`${styles.tab} ${showCustomForm ? styles.tabActive : ''}`}>
              <span>自定义</span><span className={styles.tabArrow}>{showCustomForm ? '▲' : '▼'}</span>
            </button>
          </div>

          {showMore && (
            <div className={styles.moreGrid}>
              {presetMore.map((w) => {
                const isSel = selectedWorld?.id === w.id
                const worldCode = resolvePresetWorldCode(w)
                return (
                  <div key={w.id} onClick={() => handleSelectPreset(w)}
                    className={`${styles.moreCard} ${isSel ? styles.moreCardSelected : ''}`}>
                    <div className={styles.moreCardIcon}>{w.icon}</div>
                    <div className={`${styles.moreCardName} ${isSel ? styles.moreCardNameSel : ''}`}>{w.name}</div>
                    {worldCodesWithCache.has(worldCode) && (
                      <div className={styles.cardBadge}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleClearWorldCache(worldCode) }}
                          className={`${styles.btnRefresh} ${rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                          title="清空该世界 AI 生成缓存"
                        >🔄</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {showCustom && (
            savedWorlds.length > 0 ? (
              <div className={styles.presetGrid}>
                {savedWorlds.map((cw) => {
                  const isSel = selectedWorld?.id === cw.id
                  return (
                    <div key={cw.id} className={`${styles.presetCard} ${isSel ? styles.presetCardSelected : ''}`}>
                      <div onClick={() => handleSelectCustomWorld(cw)}>
                        <div className={styles.presetCardName}>{cw.name}</div>
                        <div className={styles.presetCardSubtitle}>{cw.eraName} · {cw.description.slice(0, 20)}...</div>
                      </div>
                      <div className={styles.savedCardActions}>
                        {worldCodesWithCache.has(cw.worldCode) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleClearWorldCache(cw.worldCode) }}
                            className={`${styles.btnRefresh} ${rotatingWorldCode === cw.worldCode ? styles.spinning : ''}`}
                            title="清空该世界 AI 生成缓存"
                          >🔄</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleStartEdit(cw) }}
                          className={styles.btnEdit} title="编辑">✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteCustom(cw) }}
                          className={styles.btnDelete} title="删除">🗑️</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', fontSize: 12, margin: '16px 0' }}>
                暂无已保存的自定义世界
              </p>
            )
          )}

          {showCustomForm && (
            <div className={styles.formSection}>
              <div className={styles.formTitle}>{editingWorldId ? '编辑世界' : '🛜 创建新世界'}</div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>名称</label>
                <input className={styles.formInput} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="世界名称" maxLength={100} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>描述</label>
                <textarea className={styles.formTextarea} value={customDesc} onChange={(e) => setCustomDesc(e.target.value.slice(0, 5000))} placeholder="描述这个世界..." maxLength={5000} />
                <div className={styles.charCount}>{customDesc.length}/5000</div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>纪元名称</label>
                <input className={styles.formInput} value={customEraName} onChange={(e) => setCustomEraName(e.target.value)} placeholder="如：公元" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>起始年份</label>
                <input className={styles.formInput} type="number" value={customEraYear} onChange={(e) => setCustomEraYear(e.target.value)} placeholder="如：2024" />
              </div>

              {/* Worldview type selector */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>世界观类型</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {['auto', 'materialist', 'idealist', 'materialist_cultivation', 'idealist_cultivation', 'mixed', 'survival_horror'].map((k) => {
                    const labels: Record<string, string> = { auto: '自动', materialist: '唯物', idealist: '唯心', materialist_cultivation: '唯物修仙', idealist_cultivation: '唯心修仙', mixed: '混合', survival_horror: '恐怖' }
                    return (
                      <button key={k} onClick={() => setWorldview(k)}
                        style={{
                          padding: '4px 10px', fontSize: 11, borderRadius: 8,
                          border: worldview === k ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: worldview === k ? 'var(--color-primary-light)' : 'var(--color-bg-secondary)',
                          color: worldview === k ? 'var(--color-primary)' : 'var(--color-text-primary)',
                          cursor: 'pointer',
                        }}>{labels[k]}</button>
                    )
                  })}
                </div>
              </div>

              <div className={styles.actionRow}>
                <button onClick={editingWorldId ? handleSaveEdit : handleAddCustom}
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  disabled={!customName.trim() || !customDesc.trim()}>
                  {editingWorldId ? '保存' : '创建'}
                </button>
                <button onClick={() => { setShowCustomForm(false); resetCustomForm() }}
                  className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}>取消</button>
              </div>
            </div>
          )}

          {selectedWorld && !showCustomForm && (
            <div className={styles.selectedSection}>
              <div className={styles.selectedDesc}>
                已选择: <strong>{selectedWorld.name}</strong>{' '}
                <span className={styles.selectedMeta}>{selectedWorld.era}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomActionBar
        onBack={() => router.push('/')}
        backTitle="返回欢迎界面"
        onConfirm={handleConfirm}
        confirmText="✔ 确认"
        confirmDisabled={!selectedWorld}
        confirmTitle={selectedWorld ? `进入 ${selectedWorld.name}` : '请先选择一个世界'}
        moreLabel={DIFFICULTY_CONFIG[difficulty].label}
        moreItems={(['normal', 'hard', 'nightmare', 'hell'] as Difficulty[]).map((d) => ({
          label: DIFFICULTY_CONFIG[d].label,
          icon: difficulty === d ? '✔' : undefined,
          title: DIFFICULTY_TITLES[d],
          onClick: () => setDifficulty(d),
        }))}
      />
    </>
  )
}
