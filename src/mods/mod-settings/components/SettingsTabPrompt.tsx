'use client'

/**
 * @module SettingsTabPrompt.tsx
 * @description Prompt 调试面板 Tab —— 实时预览 System/User Prompt、变量注入、Token 预算统计
 * @mod mod-settings
 */

import { useState, useMemo, useCallback } from 'react'
import { buildSegmentedPrompt } from '@/core'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import { clamp } from '@/core/shared'
import { estimateTextTokens, type PromptContext } from '@/foundation'
import { narrativePrompt, buildWordCountInstruction, buildStyleInstruction } from '@/mods/mod-engine'
import { useSettingsStore } from '../store'

import styles from './SettingsTabPrompt.module.css'
import { JsonHighlight } from './JsonHighlight'

const MOCK_PROMPT_CONTEXT: PromptContext = {
  worldNarrativeView: { 世界名称: '青云界', 世界描述: '灵气充沛、宗门林立的修炼世界。', 当前纪年: '青云历127年' },
  characterProfileView: { 姓名: '李逍遥', 性别: '男', 背景: '青云剑宗外门弟子' },
  characterStatusView: { 年龄: 16 },
  subsystemSummaries: ['【基础属性】体魄6、心智7、悟性8、魅力5', '【寿命】最大寿命100岁', '【气运】平稳', '【道德】中庸'],
  narrativeHistory: [
    '你在后山打坐两个周天，灵气汇入丹田却总是溃散。你意识到体魄不足是瓶颈，决定用药浴强体。',
    '你拜入青云剑宗外门，被分配到杂役房，每天天不亮便去后山吐纳。',
  ],
  worldRules: '修炼依赖境界、资源与机缘；只采用世界设定中已成立的体系和术语。',
  modWorldRules: '已启用模组只提供当前状态与公开规则，不得越权改写其他系统。',
  worldTagsText: '社会：宗门主导；环境：灵气充沛；叙事约束：能力必须有功法、资源与代价。',
  calibrationSummary: '力量成长受灵气、体魄与功法共同约束。',
  powerCeilingPresets: '当前可见阶位：炼气、筑基、金丹；更高层级只作为远景边界。',
  worldCustomizeText: '宗门生活强调修炼、任务资源与同门关系，不让奇遇替代角色努力。',
  creationProtectionText: '「青萍引气诀」由你亲自整理开创，不得改写为他人传承。',
  subsystemGuideText: '本轮可变更系统仅限：基础属性、寿命、气运、道德。',
  narrativeToneHint: '写实基调；保持修炼语境，避免无因的宏大升格。',
  talents: '【普通命格·每轮遵守】坚韧：困境中的进展必须来自行动与代价。',
  longTermMemory: '【中距记忆】你拜入青云剑宗后一直试图补足体魄短板。',
  coreMemory: '入门考核时你曾因体力不支落后，但坚持完成全程。',
  relevantMemory: '【相关往事】药圃管事曾提醒铁线草近期损耗异常。',
  recentNarrativeMemory: '【近期完整经历】你发现体魄不足导致灵气反复溃散，决定寻找药浴材料。',
  plotStructureText: '【当前情节阶段】上升阶段；修炼瓶颈正在转化为具体任务。',
  foreshadowingText: '【本轮可回收伏笔】编号=伏笔_017：药圃管事反复核对铁线草损耗。',
  currentTime: '青云历127年4月18日',
  timeBridgeSummary: '距上一叙事节点过去七日，你继续承担杂役并准备药浴。',
  causalChainHint: '【已触发因果】此前借用药材的承诺到了需要兑现的节点。',
  timeGuideText: '以七日跨度组织一个代表性现场，不写成逐日清单。',
  systemChangeSummary: '修炼进度停滞，体魄不足成为明确瓶颈。',
  eventInjectionText: '暴雨冲毁采集铁线草的山道，形成了本轮具体阻力。',
  narrativeGuidanceText: '围绕采集任务写一个完整事件，展示行动、阻力与可见后果。',
  userInstruction: '本轮展示你为克服体魄瓶颈付出的具体努力。',
}

const PROMPT_LAYER_LABELS = ['全局信息', '记忆', '本轮引导'] as const

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

  // 使用真实编译器生成 AI 实际接收的三层用户消息，而不是开发者视角模板。
  const promptPreview = useMemo(() => {
    const context: PromptContext = {
      ...MOCK_PROMPT_CONTEXT,
      wordCountInstruction: buildWordCountInstruction(wordCountTarget),
      narrativeStyle: buildStyleInstruction(narrativeStyle),
    }
    const segments = buildSegmentedPrompt(narrativePrompt, context)
    return {
      text: segments.userSegments?.join('\n\n') ?? segments.full,
      strategy: segments.strategy,
      messageCount: segments.userMessageCount ?? 1,
    }
  }, [wordCountTarget, narrativeStyle])

  // 输入 Token 统计；输出额度与消息协议开销不属于这两个文本本身。
  const stats = useMemo(() => {
    const systemTokens = estimateTextTokens(narrativePrompt.systemPrompt)
    const userTokens = estimateTextTokens(promptPreview.text)
    const inputTokens = systemTokens + userTokens

    const modelName = customModel || DEFAULT_AI_MODEL
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
  const displayLabel = activeView === 'system' ? '系统提示词' : '用户消息（模拟装配）'

  return (
    <div className={styles.container}>
      {/* ===== Prompt 预览 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>提示词预览</div>
        <div className={styles.sectionBody}>
          <div className={styles.previewToggles}>
            <button
              className={`${styles.previewToggle} ${activeView === 'system' ? styles.previewToggleActive : ''}`}
              onClick={() => setActiveView('system')}
            >
              系统提示词
            </button>
            <button
              className={`${styles.previewToggle} ${activeView === 'user' ? styles.previewToggleActive : ''}`}
              onClick={() => setActiveView('user')}
            >
              用户消息
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

      {/* ===== 消息层清单 ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>消息层清单</div>
        <div className={styles.sectionBody}>
          <p className={styles.descText} style={{ marginBottom: 10 }}>
            当前策略为 {promptPreview.strategy}，共发送 {promptPreview.messageCount} 条用户消息；内容按更新频率从慢到快排列。
          </p>
          <div className={styles.varList}>
            {PROMPT_LAYER_LABELS.map((label) => (
              <span key={label} className={styles.varTag} title={label}>
                {label}
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
