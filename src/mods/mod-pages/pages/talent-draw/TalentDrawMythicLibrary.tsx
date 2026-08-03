/**
 * Purpose: Render the modal library used to equip or clear mythic patterns.
 * Owner: mod-pages/talent-draw
 * Responsibility: Mythic library presentation and command forwarding only.
 */

import type { RefObject } from 'react'
import type { MythicPattern } from '@/mods/mod-character'
import { FlowIcon } from './TalentFlowArt'
import styles from './TalentDraw.module.css'

interface TalentDrawMythicLibraryProps {
  activeMythicSlot: number
  closeRef: RefObject<HTMLButtonElement | null>
  equippedMythicPatterns: MythicPattern[]
  mythicLibrary: MythicPattern[]
  onClose: () => void
  onToggle: (pattern: MythicPattern | null) => void
  sheetRef: RefObject<HTMLElement | null>
}

export function TalentDrawMythicLibrary({
  activeMythicSlot,
  closeRef,
  equippedMythicPatterns,
  mythicLibrary,
  onClose,
  onToggle,
  sheetRef,
}: TalentDrawMythicLibraryProps) {
  return (
    <section
      id="mythic-library-sheet"
      ref={sheetRef}
      className={styles.librarySheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mythic-library-title"
    >
      <button className={styles.libraryBackdrop} type="button" onClick={onClose} aria-label="关闭轮回天赋选择" />
      <div className={styles.libraryPanel}>
        <header className={styles.libraryHead}>
          <div>
            <small>轮回天赋</small>
            <strong id="mythic-library-title">选择轮回 {String(activeMythicSlot + 1).padStart(2, '0')}</strong>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭轮回天赋库"><FlowIcon name="close" /></button>
        </header>
        <div className={styles.libraryList}>
          <button
            type="button"
            className={`${styles.libraryItem} ${equippedMythicPatterns.length === 0 ? styles.libraryItemActive : ''}`}
            onClick={() => onToggle(null)}
            aria-pressed={equippedMythicPatterns.length === 0}
          >
            <strong>清空轮回槽</strong><span>轮回天赋独立于三个普通命格，可留空。</span>
          </button>
          {mythicLibrary.map((pattern) => {
            const equipped = equippedMythicPatterns.some((item) => item.id === pattern.id)
            return (
              <button
                type="button"
                key={pattern.id}
                className={`${styles.libraryItem} ${equipped ? styles.libraryItemActive : ''}`}
                onClick={() => onToggle(pattern)}
                aria-pressed={equipped}
              >
                <strong>{pattern.name}</strong><span>{pattern.effect || pattern.concept}</span>
              </button>
            )
          })}
          {mythicLibrary.length === 0 ? <p className={styles.libraryEmpty}>尚未在人生结算中封存轮回天赋。</p> : null}
        </div>
      </div>
    </section>
  )
}
