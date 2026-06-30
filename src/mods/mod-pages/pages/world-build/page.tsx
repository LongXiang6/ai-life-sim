/**
 * @module world-build-page
 * @description 世界构建 —— 世界配置表单（5 维度 + 空间形态联动力量上限 + AI 生成增强）
 * @mod mod-pages
 *
 * Phase 5.1 集成：
 *   - WorldInitSystem.initialize() 生成世界快照
 *   - useWorldStore 存储配置 + 快照
 *   - orchestrator.setContext() 注入引擎上下文
 *
 * W02~W06 集成：
 *   - AI 生成世界标签、详细参数、具名实体、时间线事件
 *   - 用户可点击"AI 生成"按钮，自动填充标签和高级参数
 *   - AI 生成失败时降级到本地算法，不阻塞世界创建流程
 */

'use client'

import { useState, useMemo } from 'react'

import { useRouter } from 'next/navigation'

import { useGlobalStore, configStore } from '@/core'
import { DIFFICULTY_LABELS, DIFFICULTY_DESCRIPTIONS } from '@/foundation'

import type { DifficultyLevel } from '@/foundation'

import { callAI } from '@/core'

import { orchestrator } from '@/mods/mod-engine/engine-api'

import { useWorldStore, formatWorldTagsText, buildCoherenceLocksFromUi, buildWorldInitPromptVars, buildWorldInitPipelineBudgets } from '@/mods/mod-world'
import { WorldInitSystem, filterCoherentWorldTags, buildWorldInitKvSessionId, configForWorldInitSubPool, parseWorldTagsResponse, prepareWorldInitUserPrompt } from '@/mods/mod-world/world-init-api'

import type { WorldConfig } from '@/mods/mod-world'

import { worldTagsPrompt } from '@/mods/mod-world'
import { useSettingsStore } from '@/mods/mod-settings'
import { Button, Input, Select, PageScroll } from '@/mods/mod-ui'

import { useWorldCoherenceConfirm } from '@/mods/mod-pages/hooks/useWorldCoherenceConfirm'

import type { SelectOption } from '@/mods/mod-ui'
import type { AIModelConfig } from '@/foundation'

const SPATIAL_FORM_OPTIONS: SelectOption[] = [
  { value: 'ai', label: '由AI决定' },
  { value: 'plane', label: '位面 —— 单一大陆/世界（上限 8 阶）' },
  { value: 'universe', label: '宇宙 —— 单一宇宙/星系（上限 12 阶）' },
  { value: 'crystalSphere', label: '晶壁系 —— 晶壁包裹的宇宙群（上限 18 阶）' },
  { value: 'multiverse', label: '多元宇宙 —— 众多平行宇宙（上限 21 阶）' },
  { value: 'omniverse', label: '诸天万界 —— 包含一切领域（上限 23 阶）' },
]

const CIVILIZATION_OPTIONS: SelectOption[] = [
  { value: 'ai', label: '由AI决定' },
  { value: 'primitive', label: '原始时代 —— 狩猎采集，部落社会' },
  { value: 'ancient', label: '古代 —— 青铜铁器，城邦帝国' },
  { value: 'medieval', label: '中世纪 —— 封建制度，骑士教会' },
  { value: 'industrial', label: '工业时代 —— 蒸汽机器，资本扩张' },
  { value: 'modern', label: '现代 —— 科技社会，信息革命' },
  { value: 'space', label: '太空时代 —— 星际殖民，高等文明' },
]

const DIFFICULTY_OPTIONS: SelectOption[] = (
  ['normal', 'hard', 'nightmare', 'hell'] as DifficultyLevel[]
).map((d) => ({
  value: d,
  label: `${DIFFICULTY_LABELS[d]} —— ${DIFFICULTY_DESCRIPTIONS[d]}`,
}))

const POWER_SYSTEM_OPTIONS: SelectOption[] = [
  { value: 'ai', label: '由AI决定' },
  { value: 'cultivation', label: '修炼体系 —— 灵气/魔力/内功修炼' },
  { value: 'technology', label: '科技体系 —— 机械/基因/信息科技' },
  { value: 'magic', label: '魔法体系 —— 元素/咒语/仪式魔法' },
  { value: 'martial', label: '武学体系 —— 肉体/招式/意境武道' },
  { value: 'none', label: '无超自然力量 —— 纯现实世界' },
]

const ESSENCE_TAG_OPTIONS: SelectOption[] = [
  { value: 'ai', label: '由AI决定' },
  { value: 'cultivation', label: '仙侠' },
  { value: 'wuxia', label: '武侠' },
  { value: 'scifi', label: '科幻' },
  { value: 'post-apocalyptic', label: '末世' },
  { value: 'dark-fantasy', label: '黑暗奇幻' },
  { value: 'western-fantasy', label: '西方奇幻' },
  { value: 'modern', label: '现代' },
  { value: 'ancient-history', label: '历史古代' },
  { value: 'interstellar', label: '星际' },
  { value: 'cyberpunk', label: '赛博朋克' },
]

const WORLDVIEW_OPTIONS = [
  { key: 'auto', label: '自动' },
  { key: 'materialist', label: '唯物主义' },
  { key: 'idealist', label: '唯心主义' },
  { key: 'materialist_cultivation', label: '唯物修仙' },
  { key: 'idealist_cultivation', label: '唯心修仙' },
  { key: 'mixed', label: '混合' },
  { key: 'survival_horror', label: '生存恐怖' },
]

const SPATIAL_FORM_CEILING: Record<string, number> = {
  plane: 8,
  universe: 12,
  crystalSphere: 18,
  multiverse: 21,
  omniverse: 24,
}

const WORLD_AI_CONFIG_BASE = {
  model: 'deepseek-v4-flash',
  temperature: 0.8,
  responseFormat: { type: 'text' as const },
  reasoningEffort: 'disabled' as const,
  stream: false,
}

function buildWorldAiConfig(maxTokens: number, model?: string): AIModelConfig {
  return {
    ...WORLD_AI_CONFIG_BASE,
    maxTokens,
    model: model ?? WORLD_AI_CONFIG_BASE.model,
  }
}

const BUILD_LOCK_FIELDS = [
  { key: 'essenceTag', label: '世界观本质' },
  { key: 'powerSystemTag', label: '力量体系' },
  { key: 'spatialForm', label: '空间形态' },
  { key: 'civilizationStage', label: '文明阶段' },
] as const

export default function WorldBuildPage() {
  const router = useRouter()
  const _worldviewId = useGlobalStore((s) => s.worldviewId)
  const setWorldName = useGlobalStore((s) => s.setWorldName)
  const setWorldConfig = useWorldStore((s) => s.setWorldConfig)
  const setInitialized = useWorldStore((s) => s.setInitialized)
  const setWorldTags = useWorldStore((s) => s.setWorldTags)

  const [name, setName] = useState('')
  const [essenceTag, setEssenceTag] = useState('ai')
  const [powerSystemTag, setPowerSystemTag] = useState('ai')
  const [worldType, setWorldType] = useState('auto')
  const [spatialForm, setSpatialForm] = useState('ai')
  const [powerCeiling, setPowerCeiling] = useState(8)
  const [civilizationStage, setCivilizationStage] = useState('ai')
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('normal')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAIGenerating, setIsAIGenerating] = useState(false)
  const [aiGeneratedTags, setAiGeneratedTags] = useState<string[]>([])
  const [worldDescription, setWorldDescription] = useState('')
  const [coherenceLocks, setCoherenceLocks] = useState<Record<string, boolean>>({})
  const { requestCoherenceResolve, conflictModal } = useWorldCoherenceConfirm()

  const maxCeiling = SPATIAL_FORM_CEILING[spatialForm] ?? 24

  const ceilingOptions: SelectOption[] = useMemo(() => {
    return Array.from({ length: maxCeiling }, (_, i) => ({
      value: String(i + 1),
      label: `第 ${i + 1} 阶`,
    }))
  }, [maxCeiling])

  const handleSpatialFormChange = (value: string) => {
    setSpatialForm(value)
    if (value === 'ai') return
    const newMax = SPATIAL_FORM_CEILING[value] ?? 24
    if (powerCeiling > newMax) {
      setPowerCeiling(newMax)
    }
  }

  const buildDraftConfig = (): WorldConfig => {
    const resolvedEssence = essenceTag === 'ai' ? 'cultivation' : essenceTag
    const resolvedPower = powerSystemTag === 'ai' ? 'cultivation' : powerSystemTag
    const resolvedSpatial = spatialForm === 'ai' ? 'plane' : spatialForm
    const resolvedCiv = civilizationStage === 'ai' ? 'medieval' : civilizationStage
    const resolvedType = worldType === 'auto' ? 'idealist' : worldType
    const desc = worldDescription.trim()
      || `${resolvedEssence} 世界观 · ${resolvedSpatial} 空间形态 · ${resolvedPower} 力量体系 · ${resolvedCiv} 文明阶段`

    return {
      name: name.trim(),
      spatialForm: resolvedSpatial,
      essenceTag: resolvedEssence,
      powerSystemTag: resolvedPower,
      powerCeiling: Number(powerCeiling),
      civilizationStage: resolvedCiv,
      difficulty,
      description: desc,
      worldType: resolvedType as WorldConfig['worldType'],
      _aiFlags: {
        essenceTag: essenceTag === 'ai',
        powerSystemTag: powerSystemTag === 'ai',
        spatialForm: spatialForm === 'ai',
        civilizationStage: civilizationStage === 'ai',
        worldType: worldType === 'auto',
      },
      _coherenceLocks: buildCoherenceLocksFromUi(coherenceLocks),
    }
  }

  const fillPrompt = (template: string, config: WorldConfig): string => {
    const vars = buildWorldInitPromptVars(config)
    let result = template
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
    return result
  }
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!name.trim()) newErrors.name = '请输入世界名称'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * W02~W06 AI 生成 —— 调用 AI 生成世界标签（W02 详细参数由 init Pipeline 校准步合并生成）
   */
  const handleAIGenerate = async () => {
    if (!name.trim() || !essenceTag || !powerSystemTag) {
      setErrors({ ...errors, ai: '请先填写世界名称、世界观本质和力量体系（不能为"由AI决定"）' })
      return
    }
    setErrors((prev) => { const n = { ...prev }; delete n.ai; return n })
    setIsAIGenerating(true)
    setAiGeneratedTags([])

    try {
      const draft = buildDraftConfig()
      const budgets = buildWorldInitPipelineBudgets(draft.description.length)
      const { customKey, customUrl, provider, customModel: cm } = useSettingsStore.getState()
      const model = cm || WORLD_AI_CONFIG_BASE.model
      const aiOpts = { providerId: provider, customBaseUrl: customUrl || undefined, customModel: model }
      const aiConfig = buildWorldAiConfig(budgets.tags, model)
      const filledTags = fillPrompt(worldTagsPrompt.userPromptTemplate, draft)
      const tagKv = prepareWorldInitUserPrompt(filledTags, 'tag')
      const tagSessionId = buildWorldInitKvSessionId(useWorldStore.getState().worldCode, 'tag')
      const tagAiConfig = configForWorldInitSubPool(aiConfig, 'tag')
      const tagsResponse = await callAI(
        worldTagsPrompt.systemPrompt,
        tagKv.userPrompt,
        {
          config: tagAiConfig,
          pool: 'worldInit',
          sessionId: tagSessionId,
          userSegments: tagKv.userSegments,
          jsonMode: true,
          overrideMaxTokens: budgets.tags,
          apiKey: customKey || undefined,
          ...aiOpts,
          logContext: {
            trigger: 'world-build/handleAIGenerate:tags',
            pool: 'worldInit',
            model,
            sessionId: tagSessionId,
          },
          logMeta: {
            kvSubPool: 'tag',
            stablePrefixChars: tagKv.stablePrefixChars,
            userId: `winit-${tagSessionId}`,
            jsonMode: true,
          },
        },
      )

      if (tagsResponse && tagsResponse.trim() !== '' && tagsResponse.trim() !== '无') {
        try {
          const filtered = filterCoherentWorldTags(parseWorldTagsResponse(tagsResponse), {
            worldDescription: draft.description,
            worldType: draft.worldType,
          })
          setAiGeneratedTags(filtered)
        } catch {
          // 解析失败，忽略标签
        }
      }
    } catch {
      // AI 整体失败，不影响用户手动配置
    } finally {
      setIsAIGenerating(false)
    }
  }

  const finalizeWorldBuild = async (config: WorldConfig) => {
    const worldInit = new WorldInitSystem()
    const snapshot = worldInit.initialize(config)

    setWorldConfig(config)
    setInitialized(true)
    setWorldTags([])
    if (aiGeneratedTags.length > 0) {
      setWorldTags(filterCoherentWorldTags(aiGeneratedTags, {
        worldDescription: config.description,
        worldType: config.worldType,
      }))
    }

    if (typeof window !== 'undefined') {
      const isPartialAi = essenceTag === 'ai' || powerSystemTag === 'ai' || spatialForm === 'ai'
        || civilizationStage === 'ai' || worldType === 'auto'
      if (isPartialAi) {
        try {
          await generateFullWorldData(config)
        } catch { /* AI 失败降级 */ }
      }
    }

    const formattedTags = formatWorldTagsText(snapshot.tags)

    orchestrator.setContext(
      {
        name: config.name,
        description: config.description,
        era: config.civilizationStage,
        config: { ...config as unknown as Record<string, unknown>, _worldTagsText: formattedTags },
      },
      { name: '', age: 0, gender: '未设定', background: '', attributes: {} },
    )

    if (typeof window !== 'undefined') {
      try {
        configStore.set('mod-power-system', 'power-ceiling', String(config.powerCeiling))
      } catch { /* 存储不可用 */ }
    }

    setIsGenerating(false)
    router.push('/new-game/character-create')
  }

  const handleGenerate = () => {
    if (!validate()) return
    setIsGenerating(true)
    setWorldName(name.trim())
    const draft = buildDraftConfig()
    requestCoherenceResolve(draft, (config) => {
      void finalizeWorldBuild(config)
    }, () => setIsGenerating(false))
  }

/** 后台 AI 生成标签（详细参数由 init Pipeline 校准步负责） */
async function generateFullWorldData(_config: WorldConfig) {
  const vars = buildWorldInitPromptVars(_config)
  const fill = (template: string) => {
    let result = template
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
    return result
  }

  const { customKey: gk, customUrl: cu, provider: pv, customModel: cm } = useSettingsStore.getState()
  const mdl = cm || WORLD_AI_CONFIG_BASE.model
  const budgets = buildWorldInitPipelineBudgets(_config.description.length)
  const aiOpts2 = { providerId: pv, customBaseUrl: cu || undefined, customModel: mdl }
  const aiConfig = buildWorldAiConfig(budgets.tags, mdl)
  const filledTags = fill(worldTagsPrompt.userPromptTemplate)
  const tagKv = prepareWorldInitUserPrompt(filledTags, 'tag')
  const tagSessionId = buildWorldInitKvSessionId(useWorldStore.getState().worldCode, 'tag')
  const tagAiConfig = configForWorldInitSubPool(aiConfig, 'tag')
  await callAI(
    worldTagsPrompt.systemPrompt,
    tagKv.userPrompt,
    {
      config: tagAiConfig,
      pool: 'worldInit',
      sessionId: tagSessionId,
      userSegments: tagKv.userSegments,
      jsonMode: true,
      overrideMaxTokens: budgets.tags,
      apiKey: gk || undefined,
      ...aiOpts2,
      logContext: {
        trigger: 'world-build/generateFullWorldData:tags',
        pool: 'worldInit',
        model: mdl,
        sessionId: tagSessionId,
      },
      logMeta: {
        kvSubPool: 'tag',
        stablePrefixChars: tagKv.stablePrefixChars,
        userId: `winit-${tagSessionId}`,
        jsonMode: true,
      },
    },
  )
}

  return (
    <PageScroll>
      {conflictModal}
      <div className="max-w-[800px] w-full mx-auto">
      <header className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight mb-2 text-[var(--color-text-primary)]">
          配置世界参数
        </h1>
        <p className="text-base text-[var(--color-text-secondary)]">
          定义世界的基本法则与形态
        </p>
      </header>

      <div className="space-y-6">
        <Input
          label="世界名称"
          placeholder="为你的世界起一个名字"
          value={name}
          onChange={setName}
          error={errors.name}
          required
          autoFocus
        />

        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
            世界描述
            <span className="text-[var(--color-text-tertiary)] font-normal ml-2">
              （优先于标签；史前/地猿等设定请在此说明）
            </span>
          </label>
          <textarea
            className="w-full min-h-[88px] px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-primary)] resize-y"
            value={worldDescription}
            onChange={(e) => setWorldDescription(e.target.value)}
            placeholder="例：新近纪东非大裂谷，地猿种群在稀树草原觅食…"
          />
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">标签锁定</div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            勾选后，世界观一致性校正不会自动覆盖该字段
          </p>
          <div className="flex flex-wrap gap-4">
            {BUILD_LOCK_FIELDS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={!!coherenceLocks[key]}
                  onChange={() => setCoherenceLocks((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <Select
          label="世界观本质"
          placeholder="选择世界观本质（或由AI决定）"
          value={essenceTag}
          onChange={setEssenceTag}
          options={ESSENCE_TAG_OPTIONS}
          error={errors.essenceTag}
        />

        <Select
          label="力量体系"
          placeholder="选择世界的核心力量体系（或由AI决定）"
          value={powerSystemTag}
          onChange={setPowerSystemTag}
          options={POWER_SYSTEM_OPTIONS}
          error={errors.powerSystemTag}
        />

        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-3">世界观类型</label>
          <div className="flex flex-wrap gap-2">
            {WORLDVIEW_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setWorldType(opt.key)}
                className="px-4 py-2 text-sm rounded-lg transition-all duration-200"
                style={{
                  border: worldType === opt.key ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: worldType === opt.key ? 'var(--color-primary)' + '1a' : 'var(--color-bg)',
                  color: worldType === opt.key ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  fontWeight: worldType === opt.key ? 600 : 400,
                  cursor: 'pointer',
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        <Select
          label="空间形态"
          value={spatialForm}
          onChange={handleSpatialFormChange}
          options={SPATIAL_FORM_OPTIONS}
        />

        <Select
          label={`力量上限（当前最大 ${maxCeiling} 阶）`}
          value={String(powerCeiling)}
          onChange={(v) => setPowerCeiling(Number(v))}
          options={ceilingOptions}
        />

        <Select
          label="文明阶段"
          value={civilizationStage}
          onChange={setCivilizationStage}
          options={CIVILIZATION_OPTIONS}
        />

        <Select
          label="游戏难度"
          value={difficulty}
          onChange={(v) => setDifficulty(v as DifficultyLevel)}
          options={DIFFICULTY_OPTIONS}
        />

        {/* AI 生成标签展示 */}
        {aiGeneratedTags.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <div className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
              AI 生成标签
            </div>
            <div className="flex flex-wrap gap-2">
              {aiGeneratedTags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AI 生成按钮 */}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleAIGenerate}
            loading={isAIGenerating}
            disabled={isAIGenerating || isGenerating}
          >
            ✨ AI 生成世界详情
          </Button>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            使用 AI 自动生成世界标签和参数（需填写名称、世界观、力量体系）
          </span>
        </div>

        {errors.ai && (
          <p className="text-sm text-[var(--color-error)]">{errors.ai}</p>
        )}
      </div>

      <div className="mt-10 flex justify-end">
        <Button onClick={handleGenerate} size="lg" loading={isGenerating}>
          生成世界
        </Button>
      </div>
      </div>
    </PageScroll>
  )
}
