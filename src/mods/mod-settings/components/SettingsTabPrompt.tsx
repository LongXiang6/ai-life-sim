'use client'

/**
 * @module SettingsTabPrompt.tsx
 * @description Prompt 调试面板 Tab —— 实时预览 System/User Prompt、变量注入、Token 预算统计
 * @mod mod-settings
 */

import { useState, useMemo, useCallback } from 'react'
import { clamp } from '@/core/shared'
import { estimateTextTokens } from '@/foundation'
import { narrativePrompt, buildWordCountInstruction, buildStyleInstruction } from '@/mods/mod-engine'
import { useSettingsStore } from '../store'

import styles from './SettingsTabPrompt.module.css'
import { JsonHighlight } from './JsonHighlight'

/** 预填充的模拟变量值，用于 Prompt 预览 */
const MOCK_VARIABLES: Record<string, string> = {
  worldRules: '修炼可依赖境界、资源与机缘；只采用世界设定中已成立的体系和术语。',
  modWorldRules: '已启用的规则只允许叙事修改 character-base、lifespan、luck、morality 提供的公开字段。',
  worldTagsText: '仙侠修真世界，宗门林立，灵气充沛',
  calibrationSummary: '力量成长受灵气、体魄与功法共同约束；普通外门弟子无法越阶对抗筑基修士。',
  worldSetting: '世界观：仙侠修真世界，灵气充沛，宗门林立。世界本质：cultivation。当前时代：上古时代，神魔并存。',
  powerCeilingPresets: '当前可见阶位：炼气、筑基、金丹；更高阶位仅作为远景存在。角色目前处于炼气三层。',
  worldCustomizeText: '玩家自定义：宗门生活应强调日常修炼、任务资源与同门关系，不让奇遇替代角色努力。',
  creationProtectionText: '「青萍引气诀」由角色亲自整理开创，不得改写为遗迹、古人传承或他人遗留。',
  subsystemGuideText: 'character-base：仅提交体魄、心智、悟性、魅力的明确变化；lifespan、luck、morality 仅在剧情产生对应事实时提交。',
  narrativeStyle: '',
  narrativeToneHint: '写实基调；保持仙侠语境，但避免无因的宏大升格。',
  character: '角色：李逍遥，16岁，体魄6 心智7 悟性8 魅力5。当前身份：青云剑宗外门弟子。',
  talents: '普通命格：坚韧、心细、灵感敏锐。已装备神话命格「薪火自明」：困境中的领悟必须来自本人行动与代价。',
  memorySummary: '16岁拜入青云剑宗外门，被评价"悟性尚可，体魄不足"。勤修三个月勉强达炼气三层。与赵灵儿建立友谊。',
  coreMemory: '入门考核时曾因体力不支落后，但坚持完成全程，因此格外在意靠自身补足体魄短板。',
  plotStructureText: '当前阶段：rising_action。角色正面临修炼瓶颈，需通过任务和历练提升实力。',
  foreshadowingText: '伏笔 fs-017：药圃管事近期反复核对铁线草损耗，原因尚未揭晓。',
  wordCountInstruction: '',
  currentTime: '青云历127年4月18日，本轮结束时角色16岁。',
  timeBridgeSummary: '距上一叙事节点过去七日；期间角色完成了三次药浴，并继续承担杂役。',
  causalChainHint: '体魄瓶颈→尝试药浴强体→药材短缺→接取铁线草采集任务。',
  timeGuideText: '以七日跨度组织镜头：任务触发、采集受阻、返回宗门后的可见后果。',
  subsystemSummaries: '基础属性：体魄6、心智7、悟性8、魅力5。寿命：当前16岁，预计寿限100岁。气运：平稳。善恶：中庸。',
  systemChangeSummary: '修炼进度停滞，体魄不足成为瓶颈。接取采集铁线草任务。',
  eventInjectionText: '采集途中遇到暴雨冲毁山道；事件应形成具体阻力，但不强制触发命运分叉。',
  narrativeHistory: '上轮：李逍遥在后山打坐修炼两个周天，灵气汇入丹田却总是溃散。他意识到体魄不足是瓶颈，决定用药浴强体。\n前轮：李逍遥拜入青云剑宗外门，被分配到杂役房。他每天天不亮就去后山吐纳。',
  narrativeGuidanceText: '围绕采集任务写一个完整事件；重点展示角色如何应对阻力，以及行动对修炼或关系造成的后果。',
  userInstruction: '生成第17轮的叙事。角色16岁，炼气三层。本轮应展示角色为克服体魄瓶颈所做的努力。',
}

/** 变量中文说明 */
const VARIABLE_LABELS: Record<string, string> = {
  worldRules: '世界规则',
  modWorldRules: 'MOD 世界规则',
  worldTagsText: '世界标签',
  calibrationSummary: '世界校准摘要',
  worldSetting: '世界设定',
  powerCeilingPresets: '力量体系上限',
  worldCustomizeText: '玩家自定义设定',
  creationProtectionText: '原创内容保护',
  subsystemGuideText: '活跃子系统变更指南',
  narrativeStyle: '叙事风格',
  narrativeToneHint: '叙事基调',
  character: '角色信息',
  talents: '命格天赋',
  memorySummary: '记忆档案',
  coreMemory: '核心记忆',
  plotStructureText: '剧情阶段',
  foreshadowingText: '待触发伏笔',
  wordCountInstruction: '字数约束',
  currentTime: '当前时间',
  timeBridgeSummary: '时间桥摘要',
  causalChainHint: '因果链提示',
  timeGuideText: '时间步长视角',
  eventInjectionText: '事件注入',
  subsystemSummaries: '当前状态',
  systemChangeSummary: '最近变化',
  narrativeHistory: '历史叙事',
  narrativeGuidanceText: '叙事引导',
  userInstruction: '本轮指令',
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

  // 生成模拟 User Prompt（逐项按模板声明替换，避免模板演进后静默残留占位符）
  const promptPreview = useMemo(() => {
    const vars: Record<string, string> = {
      ...MOCK_VARIABLES,
      wordCountInstruction: buildWordCountInstruction(wordCountTarget),
      narrativeStyle: buildStyleInstruction(narrativeStyle),
    }
    const missingVariables: string[] = []
    let text = narrativePrompt.userPromptTemplate

    for (const variable of narrativePrompt.variables) {
      const value = vars[variable]
      if (value === undefined) missingVariables.push(variable)
      text = text.replaceAll(
        `{{${variable}}}`,
        JSON.stringify(value ?? `[预览示例缺少变量：${variable}]`),
      )
    }

    const unresolvedVariables = Array.from(
      text.matchAll(/\{\{([^{}]+)\}\}/g),
      (match) => match[1],
    )

    return { text, missingVariables, unresolvedVariables }
  }, [wordCountTarget, narrativeStyle])

  // 输入 Token 统计；输出额度与消息协议开销不属于这两个文本本身。
  const stats = useMemo(() => {
    const systemTokens = estimateTextTokens(narrativePrompt.systemPrompt)
    const userTokens = estimateTextTokens(promptPreview.text)
    const inputTokens = systemTokens + userTokens

    const modelName = customModel || 'deepseek-v4-flash'
    let contextLimit = MODEL_CONTEXTS.default
    for (const [key, limit] of Object.entries(MODEL_CONTEXTS)) {
      if (modelName.includes(key)) { contextLimit = limit; break }
    }

    const usagePct = Math.round((inputTokens / contextLimit) * 100)
    const remainingInputCapacity = Math.max(0, contextLimit - inputTokens)

    return { systemTokens, userTokens, inputTokens, contextLimit, usagePct, remainingInputCapacity, modelName }
  }, [promptPreview.text, customModel])

  const getProgressColor = useCallback((pct: number) => {
    if (pct > 80) return styles.progressFillDanger
    if (pct > 50) return styles.progressFillWarn
    return styles.progressFill
  }, [])

  const displayText = activeView === 'system' ? narrativePrompt.systemPrompt : promptPreview.text
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
            User Prompt 模板中包含以下变量，运行时由引擎填充。当前示例覆盖 {narrativePrompt.variables.length - promptPreview.missingVariables.length}/{narrativePrompt.variables.length} 项
            {promptPreview.unresolvedVariables.length === 0 ? '，无未替换占位符。' : `，仍有 ${promptPreview.unresolvedVariables.length} 个未替换占位符。`}
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
              <div className={styles.statSub}>占输入 {(stats.systemTokens / Math.max(1, stats.inputTokens) * 100).toFixed(0)}%</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.userTokens.toLocaleString()}</div>
              <div className={styles.statLabel}>User Token</div>
              <div className={styles.statSub}>占输入 {(stats.userTokens / Math.max(1, stats.inputTokens) * 100).toFixed(0)}%</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.inputTokens.toLocaleString()}</div>
              <div className={styles.statLabel}>输入合计</div>
              <div className={styles.statSub}>输入后余量 {stats.remainingInputCapacity.toLocaleString()}</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className={styles.contextInfo}>
              <span>模型: {stats.modelName}</span>
              <span>上下文窗口: {stats.contextLimit.toLocaleString()} tokens</span>
              <span>输入占用 {stats.usagePct}%</span>
            </div>
            <div className={styles.progressBar} style={{ marginTop: 8, height: 8 }}>
              <div
                className={`${styles.progressFill} ${getProgressColor(stats.usagePct)}`}
                style={{ width: `${clamp(stats.usagePct, 0, 100)}%`, height: 8 }}
              />
            </div>
          </div>

          <p className={styles.descText} style={{ marginTop: 10 }}>
            此处按项目统一启发式估算当前 System 与示例 User 输入文本，不包含输出额度、消息协议或服务商附加开销。实际输入长度与 token 数以运行上下文和服务商分词器为准。
          </p>
        </div>
      </div>
    </div>
  )
}
