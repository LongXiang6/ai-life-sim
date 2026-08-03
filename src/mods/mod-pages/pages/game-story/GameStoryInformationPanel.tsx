/**
 * Purpose: Render the current story information ledger and secondary page commands.
 * Owner: mod-pages/game-story
 * Responsibility: Read-only information-panel presentation only; navigation and save state remain in the page.
 */

import type { WorldTagSection } from './game-story-world-tags'
import styles from './GameStory.module.css'

interface NamedView { id: string; name: string; effect?: string; concept?: string }
interface StatusView { label: string; value: string }
interface RepetitionMetricView { round: number; wordRepeatRate: number }

interface GameStoryInformationPanelProps {
  characterAge: number
  characterName: string
  destinyPatterns: NamedView[]
  equippedMythicPatterns: NamedView[]
  genderLabel: string
  health: { vitality: number; maxVitality: number }
  isAdvancing: boolean
  isRuntimeReady: boolean
  narrativeTimeLabel: string
  preGenerationActive: boolean
  preGenerationQueueLength: number
  raceName: string
  recentRepetitionMetrics: RepetitionMetricView[]
  repetitionStats: { recentAverageWordRepeatRate: number; maxWordRepeatRate: number; trend: string }
  runtimeBlockedText: string
  talents: NamedView[]
  worldBasicStatus: StatusView[]
  worldCharStatus: StatusView[]
  worldName: string
  worldSurrounding: StatusView[]
  worldTagSections: WorldTagSection[]
  latestWordRepeatRate?: number
  onClose: () => void
  onFeedback: () => void
  onOpenSave: () => void
  onWelcome: () => void
}

export function GameStoryInformationPanel(props: GameStoryInformationPanelProps) {
  return (
    <section id="current-information-panel" className={styles.infoPanel} aria-label="当前信息">
      <div className={styles.infoInner}>
        <div className={styles.panelHead}>
          <strong>当前信息</strong>
          <button type="button" className={styles.infoClose} aria-label="关闭当前信息" onClick={props.onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <section className={styles.moreActions}>
          <div className={styles.sectionLine}><strong>更多</strong><small>当前章节</small></div>
          <div className={styles.moreActionRow}>
            <button type="button" disabled={!props.isRuntimeReady || props.isAdvancing} title={!props.isRuntimeReady ? `${props.runtimeBlockedText}，暂时不能保存` : props.isAdvancing ? '故事生成完成后才能保存' : undefined} onClick={props.onOpenSave}>手动存档</button>
            <button type="button" onClick={props.onFeedback}>反馈与建议</button>
            <button type="button" onClick={props.onWelcome}>返回主界面</button>
          </div>
        </section>
        <section className={styles.currentBlock}>
          <div className={styles.identityIndex}><span>{props.characterName} · {props.genderLabel} · {props.raceName}</span><small>{props.worldName} · {props.characterAge}岁 · {props.narrativeTimeLabel}</small></div>
          <div className={styles.attributes}><span>生命 <b>{props.health.vitality}/{props.health.maxVitality}</b></span></div>
        </section>
        <div className={styles.infoBody}>
          <details className={styles.ledgerDisclosure} open>
            <summary><strong>世界与角色账簿</strong><small>{props.preGenerationActive ? '下一段正在准备' : props.preGenerationQueueLength > 0 ? '下一段已准备' : '实时生成'}</small></summary>
            <div className={styles.ledgerContent}>
              <p className={styles.ledgerLabel}>角色词条</p>
              {props.destinyPatterns.map((pattern, index) => <span key={pattern.id} className={styles.talent} data-index={String(index + 1).padStart(2, '0')}>{pattern.name}</span>)}
              {props.talents.map((talent, index) => <span key={talent.id} className={styles.talent} data-index={String(props.destinyPatterns.length + index + 1).padStart(2, '0')}>{talent.name}</span>)}
              {props.destinyPatterns.length === 0 && props.talents.length === 0 ? <span className={styles.mutedText}>暂无角色词条</span> : null}
              <p className={styles.ledgerLabel}>轮回天赋 · 独立槽</p>
              {props.equippedMythicPatterns.length > 0
                ? props.equippedMythicPatterns.map((pattern) => <div key={pattern.id} className={styles.mythicRule}><strong>{pattern.name} · {pattern.concept}</strong><span>{pattern.effect}</span></div>)
                : <span className={styles.mutedText}>本局未携带轮回天赋</span>}
              <p className={styles.ledgerLabel}>世界与当前状态</p>
              <div className={styles.stateList}>{[...props.worldSurrounding, ...props.worldBasicStatus, ...props.worldCharStatus].map((item) => <span key={item.label}>{item.label} {item.value}</span>)}</div>
              <p className={styles.ledgerLabel}>叙事重复观测 · 近五轮</p>
              <div className={styles.repetitionStats} aria-live="polite">
                <span>本轮 {props.latestWordRepeatRate === undefined ? '待测' : `${Math.round(props.latestWordRepeatRate * 100)}%`}</span>
                <span>近五轮均值 {Math.round(props.repetitionStats.recentAverageWordRepeatRate * 100)}%</span>
                <span>峰值 {Math.round(props.repetitionStats.maxWordRepeatRate * 100)}%</span>
                <span>{props.repetitionStats.trend === 'rising' ? '重复上升' : props.repetitionStats.trend === 'falling' ? '重复下降' : '保持平稳'}</span>
                <div className={styles.repetitionRounds} aria-label="近五轮词语重复率">
                  {props.recentRepetitionMetrics.length > 0
                    ? props.recentRepetitionMetrics.map((metric) => <span key={metric.round}>第{metric.round}轮 <b>{Math.round(metric.wordRepeatRate * 100)}%</b></span>)
                    : <span>暂无轮次数据</span>}
                </div>
              </div>
              {props.worldTagSections.map((section) => <div key={section.name} className={styles.ruleGroup}><p className={styles.ledgerLabel}>{section.name}</p><div className={styles.stateList}>{section.tags.map((tag) => <span key={`${section.name}-${tag.key}`}>{tag.key} {tag.value}</span>)}</div></div>)}
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}
