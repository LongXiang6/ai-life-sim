import { HELP_CHAPTERS } from './help-content'
import styles from './HelpModal.module.css'

type HelpTab = 'docs' | 'changelog'

interface HelpModalNavigationProps {
  tab: HelpTab
  activeChapter: string
  onTabChange: (tab: HelpTab) => void
  onChapterClick: (chapterId: string) => void
}

export function HelpModalNavigation({
  tab,
  activeChapter,
  onTabChange,
  onChapterClick,
}: HelpModalNavigationProps) {
  return (
    <>
      <div className={styles.tabBar} role="tablist" aria-label="说明内容分类">
        <button type="button" role="tab" aria-selected={tab === 'docs'} onClick={() => onTabChange('docs')} className={`${styles.tab} ${tab === 'docs' ? styles.tabActive : ''}`}>
          <span>功能说明</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'changelog'} onClick={() => onTabChange('changelog')} className={`${styles.tab} ${tab === 'changelog' ? styles.tabActive : ''}`}>
          <span>更新日志</span>
        </button>
      </div>

      {tab === 'docs' && (
        <nav className={styles.chapterNav} aria-label="说明章节">
          {HELP_CHAPTERS.map((chapter) => (
            <button
              type="button"
              key={chapter.id}
              className={`${styles.chapterBtn} ${activeChapter === chapter.id ? styles.chapterBtnActive : ''}`}
              aria-pressed={activeChapter === chapter.id}
              aria-current={activeChapter === chapter.id ? 'location' : undefined}
              onClick={() => onChapterClick(chapter.id)}
            >
              {chapter.label}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}
