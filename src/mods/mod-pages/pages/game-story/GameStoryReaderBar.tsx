/**
 * Purpose: Render the sticky story identity, time-step, attribute, destiny, and information controls.
 * Owner: mod-pages/game-story
 * Responsibility: Reader-bar presentation and command forwarding only.
 */

import type { RefObject } from 'react'

import { ATTRIBUTE_NAMES, ATTR_KEYS } from '@/mods/mod-character'

import styles from './GameStory.module.css'

interface PatternView { id: string; name: string; rarity?: string }
interface TimeStepOption { label: string; value: string }

interface GameStoryReaderBarProps {
  activeTimeStepKey: string
  activeTimeStepLabel: string
  characterAge: number
  characterName: string
  destinyPatterns: PatternView[]
  displayBaseAttrs: Record<string, number>
  equippedMythicPatterns: PatternView[]
  forceBranchNext: boolean
  genderLabel: string
  hasUnresolvedBranch: boolean
  isAdvancing: boolean
  isComplete: boolean
  isDead: boolean
  isRuntimeReady: boolean
  narrativeTimeLabel: string
  showStepMenu: boolean
  showWorldPanel: boolean
  stepButtonRef: RefObject<HTMLButtonElement | null>
  stepMenuRef: RefObject<HTMLDivElement | null>
  timeStepOptions: TimeStepOption[]
  worldName: string
  onForceBranch: () => void
  onSelectTimeStep: (value: string) => void
  onSetShowStepMenu: (show: boolean) => void
  onSetShowWorldPanel: (show: boolean) => void
}

export function GameStoryReaderBar({
  activeTimeStepKey,
  activeTimeStepLabel,
  characterAge,
  characterName,
  destinyPatterns,
  displayBaseAttrs,
  equippedMythicPatterns,
  forceBranchNext,
  genderLabel,
  hasUnresolvedBranch,
  isAdvancing,
  isComplete,
  isDead,
  isRuntimeReady,
  narrativeTimeLabel,
  showStepMenu,
  showWorldPanel,
  stepButtonRef,
  stepMenuRef,
  timeStepOptions,
  worldName,
  onForceBranch,
  onSelectTimeStep,
  onSetShowStepMenu,
  onSetShowWorldPanel,
}: GameStoryReaderBarProps) {
  return (
    <header className={`${styles.readerBar} ${styles.barStatus}`}>
      <div className={styles.barTop}>
        <span className={styles.identity}>
          <strong>{characterName || '未命名'} · {genderLabel}</strong>
          <small>{worldName} · {characterAge}岁 · {narrativeTimeLabel}</small>
        </span>
        <div ref={stepMenuRef} className={styles.barActions}>
          <div className={styles.stepMenu}>
            <button
              ref={stepButtonRef}
              type="button"
              className={styles.stepButton}
              aria-expanded={showStepMenu}
              aria-haspopup="listbox"
              aria-controls="time-step-menu"
              aria-label={`推进步长 ${activeTimeStepLabel}`}
              onClick={() => { onSetShowWorldPanel(false); onSetShowStepMenu(!showStepMenu) }}
            >
              <span>{activeTimeStepLabel}</span>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 8l3-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div id="time-step-menu" className={`${styles.stepMenuPanel} ${showStepMenu ? styles.stepMenuPanelOpen : ''}`} role="listbox" aria-label="选择推进步长" aria-hidden={!showStepMenu}>
              {timeStepOptions.map((option) => (
                <button key={option.value} type="button" role="option" aria-selected={option.value === activeTimeStepKey} className={option.value === activeTimeStepKey ? styles.stepMenuOptionActive : ''} onClick={() => onSelectTimeStep(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.forceButton} ${forceBranchNext ? styles.forceButtonActive : ''}`}
            aria-label={forceBranchNext ? '取消下一轮命运分叉' : '请求下一轮命运分叉'}
            aria-pressed={forceBranchNext}
            disabled={!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch}
            onClick={onForceBranch}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v12M18 9a9 9 0 0 1-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="18" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            <span className={styles.srOnly}>{forceBranchNext ? '取消下一轮命运分叉' : '请求下一轮命运分叉'}</span>
          </button>
        </div>
        <button type="button" className={styles.infoToggle} aria-label={showWorldPanel ? '收起当前信息' : '展开当前信息'} aria-expanded={showWorldPanel} aria-controls="current-information-panel" onClick={() => onSetShowWorldPanel(!showWorldPanel)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M12 10.5v6M12 7.2v.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className={styles.barVitals}>
        <div className={styles.barAttrs} aria-label="四维属性">
          {ATTR_KEYS.map((key) => {
            const value = displayBaseAttrs[key] ?? 0
            const icon = key === 'physique' ? '💪' : key === 'mind' ? '🧠' : key === 'talentAptitude' ? '✨' : '💫'
            return <span key={key}><em aria-hidden="true">{icon}</em><i>{ATTRIBUTE_NAMES[key]}</i><b className={value > 0 ? styles.rise : ''}>{value}</b></span>
          })}
        </div>
        <div className={styles.barTalents} aria-label="已选命格">
          {destinyPatterns.slice(0, 3).map((pattern) => <span key={pattern.id} className={styles.barTalent} data-rarity={pattern.rarity}>{pattern.name}</span>)}
          {destinyPatterns.length === 0 ? <span className={`${styles.barTalent} ${styles.barTalentEmpty}`}>尚未携带命格</span> : null}
        </div>
        <div className={styles.barRebirths} aria-label="轮回天赋">
          {equippedMythicPatterns.length > 0
            ? equippedMythicPatterns.map((pattern) => <span key={pattern.id} className={`${styles.barTalent} ${styles.barTalentRebirth}`}>{pattern.name}</span>)
            : <span className={`${styles.barTalent} ${styles.barTalentEmpty}`}>未携带轮回</span>}
        </div>
      </div>
    </header>
  )
}
