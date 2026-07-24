import styles from './WorldCustomizeMobile.module.css'

export function WorldCustomizeBottomBar({
  onBack,
  onConfirm,
  isSaving,
  canConfirm,
  blockedReason,
  worldName,
}: {
  onBack: () => void
  onConfirm: () => void
  isSaving: boolean
  canConfirm: boolean
  blockedReason: string | null
  worldName: string
}) {
  const disabled = isSaving || !canConfirm
  const hint = isSaving
    ? '正在校准规则与世界数据，请稍候'
    : blockedReason ?? `${worldName} · 下一步塑造角色`

  return (
    <nav className={styles.bottomBar} aria-label="世界配置操作">
      <div className={styles.bottomBarInner}>
        <button type="button" className={styles.backButton} onClick={onBack} disabled={isSaving} aria-label="返回世界选择">
          <span aria-hidden="true">←</span>
        </button>
        <button type="button" className={styles.confirmButton} onClick={onConfirm} disabled={disabled} title={blockedReason ?? undefined}>
        <span className={styles.nextNumber}>03</span>
          <span className={styles.nextCopy}>
            <strong>{isSaving ? '正在初始化世界' : '确认世界'}</strong>
            <small>{hint}</small>
          </span>
          <span className={styles.nextArrow} aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  )
}
