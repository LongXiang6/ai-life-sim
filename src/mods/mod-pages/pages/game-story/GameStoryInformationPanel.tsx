/**
 * Purpose: Render the current story information ledger and secondary page commands.
 * Owner: mod-pages/game-story
 * Responsibility: Read-only information-panel presentation only; navigation and save state remain in the page.
 */

import { ATTRIBUTE_NAMES, ATTR_KEYS } from '@/mods/mod-character'

import type { WorldTagSection } from './game-story-world-tags'
import styles from './GameStory.module.css'

interface NamedView { id: string; name: string; effect?: string }
interface StatusView { label: string; value: string }
interface RepetitionMetricView { round: number; wordRepeatRate: number }

interface GameStoryInformationPanelProps {
  characterAge: number
  characterName: string
  destinyPatterns: NamedView[]
  displayBaseAttrs: Record<string, number>
  equippedReincarnationTalents: NamedView[]
  genderLabel: string
  health: { vitality: number; maxVitality: number }
  isAdvancing: boolean
  isRuntimeReady: boolean
  narrativeTimeLabel: string
  raceName: string
  recentRepetitionMetrics: RepetitionMetricView[]
  repetitionStats: { recentAverageWordRepeatRate: number; maxWordRepeatRate: number; trend: string }
  runtimeBlockedText: string
  worldBasicStatus: StatusView[]
  worldCharStatus: StatusView[]
  worldName: string
  worldSurrounding: StatusView[]
  worldTagSections: WorldTagSection[]
  latestWordRepeatRate?: number
  onClose: () => void
  onFeedback: () => void
  onForceSettle: () => void
  onOpenSave: () => void
  onWelcome: () => void
}

const ATTRIBUTE_ICONS: Record<string, string> = {
  mind: '🧠',
  physique: '💪',
  charisma: '💫',
  familyBackground: '🏠',
}

export function GameStoryInformationPanel(props: GameStoryInformationPanelProps) {
  return (
    <section id="current-information-panel" className={`${styles.infoPanel} ${styles.infoPanelOpen}`} aria-label="当前信息">
      <div className={styles.infoInner}>
        <div className={styles.panelHead}>
          <strong>当前信息</strong>
          <button type="button" className={styles.infoClose} aria-label="收起当前信息" onClick={props.onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className={styles.moreActions}>
          <button type="button" disabled={!props.isRuntimeReady || props.isAdvancing} title={!props.isRuntimeReady ? `${props.runtimeBlockedText}，暂时不能保存` : props.isAdvancing ? '故事生成完成后才能保存' : undefined} onClick={props.onOpenSave}>手动存档</button>
          <button
            type="button"
            className={styles.forceSettleAction}
            disabled={!props.isRuntimeReady || props.isAdvancing}
            title={!props.isRuntimeReady ? `${props.runtimeBlockedText}，暂时不能结算` : props.isAdvancing ? '本轮故事完成后才能结算' : undefined}
            onClick={props.onForceSettle}
          >强制结算</button>
          <button type="button" onClick={props.onFeedback}>反馈与建议</button>
          <button type="button" onClick={props.onWelcome}>返回主界面</button>
        </div>

        <div className={styles.attributes} aria-label="当前属性">
          <span><em aria-hidden="true">❤️</em><span>生命</span><b>{props.health.vitality}/{props.health.maxVitality}</b></span>
          {ATTR_KEYS.map((key) => (
            <span key={key}>
              <em aria-hidden="true">{ATTRIBUTE_ICONS[key]}</em>
              <span>{ATTRIBUTE_NAMES[key]}</span>
              <b>{props.displayBaseAttrs[key] ?? 0}</b>
            </span>
          ))}
        </div>

        <details className={styles.ledger} open>
          <summary><strong>世界与角色账簿</strong><small>当前状态</small></summary>
          <div className={styles.ledgerContent}>
            <div className={styles.ledgerRow}><span>角色词条</span></div>
            <div className={styles.ledgerPillRow}>
              {props.destinyPatterns.map((pattern) => <span key={pattern.id} className={styles.ledgerPill}>{pattern.name}</span>)}
              {props.destinyPatterns.length === 0 ? <span className={styles.mutedText}>暂无角色词条</span> : null}
            </div>

            <div className={styles.ledgerSection}>轮回天赋</div>
            {props.equippedReincarnationTalents.length > 0
              ? props.equippedReincarnationTalents.map((pattern) => (
                <div key={pattern.id} className={styles.ledgerRow}>
                  <span>{pattern.name}</span>
                  <span>{pattern.effect ?? '已携带'}</span>
                </div>
              ))
              : <div className={styles.ledgerRow}><span>轮回天赋</span><span>本局未携带</span></div>}

            <div className={styles.ledgerSection}>世界与当前状态</div>
            {[...props.worldSurrounding, ...props.worldBasicStatus, ...props.worldCharStatus].map((item) => (
              <div key={`${item.label}-${item.value}`} className={styles.ledgerRow}><span>{item.label}</span><span>{item.value}</span></div>
            ))}

            <div className={styles.ledgerSection}>叙事重复观测 · 近五轮</div>
            <div className={styles.ledgerRow}>
              <span>本轮 · 近五轮均值</span>
              <span>{props.latestWordRepeatRate === undefined ? '待测' : `${Math.round(props.latestWordRepeatRate * 100)}%`} · {Math.round(props.repetitionStats.recentAverageWordRepeatRate * 100)}%</span>
            </div>
            <div className={styles.ledgerRow}>
              <span>峰值 · 趋势</span>
              <span>{Math.round(props.repetitionStats.maxWordRepeatRate * 100)}% · {props.repetitionStats.trend === 'rising' ? '上升' : props.repetitionStats.trend === 'falling' ? '下降' : '平稳'}</span>
            </div>
            {props.recentRepetitionMetrics.map((metric) => (
              <div key={metric.round} className={styles.ledgerRow}><span>第 {metric.round} 轮</span><span>{Math.round(metric.wordRepeatRate * 100)}%</span></div>
            ))}

            {props.worldTagSections.map((section) => (
              <div key={section.name}>
                <div className={styles.ledgerSection}>{section.name}</div>
                {section.tags.map((tag) => <div key={`${section.name}-${tag.key}`} className={styles.ledgerRow}><span>{tag.key}</span><span>{tag.value}</span></div>)}
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  )
}
