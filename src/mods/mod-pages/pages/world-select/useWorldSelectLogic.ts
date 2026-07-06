/**
 * @file useWorldSelectLogic.ts
 * @description 世界选择页共享业务逻辑 hook —— 桌面端/移动端共用
 * @mod mod-pages
 *
 * 从 WorldSelectDesktop 提取全部状态、业务函数、计算值、LABELS 常量。
 * 桌面端为标准源（source of truth），移动端严格对齐。
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import {
  PRESET_WORLDS,
  allocateWorldCode,
  type PresetWorld,
} from '@/mods/mod-world'
import { clearWorldGeneratedCache } from '@/mods/mod-world/world-init-api'

import {
  useWorldSelectForm,
  DIFFICULTY_CONFIG,
  DIFFICULTY_TITLES,
  type Difficulty,
  type EraEntry,
  type SavedCustomWorld,
} from './useWorldSelectForm'
import { useWorldConfirm } from './useWorldConfirm'
import { useWorldSelectCache } from './useWorldSelectCache'
import { saveStore } from '@/core'

// ============================================================
// LABELS —— 所有硬编码文案的唯一源
// ============================================================

export const LABELS = {
  // ---- Header ----
  headerTitle: 'AI人生模拟器',
  headerSubtitle: '选择一个你的世界',

  // ---- Tabs ----
  tabMore: '更多世界',
  tabSaved: '已保存世界',
  tabCustom: '自定义世界',
  tabMoreHideTitle: '隐藏额外的预设世界',
  tabMoreShowTitle: '显示更多预设世界',
  tabSavedHideTitle: '隐藏已保存的自定义世界',
  tabSavedShowTitle: '展开已保存的自定义世界',
  tabCustomHideTitle: '隐藏自定义世界表单',
  tabCustomShowTitle: '展开自定义世界表单',

  // ---- Cache ----
  clearCacheTitle: '清空该世界 AI 生成缓存',

  // ---- Empty state ----
  emptySavedHint: '暂无已保存的自定义世界，在\u201C自定义世界\u201D中创建',

  // ---- Custom form ----
  formEditTitle: '编辑自定义世界',
  formCreateTitle: '自定义世界',
  formLabelName: '世界名称 *',
  formPlaceholderName: '世界名称（如：末日废土）',
  formLabelDesc: '详细介绍 *',
  formPlaceholderDesc: '详细介绍这个世界的设定...',
  formLabelEra: '年代纪元',
  formPlaceholderEraName: '纪元名称（如：公元）',
  formPlaceholderYear: '年份',
  eraYearUnit: '年',
  defaultEraName: '公元',
  bcLabel: '公元前',
  adLabel: '公元',
  bcModeTitle: '公元前模式',
  adModeTitle: '公元模式',

  // ---- Auto era system ----
  formLabelAutoEra: '📅 自动年号系统',
  autoEraEnabledText: '✔ 已启用',
  autoEraDisabledText: '✘ 启用',
  autoEraEnabledTitle: '已启用：年号会根据时间线自动切换',
  autoEraDisabledTitle: '未启用：使用固定纪元名称',
  formPlaceholderEraEntryName: '年号名（如：洪武）',
  formPlaceholderEraEntryYear: '起始公元年',
  btnAddEraEntry: '+ 添加',
  eraHint: '示例：洪武起始368 → 建文起始1398，到期后AI可自行决定切换新年号',
  eraTimelineYearPrefix: '起始公元',
  eraTimelineYearSuffix: '年',

  // ---- Card actions ----
  editTitle: '编辑',
  deleteTitle: '删除',

  // ---- Form buttons ----
  saveEditTitle: '保存编辑',
  btnSaveEdit: '✔ 保存编辑',
  cancelEditTitle: '取消编辑',
  btnCancel: '取消',
  addCustomTitle: '将当前输入的名称和描述创建为自定义世界',
  btnAddCustom: '✔ 添加自定义世界',

  // ---- Selected info ----
  selectedLabel: '已选择: ',

  // ---- Bottom bar ----
  backTitle: '返回欢迎界面',
  confirmText: '✔ 确认',
  confirmDisabledTitle: '请先选择一个世界',
  confirmTitlePrefix: '进入 ',

  // ---- Difficulty ----
  difficultyItems: DIFFICULTY_CONFIG,
  difficultyTitles: DIFFICULTY_TITLES,
} as const

// ============================================================
// Hook
// ============================================================

export function useWorldSelectLogic() {
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
  const { difficulty, setDifficulty } = useWorldSelectForm()

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
    } catch {
      return []
    }
  })
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null)

  // ---- 持久化已保存世界 ----
  const persistSaved = useCallback((worlds: SavedCustomWorld[]) => {
    setSavedWorlds(worlds)
    saveStore.set('mod-pages', 0, 'custom-worlds', worlds)
  }, [])

  // ---- 预设世界分组 ----
  const { presetMain, presetMore } = useMemo(
    () => ({
      presetMain: PRESET_WORLDS.slice(0, 6),
      presetMore: PRESET_WORLDS.slice(6),
    }),
    [],
  )

  // ---- 难度下拉项 ----
  const difficultyItems = useMemo(
    () =>
      (['normal', 'hard', 'nightmare', 'hell'] as Difficulty[]).map((d) => ({
        label: DIFFICULTY_CONFIG[d].label,
        icon: difficulty === d ? ('✔' as const) : undefined,
        title: DIFFICULTY_TITLES[d],
        onClick: () => setDifficulty(d),
      })),
    [difficulty, setDifficulty],
  )

  // ---- 确认标题 ----
  const confirmTitle = useMemo(
    () =>
      selectedWorld
        ? `${LABELS.confirmTitlePrefix}${selectedWorld.name}`
        : LABELS.confirmDisabledTitle,
    [selectedWorld],
  )

  // ============================================================
  // 预设世界选择
  // ============================================================

  const handleSelectPreset = useCallback((w: PresetWorld) => {
    setSelectedWorld(w)
    setEditingWorldId(null)
  }, [])

  // ============================================================
  // 选择自定义世界
  // ============================================================

  const handleSelectCustomWorld = useCallback((cw: SavedCustomWorld) => {
    setSelectedWorld({
      id: cw.id,
      name: cw.name,
      description: cw.description,
      worldviewId: (cw.worldview === 'auto' ? 'idealist' : cw.worldview) as PresetWorld['worldviewId'],
      category: 'modern' as PresetWorld['category'],
      summary: cw.description.slice(0, 50),
      era: `${cw.eraName}${Math.abs(cw.eraStartYear)}年`,
      config: { eraStartYear: cw.eraStartYear, worldCode: cw.worldCode, worldview: cw.worldview },
      races: ['人类'],
      genders: ['男', '女'],
      icon: '🌍',
    })
    setEditingWorldId(null)
  }, [])

  // ============================================================
  // 自定义世界 CRUD
  // ============================================================

  const resetCustomForm = useCallback(() => {
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
  }, [])

  const handleAddCustom = useCallback(() => {
    if (!customName.trim() || !customDesc.trim()) return
    const worldCode = allocateWorldCode()
    const signedYear = (parseInt(customEraYear) || 1) * (isBC ? -1 : 1)
    const newWorld: SavedCustomWorld = {
      id: `custom-${worldCode}`,
      name: customName.trim(),
      description: customDesc.trim(),
      eraName: customEraName.trim() || LABELS.defaultEraName,
      eraStartYear: signedYear,
      currentEraYear: signedYear,
      eraTimeline: autoEraEnabled ? [...eraTimelineEntries] : undefined,
      worldview: worldview,
      dynamicAttrTags: ['wealth', 'fame', 'power', 'ability', 'connections'],
      worldCode,
    }
    const updated = [...savedWorlds, newWorld]
    persistSaved(updated)
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
  }, [
    customName, customDesc, customEraName, customEraYear, isBC,
    autoEraEnabled, eraTimelineEntries, worldview, savedWorlds,
    persistSaved, resetCustomForm,
  ])

  const handleStartEdit = useCallback((cw: SavedCustomWorld) => {
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
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!customName.trim() || !customDesc.trim() || !editingWorldId) return
    const signedYear = (parseInt(customEraYear) || 1) * (isBC ? -1 : 1)
    const updated = savedWorlds.map((cw) =>
      cw.id === editingWorldId
        ? {
            ...cw,
            name: customName.trim(),
            description: customDesc.trim(),
            eraName: customEraName.trim() || LABELS.defaultEraName,
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
  }, [
    customName, customDesc, customEraName, customEraYear, isBC,
    autoEraEnabled, eraTimelineEntries, worldview, editingWorldId,
    savedWorlds, persistSaved, resetCustomForm,
  ])

  const handleCancelEdit = useCallback(() => {
    resetCustomForm()
  }, [resetCustomForm])

  const handleDeleteCustom = useCallback(
    (cw: SavedCustomWorld) => {
      clearWorldGeneratedCache(cw.worldCode)
      const updated = savedWorlds.filter((w) => w.id !== cw.id)
      persistSaved(updated)
      if (selectedWorld?.id === cw.id) setSelectedWorld(null)
    },
    [savedWorlds, selectedWorld, persistSaved],
  )

  // ============================================================
  // 确认进入
  // ============================================================

  const handleConfirm = useCallback(async () => {
    if (!selectedWorld || isConfirming) return
    setIsConfirming(true)
    const worldCode =
      typeof selectedWorld.config.worldCode === 'number'
        ? selectedWorld.config.worldCode
        : undefined
    const customWorldview =
      typeof selectedWorld.config.worldview === 'string'
        ? selectedWorld.config.worldview
        : undefined
    await confirmWorld(selectedWorld, difficulty, { worldCode, customWorldview })
    setIsConfirming(false)
  }, [selectedWorld, isConfirming, difficulty, confirmWorld])

  // ============================================================
  // 返回
  // ============================================================

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  // ============================================================
  // 返回值
  // ============================================================

  return {
    // 状态
    selectedWorld,
    showMore,
    showCustom,
    showCustomForm,
    difficulty,
    customName,
    customDesc,
    customEraName,
    customEraYear,
    isBC,
    autoEraEnabled,
    eraTimelineEntries,
    newEraEntryName,
    newEraEntryYear,
    savedWorlds,
    editingWorldId,

    // setter
    setShowMore,
    setShowCustom,
    setShowCustomForm,
    setCustomName,
    setCustomDesc,
    setCustomEraName,
    setCustomEraYear,
    setIsBC,
    setAutoEraEnabled,
    setEraTimelineEntries,
    setNewEraEntryName,
    setNewEraEntryYear,

    // 业务函数
    handleSelectPreset,
    handleSelectCustomWorld,
    handleAddCustom,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleDeleteCustom,
    handleConfirm,
    handleBack,

    // 计算值
    presetMain,
    presetMore,
    difficultyItems,
    confirmTitle,

    // 从子 hook 透传
    worldCodesWithCache,
    rotatingWorldCode,
    handleClearWorldCache,
    conflictModal,

    // 常量
    LABELS,
  }
}
