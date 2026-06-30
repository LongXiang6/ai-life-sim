'use client'

/**
 * @module SettingsTabPrompt.tsx
 * @description Prompt 调试面板 Tab —— 实时预览 System/User Prompt、变量注入、Token 预算统计
 * @mod mod-settings
 */

import { useState, useMemo, useCallback } from 'react'
import { estimateTokens } from '@/mods/mod-engine'
import { SYSTEM_PROMPT, narrativePrompt, buildWordCountInstruction, buildStyleInstruction } from '@/mods/mod-engine'
import { useSettingsStore } from '../store'

import styles from './SettingsTabPrompt.module.css'
import { JsonHighlight } from './JsonHighlight'

/** 预填充的模拟变量值，用于 Prompt 预览 */
const MOCK_VARIABLES: Record<string, string> = {
  worldRules: '修炼境界分为炼气→筑基→金丹→元婴→化神→渡劫→大乘。突破需要机缘和资源。灵气浓度影响修炼速度。可出现秘境、灵兽、丹药、法器。叙事应有古风韵味，使用"道友""灵根""丹田"等术语。',
  modWorldRules: '',
  worldTagsText: '仙侠修真世界，宗门林立，灵气充沛',
  worldSetting: '世界观：仙侠修真世界，灵气充沛，宗门林立。世界本质：cultivation。当前时代：上古时代，神魔并存。',
  worldCustomizeText: '',
  subsystemFields: 'cultivation, lifespan, health, reputation, economy, relationship, skill',
  narrativeStyle: '',
  character: '角色：李逍遥，16岁，体魄6 心智7 悟性8 魅力5 出身4。当前境界：炼气三层。所在宗门：青云剑宗外门。',
  memorySummary: '16岁拜入青云剑宗外门，被评价"悟性尚可，体魄不足"。勤修三个月勉强达炼气三层。与赵灵儿建立友谊。',
  coreMemory: '',
  plotStructureText: '当前阶段：rising_action。角色正面临修炼瓶颈，需通过任务和历练提升实力。',
  foreshadowingText: '',
  wordCountInstruction: '',
  subsystemSummaries: '修炼：炼气三层（进度45%），瓶颈体魄不足。健康：精力充沛。声望：青云剑宗外门弟子，声望低微。经济：灵石50枚。关系：赵灵儿（好友/好感度60）。',
  systemChangeSummary: '修炼进度停滞，体魄不足成为瓶颈。接取采集铁线草任务。',
  eventInjectionText: '',
  narrativeHistory: '上轮：李逍遥在后山打坐修炼两个周天，灵气汇入丹田却总是溃散。他意识到体魄不足是瓶颈，决定用药浴强体。\n前轮：李逍遥拜入青云剑宗外门，被分配到杂役房。他每天天不亮就去后山吐纳。',
  userInstruction: '生成第17轮的叙事。角色16岁，炼气三层。本轮应展示角色为克服体魄瓶颈所做的努力。',
}

/** 变量中文说明 */
const VARIABLE_LABELS: Record<string, string> = {
  worldSetting: '世界设定',
  worldRules: '世界规则',
  character: '角色信息',
  memorySummary: '记忆档案',
  subsystemSummaries: '当前状态',
  systemChangeSummary: '最近变化',
  eventInjectionText: '事件注入',
  narrativeHistory: '历史叙事',
  narrativeStyle: '叙事风格',
  userInstruction: '本轮指令',
  wordCountInstruction: '字数约束',
}

/** 模型上下文窗口（估算值） */
const MODEL_CONTEXTS: Record<string, number> = {
  'deepseek-v4-flash': 128_000,
  'deepseek-v4-pro': 128_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'claude-3.5-sonnet': 200_000,
  default: 128_000,
}

export function SettingsTabPrompt() {
  const { customModel, wordCountTarget, narrativeStyle } = useSettingsStore()
  const [activeView, setActiveView] = useState<'system' | 'user'>('system')

  // 生成模拟 User Prompt（JSON 格式，占位符替换为 JSON.stringify 转义值）
  const mockUserPrompt = useMemo(() => {
    const vars = { ...MOCK_VARIABLES, wordCountInstruction: buildWordCountInstruction(wordCountTarget), narrativeStyle: buildStyleInstruction(narrativeStyle) }
    let text = narrativePrompt.userPromptTemplate
    for (const [key, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), JSON.stringify(value))
    }
    return text
  }, [wordCountTarget, narrativeStyle])

  // Token 统计
  const stats = useMemo(() => {
    const systemTokens = estimateTokens(SYSTEM_PROMPT)
    const userTokens = estimateTokens(mockUserPrompt)
    const totalTokens = systemTokens + userTokens

    const modelName = customModel || 'deepseek-v4-flash'
    let contextLimit = MODEL_CONTEXTS.default
    for (const [key, limit] of Object.entries(MODEL_CONTEXTS)) {
      if (modelName.includes(key)) { contextLimit = limit; break }
    }

    const usagePct = Math.round((totalTokens / contextLimit) * 100)
    const remainingTokens = contextLimit - totalTokens

    return { systemTokens, userTokens, totalTokens, contextLimit, usagePct, remainingTokens, modelName }
  }, [mockUserPrompt, customModel])

  const getProgressColor = useCallback((pct: number) => {
    if (pct > 80) return styles.progressFillDanger
    if (pct > 50) return styles.progressFillWarn
    return styles.progressFill
  }, [])

  const displayText = activeView === 'system' ? SYSTEM_PROMPT : mockUserPrompt
  const displayLabel = activeView === 'system' ? 'System Prompt' : 'User Prompt（模拟填充）'

  return (
    <div className={styles.container}>
      {/* ===== Prompt 预览 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Prompt 预览</div>
        <div className={styles.sectionBody}>
          <div className={styles.previewToggles}>
            <button
              className={`${styles.previewToggle} ${activeView === 'system' ? styles.previewToggleActive : ''}`}
              onClick={() => setActiveView('system')}
            >
              System Prompt
            </button>
            <button
              className={`${styles.previewToggle} ${activeView === 'user' ? styles.previewToggleActive : ''}`}
              onClick={() => setActiveView('user')}
            >
              User Prompt
            </button>
          </div>
          <div className={styles.promptPreview}>
            <span className={activeView === 'system' ? styles.systemLabel : styles.userLabel}>
              {displayLabel}
            </span>
            <JsonHighlight json={displayText} />
          </div>
        </div>
      </div>

      {/* ===== 变量清单 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Prompt 变量清单</div>
        <div className={styles.sectionBody}>
          <p className={styles.descText} style={{ marginBottom: 10 }}>
            User Prompt 模板中包含以下变量，运行时由引擎填充。当前预览使用模拟数据。
          </p>
          <div className={styles.varList}>
            {narrativePrompt.variables.map((v) => (
              <span key={v} className={styles.varTag} title={VARIABLE_LABELS[v] || v}>
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Token 预算 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Token 预算统计</div>
        <div className={styles.sectionBody}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.systemTokens.toLocaleString()}</div>
              <div className={styles.statLabel}>System Token</div>
              <div className={styles.statSub}>占 {(stats.systemTokens / Math.max(1, stats.totalTokens) * 100).toFixed(0)}%</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.userTokens.toLocaleString()}</div>
              <div className={styles.statLabel}>User Token</div>
              <div className={styles.statSub}>占 {(stats.userTokens / Math.max(1, stats.totalTokens) * 100).toFixed(0)}%</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.totalTokens.toLocaleString()}</div>
              <div className={styles.statLabel}>总计 Token</div>
              <div className={styles.statSub}>剩余 {stats.remainingTokens.toLocaleString()}</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className={styles.contextInfo}>
              <span>模型: {stats.modelName}</span>
              <span>上下文窗口: {stats.contextLimit.toLocaleString()} tokens</span>
              <span>{stats.usagePct}% 已用</span>
            </div>
            <div className={styles.progressBar} style={{ marginTop: 8, height: 8 }}>
              <div
                className={`${styles.progressFill} ${getProgressColor(stats.usagePct)}`}
                style={{ width: `${Math.min(100, stats.usagePct)}%`, height: 8 }}
              />
            </div>
          </div>

          <p className={styles.descText} style={{ marginTop: 10 }}>
            Token 估算基于中文每字约0.67 token、英文每词约0.25 token 的粗略算法。实际 token 数以 AI 服务商的分词器为准。模拟变量值可能比实际运行时更短。
          </p>
        </div>
      </div>
    </div>
  )
}
