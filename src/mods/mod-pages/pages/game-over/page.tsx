/**
 * @file page.tsx
 * @description 游戏结束页面 —— 五维评分雷达图 + 人生总结（基于叙事历史综合评估）
 * @mod mod-pages
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useCharacterStore } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { useEngineStore } from '@/mods/mod-engine'

import { useGlobalStore } from '@/core'
// 统一使用 shared/ 的 clamp 替代内联 Math.max/Math.min
import { clamp } from '@/core/shared'

import { Button, Card, RadarChart, PageScroll } from '@/mods/mod-ui'

import type { RadarDimension } from '@/mods/mod-ui'

import styles from './GameOver.module.css'

// ============================================================
// 叙事关键词评分辅助
// ============================================================

/** 成就关键词列表（体魄相关） */
const PHYSIQUE_ACHIEVEMENTS = ['成为宗主', '获得神兵', '战斗胜利', '击败', '突破境界', '肉身成圣', '武道巅峰']
/** 成就关键词列表（心智相关） */
const MIND_ACHIEVEMENTS = ['学富五车', '谋略', '计谋', '策反', '拜师学艺', '悟道', '开创功法', '智取']
/** 成就关键词列表（魅力/社交相关） */
const _CHARISMA_ACHIEVEMENTS = ['结交', '红颜', '知己', '联盟', '信任', '仰慕', '追随', '挚友']
/** 成就关键词列表（财富/资源相关） */
const _WEALTH_ACHIEVEMENTS = ['获得宝藏', '继承', '奇遇', '发现矿脉', '商会', '富有', '宝藏', '秘籍']
/** 成就关键词列表（气运/奇遇相关） */
const LUCK_ACHIEVEMENTS = ['奇遇', '机缘', '天命', '逆天', '因果', '造化', '机缘巧合', '天命所归']

/** 从叙事历史中统计关键词出现次数 */
function countKeywords(narratives: string[], keywords: string[]): number {
  let count = 0
  for (const text of narratives) {
    for (const kw of keywords) {
      if (text.includes(kw)) count++
    }
  }
  return count
}

/** 从叙事历史中提取人际关系数量（简单统计社交关键词） */
function countRelationships(narratives: string[]): number {
  const relKeywords = ['友', '师', '徒', '兄', '弟', '姐', '妹', '侣', '伴', '盟']
  let count = 0
  for (const text of narratives) {
    for (const kw of relKeywords) {
      if (text.includes(kw)) count++
    }
  }
  return Math.min(count, 20) // 上限 20 避免极端值
}

/** 从叙事历史中提取财富变化趋势（正值事件数 - 负值事件数） */
function estimateWealthTrend(narratives: string[]): number {
  const gainKeywords = ['获得', '收获', '赚', '继承', '发现', '赐予', '赏赐']
  const lossKeywords = ['失去', '丢失', '被夺', '被骗', '破产', '耗尽', '损失']
  let gain = 0
  let loss = 0
  for (const text of narratives) {
    for (const kw of gainKeywords) {
      if (text.includes(kw)) gain++
    }
    for (const kw of lossKeywords) {
      if (text.includes(kw)) loss++
    }
  }
  return gain - loss
}

/** 从叙事历史中检测修炼境界关键词 */
function detectCultivationRealm(narratives: string[]): number {
  const realms: Array<[string, number]> = [
    ['练气', 1], ['筑基', 2], ['金丹', 3], ['元婴', 4], ['化神', 5],
    ['合体', 6], ['大乘', 7], ['渡劫', 8], ['飞升', 9], ['成仙', 10],
  ]
  let maxLevel = 0
  for (const text of narratives) {
    for (const [kw, level] of realms) {
      if (text.includes(kw) && level > maxLevel) {
        maxLevel = level
      }
    }
  }
  return maxLevel
}

// ============================================================
// 人生总结生成
// ============================================================

/** 从叙事历史中提取关键事件 */
function extractKeyEvents(narratives: string[], maxEvents = 5): string[] {
  const eventKeywords = [
    '突破', '觉醒', '奇遇', '战斗', '结婚', '拜师', '创立', '继承',
    '失去', '背叛', '拯救', '发现', '修炼', '飞升', '死亡', '重生',
    '获得', '失去', '成就', '失败', '成长', '蜕变',
  ]

  const scored: Array<{ text: string; score: number }> = []
  for (const text of narratives) {
    let score = 0
    for (const kw of eventKeywords) {
      if (text.includes(kw)) score++
    }
    if (score > 0) {
      scored.push({ text, score })
    }
  }

  // 按重要性排序，取前 N 条
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxEvents).map((s) => s.text)
}

/** 基于叙事历史生成段落式人生总结 */
function generateLifeSummary(
  name: string,
  age: number,
  worldName: string,
  moralityLevel: string,
  narratives: string[],
): string {
  const keyEvents = extractKeyEvents(narratives)
  const cultivationLevel = detectCultivationRealm(narratives)
  const realmText = cultivationLevel > 0 ? `，在修炼道路上达到了第${cultivationLevel}重境界` : ''

  const moralityLabels: Record<string, string> = {
    supremeGood: '至善', greatGood: '大善', good: '善良',
    balanced: '中庸', evilLeaning: '偏恶', greatEvil: '大恶', supremeEvil: '极恶',
  }
  const moralityText = moralityLabels[moralityLevel] ?? '中庸'

  let summary = `${name || '无名之辈'}在${worldName}度过了${age}年的人生，品性评价为${moralityText}${realmText}。`

  if (keyEvents.length > 0) {
    // 取关键事件的前 3 条，拼接成段落
    const eventTexts = keyEvents.slice(0, 3).map((e) => {
      // 截取关键事件的核心片段（取前 50 字符）
      const trimmed = e.length > 50 ? e.slice(0, 50) + '...' : e
      return trimmed
    })
    summary += `一生中经历了诸多事件：${eventTexts.join('；')}。`
  } else {
    summary += '一生平淡，没有太多波澜。'
  }

  const totalRounds = narratives.length
  if (totalRounds > 50) {
    summary += `经历了${totalRounds}轮世事变迁，`
  } else {
    summary += `历经${totalRounds}轮岁月，`
  }

  // 基于善恶值和修炼境界给出最终评价
  if (cultivationLevel >= 8) {
    summary += '最终超脱凡尘，成就不朽传说。'
  } else if (totalRounds > 80) {
    summary += '最终度过了一段充实而漫长的人生。'
  } else if (totalRounds > 40) {
    summary += '最终度过了完整的一生。'
  } else {
    summary += '最终英年早逝，令人扼腕。'
  }

  return summary
}

// ============================================================
// 组件
// ============================================================

export default function GameOverPage() {
  const router = useRouter()
  const characterName = useCharacterStore((s) => s.name)
  const characterAge = useCharacterStore((s) => s.age)
  const characterBase = useCharacterStore((s) => s.characterBase)
  const morality = useCharacterStore((s) => s.morality)
  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldviewId = useGlobalStore((s) => s.worldviewId)
  const narrativeHistory = useEngineStore((s) => s.narrativeHistory)
  const status = useEngineStore((s) => s.status)
  const isDead = useCharacterStore((s) => s.health.isDead)

  const canViewGameOver = status === 'complete' || isDead

  useEffect(() => {
    if (!canViewGameOver) {
      router.replace(narrativeHistory.length > 0 ? '/game-story' : '/welcome')
    }
  }, [canViewGameOver, narrativeHistory.length, router])

  if (!canViewGameOver) {
    return null
  }

  const allNarratives = narrativeHistory.map((n) => n.text)

  // 五维评分（基于完整叙事历史 + 属性综合评估）
  const physBonus = countKeywords(allNarratives, PHYSIQUE_ACHIEVEMENTS) * 3
  const mindBonus = countKeywords(allNarratives, MIND_ACHIEVEMENTS) * 3
  const talentBonus = detectCultivationRealm(allNarratives) * 5
  const relCount = countRelationships(allNarratives)
  const charismaBonus = Math.min(relCount * 2, 15)
  const wealthTrend = estimateWealthTrend(allNarratives)
  const wealthBonus = clamp(wealthTrend * 2, -15, 15)
  const luckBonus = countKeywords(allNarratives, LUCK_ACHIEVEMENTS) * 4

  // 五维评分计算：将各属性映射到 [0, 100]
  const physiqueScore = clamp(Math.round((characterBase.current.physique / 20) * 100) + physBonus, 0, 100)
  const mindScore = clamp(Math.round((characterBase.current.mind / 20) * 100) + mindBonus, 0, 100)
  const talentScore = clamp(Math.round((characterBase.current.talentAptitude / 20) * 100) + talentBonus, 0, 100)
  const charismaScore = clamp(Math.round((characterBase.current.charisma / 20) * 100) + charismaBonus, 0, 100)
  // resourceScore 暂未接入雷达图五维（仅有 5 维），保留计算以备后续扩展
  const _resourceScore = clamp(Math.round((characterBase.current.resources / 20) * 100) + wealthBonus, 0, 100)
  const luckScore = clamp(Math.round(((characterBase.current.physique + characterBase.current.mind) / 40) * 100) + luckBonus, 0, 100)

  const dimensions: RadarDimension[] = [
    {
      label: '体魄',
      value: physiqueScore,
      comment: physiqueScore >= 80 ? '武道宗师' : physiqueScore >= 60 ? '身强体壮' : physiqueScore >= 40 ? '中规中矩' : '体弱多病',
    },
    {
      label: '心智',
      value: mindScore,
      comment: mindScore >= 80 ? '智冠群雄' : mindScore >= 60 ? '足智多谋' : mindScore >= 40 ? '心智健全' : '思维迟钝',
    },
    {
      label: '悟性',
      value: talentScore,
      comment: talentScore >= 80 ? '天纵奇才' : talentScore >= 60 ? '悟性出众' : talentScore >= 40 ? '悟性尚可' : '驽钝愚笨',
    },
    {
      label: '魅力',
      value: charismaScore,
      comment: charismaScore >= 80 ? '众星捧月' : charismaScore >= 60 ? '魅力四射' : charismaScore >= 40 ? '仪表堂堂' : '相貌平平',
    },
    {
      label: '气运',
      value: luckScore,
      comment: luckScore >= 80 ? '天命所归' : luckScore >= 60 ? '气运加身' : luckScore >= 40 ? '运势平平' : '命途多舛',
    },
  ]

  // 基于叙事历史生成人生总结
  const lifeSummary = generateLifeSummary(
    characterName,
    characterAge,
    worldConfig?.name ?? '未知世界',
    morality.level,
    allNarratives,
  )

  return (
    <PageScroll>
      <div className={styles.wrapper}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>人生落幕</h1>
          <Button variant="outline" size="sm" onClick={() => router.push('/')}>
            返回首页
          </Button>
        </header>

        {/* 角色总结 */}
        <Card title="人生总结">
          <div className={styles.summaryBody}>
            <p className={styles.summaryText}>{lifeSummary}</p>
            <p className={styles.summaryMeta}>
              世界观：{worldviewId ?? '未知'} | 道德评价：{morality.level} | 共经历 {allNarratives.length} 轮世事
            </p>
          </div>
        </Card>

        {/* 五维雷达图 */}
        <Card title="五维评分">
          <div className={styles.radarSection}>
            <RadarChart dimensions={dimensions} size={280} centerLabel="综合评分" />
          </div>
        </Card>

        {/* 操作按钮 */}
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => router.push('/game-story')}>
            查看模拟数据
          </Button>
          <Button variant="primary" onClick={() => router.push('/new-game')}>
            开始新人生
          </Button>
        </div>
      </div>
    </PageScroll>
  )
}
