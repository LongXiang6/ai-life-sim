/**
 * @file WorldSelectDesktop.tsx
 * @description 世界选择桌面端 —— 预设世界 + 更多世界 + 自定义世界（完整版）
 * @mod mod-pages
 *
 * 参照废弃项目 WorldSelectDesktop 完整移植：
 *   - 6 个主预设世界网格 + 18 个扩展世界折叠面板
 *   - 自定义世界完整表单（自动年号系统 + 年号时间线 + 世界观类型）
 *   - 已保存世界面板（编辑/删除，localStorage 持久化）
 *   - 金手指模式选择
 *   - 难度下拉底部操作栏
 *   - 已选世界信息 + 动态属性标签
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

import styles from './WorldSelectDesktop.module.css'

// ============================================================
// 组件
// ============================================================

export function WorldSelectDesktop() {
  const router = useRouter()
  const { handleConfirm: confirmWorld, conflictModal } = useWorldConfirm()
  const { worldCodesWithCache, rotatingWorldCode, handleClearWorldCache } = useWorldSelectCache()
  const [isConfirming, setIsConfirming] = useState(false)

  // ---- 预设世界选择 ----
  const [selectedWorld, setSelectedWorld] = useState<PresetWorld | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)

  // ---- 难度 ----
  const {
    difficulty,
    setDifficulty,
  } = useWorldSelectForm()

  // ---- 自定义世界表单 ----
  const [customName, setCustomName] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customEraName, setCustomEraName] = useState('')
  const [customEraYear, setCustomEraYear] = useState('')
  const [isBC, setIsBC] = useState(false)
  const [autoEraEnabled, setAutoEraEnabled] = useState(false)
  const [eraTimelineEntries, setEraTimelineEntries] = useState<EraEntry[]>([])
  const [newEraEntryName, setNewEraEntryName] = useState('')
  const [newEraEntryYear, setNewEraEntryYear] = useState('')
  const [worldview, setWorldview] = useState('auto')

  // ---- 已保存世界 ----
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

  // ---- 持久化已保存世界 ----
  const persistSaved = useCallback((worlds: SavedCustomWorld[]) => {
    setSavedWorlds(worlds)
    saveStore.set('mod-pages', 0, 'custom-worlds', worlds)
  }, [])

  // ---- 预设世界分组 ----
  const { presetMain, presetMore } = useMemo(() => ({
    presetMain: PRESET_WORLDS.slice(0, 6),
    presetMore: PRESET_WORLDS.slice(6),
  }), [])

  // ============================================================
  // 预设世界选择
  // ============================================================

  const handleSelectPreset = (w: PresetWorld) => {
    setSelectedWorld(w)
    setEditingWorldId(null)
  }

  // ============================================================
  // 自定义世界 CRUD
  // ============================================================

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
      id: cw.id,
      name: cw.name,
      description: cw.description,
      worldviewId: (cw.worldview === 'auto' ? 'idealist' : cw.worldview) as PresetWorld['worldviewId'],
      category: 'modern' as PresetWorld['category'],
      summary: cw.description.slice(0, 50),
      era: `${cw.eraName}${cw.eraStartYear}年`,
      config: { eraStartYear: cw.eraStartYear, worldCode: cw.worldCode, worldview: cw.worldview },
      races: ['人类'],
      genders: ['男', '女'],
      icon: '🌍',
    })
    setEditingWorldId(null)
  }

  const handleAddCustom = () => {
    if (!customName.trim() || !customDesc.trim()) return
    const worldCode = allocateWorldCode()
    const signedYear = (parseInt(customEraYear) || 1) * (isBC ? -1 : 1)
    const newWorld: SavedCustomWorld = {
      id: `custom-${worldCode}`,
      name: customName.trim(),
      description: customDesc.trim(),
      eraName: customEraName.trim() || '公元',
      eraStartYear: signedYear,
      currentEraYear: signedYear,
      eraTimeline: autoEraEnabled ? [...eraTimelineEntries] : undefined,
      worldview: worldview,
      dynamicAttrTags: ['wealth', 'fame', 'power', 'ability', 'connections'],
      worldCode,
    }
    const updated = [...savedWorlds, newWorld]
    persistSaved(updated)
    triggerCustomWorldBackgroundInit(newWorld)
    resetCustomForm()
    setSelectedWorld({
      id: newWorld.id,
      name: newWorld.name,
      description: newWorld.description,
      worldviewId: (worldview === 'auto' ? 'idealist' : worldview) as PresetWorld['worldviewId'],
      category: 'modern' as PresetWorld['category'],
      summary: newWorld.description.slice(0, 50),
      era: `${newWorld.eraName}${Math.abs(newWorld.eraStartYear)}年`,
      config: { eraStartYear: newWorld.eraStartYear, worldCode: newWorld.worldCode, worldview: newWorld.worldview },
      races: ['人类'],
      genders: ['男', '女'],
      icon: '🌍',
    })
  }

  const handleStartEdit = (cw: SavedCustomWorld) => {
    setEditingWorldId(cw.id)
    setCustomName(cw.name)
    setCustomDesc(cw.description)
    setCustomEraName(cw.eraName)
    setCustomEraYear(String(Math.abs(cw.eraStartYear)))
    setIsBC(cw.eraStartYear < 0)
    setAutoEraEnabled(!!cw.eraTimeline)
    setEraTimelineEntries(cw.eraTimeline || [])
    setWorldview(cw.worldview)
    setShowCustomForm(true)
  }

  const handleSaveEdit = () => {
    if (!customName.trim() || !customDesc.trim() || !editingWorldId) return
    const signedYear = (parseInt(customEraYear) || 1) * (isBC ? -1 : 1)
    const updated = savedWorlds.map((cw) =>
      cw.id === editingWorldId
        ? {
            ...cw,
            name: customName.trim(),
            description: customDesc.trim(),
            eraName: customEraName.trim() || '公元',
            eraStartYear: signedYear,
            currentEraYear: signedYear,
            eraTimeline: autoEraEnabled ? [...eraTimelineEntries] : undefined,
            worldview,
          }
        : cw,
    )
    persistSaved(updated)
    resetCustomForm()
    const edited = updated.find((cw) => cw.id === editingWorldId)
    if (edited) {
      triggerCustomWorldBackgroundInit(edited)
      setSelectedWorld({
        id: edited.id,
        name: edited.name,
        description: edited.description,
        worldviewId: (edited.worldview === 'auto' ? 'idealist' : edited.worldview) as PresetWorld['worldviewId'],
        category: 'modern' as PresetWorld['category'],
        summary: edited.description.slice(0, 50),
        era: `${edited.eraName}${Math.abs(edited.eraStartYear)}年`,
        config: { eraStartYear: edited.eraStartYear, worldCode: edited.worldCode, worldview: edited.worldview },
        races: ['人类'],
        genders: ['男', '女'],
        icon: '🌍',
      })
    }
  }

  const handleCancelEdit = () => {
    resetCustomForm()
  }

  const handleDeleteCustom = (cw: SavedCustomWorld) => {
    clearWorldGeneratedCache(cw.worldCode)
    const updated = savedWorlds.filter((w) => w.id !== cw.id)
    persistSaved(updated)
    if (selectedWorld?.id === cw.id) setSelectedWorld(null)
  }

  const resetCustomForm = () => {
    setEditingWorldId(null)
    setCustomName('')
    setCustomDesc('')
    setCustomEraName('')
    setCustomEraYear('')
    setIsBC(false)
    setAutoEraEnabled(false)
    setEraTimelineEntries([])
    setNewEraEntryName('')
    setNewEraEntryYear('')
    setWorldview('auto')
  }

  // ============================================================
  // 确认进入
  // ============================================================

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

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <>
      {conflictModal}
      <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--color-bg)', padding: '24px 32px 140px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIcon}>🌍</div>
            <h2 className={styles.headerTitle}>AI人生模拟器</h2>
            <p className={styles.headerSubtitle}>选择一个你的世界</p>
          </div>

          {/* Preset Worlds Grid (6 个主世界) */}
          <div className={styles.grid}>
            {presetMain.map((w) => {
              const isSel = selectedWorld?.id === w.id
              const worldCode = resolvePresetWorldCode(w)
              return (
                <div
                  key={w.id}
                  onClick={() => handleSelectPreset(w)}
                  className={`${styles.card} ${isSel ? styles.cardSelected : ''}`}
                >
                  <span className={styles.cardIcon}>{w.icon}</span>
                  <h3 className={styles.cardTitle}>{w.name}</h3>
                  <p className={styles.cardSubtitle}>{w.era}</p>
                  {worldCodesWithCache.has(worldCode) && (
                    <div className={styles.cardBadge}>
                      <span className={styles.cardBadgeBtn}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleClearWorldCache(worldCode) }}
                          className={`${styles.btnRefresh} ${rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                          title="清空该世界 AI 生成缓存"
                        >🔄</button>
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Toggle Tab Bar */}
          <div className={styles.tabBar}>
            <button
              onClick={() => { setShowMore(!showMore); setShowCustom(false); setShowCustomForm(false) }}
              className={`${styles.tab} ${showMore ? styles.tabActive : ''}`}
              title={showMore ? '隐藏额外的预设世界' : '显示更多预设世界'}
            >
              <span>更多世界</span>
              <span className={styles.tabArrow}>{showMore ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={() => { setShowCustom(!showCustom); setShowMore(false); setShowCustomForm(false) }}
              className={`${styles.tab} ${showCustom ? styles.tabActive : ''}`}
              title={showCustom ? '隐藏已保存的自定义世界' : '展开已保存的自定义世界'}
            >
              <span>已保存世界</span>
              <span className={styles.tabArrow}>{showCustom ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={() => { setShowCustomForm(!showCustomForm); setShowMore(false); setShowCustom(false) }}
              className={`${styles.tab} ${showCustomForm ? styles.tabActive : ''}`}
              title={showCustomForm ? '隐藏自定义世界表单' : '展开自定义世界表单'}
            >
              <span>自定义世界</span>
              <span className={styles.tabArrow}>{showCustomForm ? '▲' : '▼'}</span>
            </button>
          </div>

          {/* More Worlds Panel (18 个扩展世界) */}
          {showMore && (
            <div className={styles.gridMore}>
              {presetMore.map((w) => {
                const isSel = selectedWorld?.id === w.id
                const worldCode = resolvePresetWorldCode(w)
                return (
                  <div
                    key={w.id}
                    onClick={() => handleSelectPreset(w)}
                    className={`${styles.card} ${styles.cardSmall} ${isSel ? styles.cardSelected : ''}`}
                  >
                    <span className={styles.cardSmallTitle}>{w.icon} {w.name}</span>
                    {worldCodesWithCache.has(worldCode) && (
                      <div className={styles.cardBadge}>
                        <span className={styles.cardBadgeBtn}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleClearWorldCache(worldCode) }}
                            className={`${styles.btnRefresh} ${rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                            title="清空该世界 AI 生成缓存"
                          >🔄</button>
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Saved Custom Worlds */}
          {showCustom && (
            savedWorlds.length > 0 ? (
              <div className={styles.grid}>
                {savedWorlds.map((cw) => {
                  const isSel = selectedWorld?.id === cw.id
                  return (
                    <div key={cw.id} className={`${styles.card} ${isSel ? styles.cardSelected : ''}`}>
                      <div className={styles.savedCardContent} onClick={() => handleSelectCustomWorld(cw)}>
                        <div className={styles.savedCardHeader}>
                          <h3 className={styles.savedCardTitle}>{cw.name}</h3>
                        </div>
                        <p className={styles.savedCardDesc}>
                          {cw.eraName}{Math.abs(cw.eraStartYear)}年 · {cw.description.slice(0, 30)}...
                        </p>
                      </div>
                      <div className={styles.cardBadge}>
                        {worldCodesWithCache.has(cw.worldCode) && (
                          <span className={styles.cardBadgeBtn}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleClearWorldCache(cw.worldCode) }}
                              className={`${styles.btnRefresh} ${rotatingWorldCode === cw.worldCode ? styles.spinning : ''}`}
                              title="清空该世界 AI 生成缓存"
                            >🔄</button>
                          </span>
                        )}
                        <span className={styles.cardBadgeBtn}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStartEdit(cw) }}
                            className={styles.btnEdit}
                            title="编辑"
                          >✏️</button>
                        </span>
                        <span className={styles.cardBadgeBtn}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCustom(cw) }}
                            className={styles.btnDelete}
                            title="删除"
                          >🗑️</button>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', fontSize: 13, margin: '20px 0' }}>
                暂无已保存的自定义世界，在&ldquo;自定义世界&rdquo;中创建
              </p>
            )
          )}

          {/* Custom World Form */}
          {showCustomForm && (
            <div className={styles.formContainer}>
              <h3 className={styles.formTitle}>
                {editingWorldId ? '编辑自定义世界' : '自定义世界'}
              </h3>

              {/* World Name */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>世界名称 *</label>
                <input
                  placeholder="世界名称（如：末日废土）"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  maxLength={80}
                  className={styles.formInput}
                />
              </div>

              {/* World Description */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>详细介绍 *</label>
                <textarea
                  placeholder="详细介绍这个世界的设定..."
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value.slice(0, 5000))}
                  maxLength={5000}
                  className={`${styles.formInput} ${styles.formTextarea}`}
                />
                <div className={`${styles.formCharCount} ${customDesc.length > 4500 ? styles.formCharCountWarn : ''}`}>
                  {customDesc.length}/5000
                </div>
              </div>

              {/* Era Name + Year */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>年代纪元</label>
                <div className={styles.eraInlineGroup}>
                  <input
                    placeholder="纪元名称（如：公元）"
                    value={customEraName}
                    onChange={(e) => {
                      const v = e.target.value
                      setCustomEraName(v)
                      // 自动检测公元前：纪元名含"前"时自动切到 BC 模式
                      if (/前/.test(v) && !isBC) setIsBC(true)
                    }}
                    className={styles.formInput}
                    style={{ width: 130 }}
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="年份"
                    value={customEraYear}
                    onChange={(e) => setCustomEraYear(e.target.value)}
                    className={styles.formInput}
                    style={{ width: 100 }}
                  />
                  <span className={styles.eraInlineLabel}>年</span>
                  <div className={styles.eraSwitchRow} style={{ marginLeft: 'auto' }}>
                    <span className={styles.eraSwitchLabel}>{isBC ? '公元前' : '公元'}</span>
                    <label className={styles.toggleSwitch} title={isBC ? '公元前模式' : '公元模式'}>
                      <input
                        type="checkbox"
                        checked={isBC}
                        onChange={() => setIsBC(!isBC)}
                      />
                      <span className={styles.toggleSlider} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Auto Era System */}
              <div className={styles.formGroup}>
                <div className={styles.eraToggleLabel}>
                  <label className={styles.formLabel}>📅 自动年号系统</label>
                  <button
                    onClick={() => setAutoEraEnabled(!autoEraEnabled)}
                    title={autoEraEnabled ? '已启用：年号会根据时间线自动切换' : '未启用：使用固定纪元名称'}
                    className={`${styles.eraToggleBtn} ${autoEraEnabled ? styles.eraToggleBtnActive : ''}`}
                  >
                    {autoEraEnabled ? '✔ 已启用' : '✘ 启用'}
                  </button>
                </div>
                {autoEraEnabled && (
                  <>
                    {eraTimelineEntries.length > 0 && (
                      <div className={styles.eraTimeline}>
                        {[...eraTimelineEntries].sort((a, b) => a.startAnchorYear - b.startAnchorYear).map((entry, i) => (
                          <div key={i} className={styles.eraRow}>
                            <span className={styles.eraName}>{entry.name}</span>
                            <span className={styles.eraYear}>起始公元{entry.startAnchorYear}年</span>
                            <button
                              onClick={() => setEraTimelineEntries((p) => p.filter((e) => e !== entry))}
                              className={styles.eraDeleteBtn}
                            >🗑️</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles.eraAddRow}>
                      <input
                        placeholder="年号名（如：洪武）"
                        value={newEraEntryName}
                        onChange={(e) => setNewEraEntryName(e.target.value)}
                        className={`${styles.formInput} ${styles.eraInput}`}
                      />
                      <input
                        type="number"
                        placeholder="起始公元年"
                        value={newEraEntryYear}
                        onChange={(e) => setNewEraEntryYear(e.target.value)}
                        className={`${styles.formInput} ${styles.eraYearInput}`}
                      />
                      <button
                        onClick={() => {
                          if (!newEraEntryName.trim() || !newEraEntryYear.trim()) return
                          setEraTimelineEntries((p) => [
                            ...p,
                            { name: newEraEntryName.trim(), startAnchorYear: parseInt(newEraEntryYear) || 1 },
                          ])
                          setNewEraEntryName('')
                          setNewEraEntryYear('')
                        }}
                        className={styles.eraAddBtn}
                      >+ 添加</button>
                    </div>
                    <p className={styles.eraHint}>
                      示例：洪武起始368 → 建文起始1398，到期后AI可自行决定切换新年号
                    </p>
                  </>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className={styles.actions}>
                {editingWorldId ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!customName.trim() || !customDesc.trim()}
                      title="保存编辑"
                      className={styles.btnPrimary}
                    >✔ 保存编辑</button>
                    <button
                      onClick={handleCancelEdit}
                      title="取消编辑"
                      className={styles.btnSecondary}
                    >取消</button>
                  </>
                ) : (
                  <button
                    onClick={handleAddCustom}
                    disabled={!customName.trim() || !customDesc.trim()}
                    title="将当前输入的名称和描述创建为自定义世界"
                    className={styles.btnSecondary}
                  >✔ 添加自定义世界</button>
                )}
              </div>
            </div>
          )}

          {/* Selected World Info */}
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

export default WorldSelectDesktop
