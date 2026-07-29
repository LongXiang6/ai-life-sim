import styles from './HelpModal.module.css'

interface HelpChangelogContentProps {
  htmls: string[]
  loadError: string
  hasMore: boolean
  currentChunk: number
  maxChunk: number
  loadingMore: boolean
  onLoadMore: () => void
}

export function HelpChangelogContent({
  htmls,
  loadError,
  hasMore,
  currentChunk,
  maxChunk,
  loadingMore,
  onLoadMore,
}: HelpChangelogContentProps) {
  return (
    <div className={styles.changelogContent}>
      {htmls.map((html, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: html }} />
      ))}
      {loadError && <p className={styles.errorText}>{loadError}</p>}
      {hasMore && currentChunk > 1 && (
        <div className={styles.loadMoreRow}>
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className={styles.loadMoreBtn}>
            {loadingMore ? '加载中…' : '加载更多历史版本'}
          </button>
        </div>
      )}
      {!hasMore && htmls.length > 0 && maxChunk > 1 && (
        <p className={styles.endText}>已加载全部历史版本</p>
      )}
    </div>
  )
}
