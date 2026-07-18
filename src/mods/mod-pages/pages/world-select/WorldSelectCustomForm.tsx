import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectCustomForm({ logic }: { logic: WorldSelectLogic }) {
  const L = logic.LABELS

  return (
    <fieldset className={styles.customForm} disabled={logic.isConfirming}>
      <h3>{logic.editingWorldId ? L.formEditTitle : L.formCreateTitle}</h3>
      <label className={styles.formField}>
        <span>{L.formLabelName}</span>
        <input value={logic.customName} maxLength={80} placeholder={L.formPlaceholderName} onChange={(event) => logic.setCustomName(event.target.value)} />
      </label>
      <label className={styles.formField}>
        <span>{L.formLabelDesc}</span>
        <textarea value={logic.customDesc} maxLength={5000} placeholder={L.formPlaceholderDesc} onChange={(event) => logic.setCustomDesc(event.target.value.slice(0, 5000))} />
        <small className={logic.customDesc.length > 4500 ? styles.charCountWarning : ''}>{logic.customDesc.length}/5000</small>
      </label>
      <fieldset className={styles.eraFieldset}>
        <legend>{L.formLabelEra}</legend>
        <input value={logic.customEraName} placeholder={L.formPlaceholderEraName} onChange={(event) => logic.setCustomEraName(event.target.value)} />
        <input type="number" min="1" inputMode="numeric" value={logic.customEraYear} placeholder={L.formPlaceholderYear} onChange={(event) => logic.setCustomEraYear(event.target.value)} />
        <button type="button" onClick={() => logic.setIsBC(!logic.isBC)} aria-pressed={logic.isBC}>{logic.isBC ? L.bcLabel : L.adLabel}</button>
      </fieldset>
      <div className={styles.autoEraHeading}>
        <span>{L.formLabelAutoEra}</span>
        <button type="button" onClick={() => logic.setAutoEraEnabled(!logic.autoEraEnabled)} aria-pressed={logic.autoEraEnabled}>
          {logic.autoEraEnabled ? L.autoEraEnabledText : L.autoEraDisabledText}
        </button>
      </div>
      {logic.autoEraEnabled && (
        <div className={styles.eraEditor}>
          {logic.eraTimelineEntries.map((entry) => (
            <div key={`${entry.name}-${entry.startAnchorYear}`} className={styles.eraEntry}>
              <span>{entry.name} · {entry.startAnchorYear}年</span>
              <button type="button" aria-label={`删除年号 ${entry.name}`} onClick={() => logic.setEraTimelineEntries((items) => items.filter((item) => item !== entry))}>×</button>
            </div>
          ))}
          <div className={styles.eraAddRow}>
            <input value={logic.newEraEntryName} placeholder={L.formPlaceholderEraEntryName} onChange={(event) => logic.setNewEraEntryName(event.target.value)} />
            <input type="number" value={logic.newEraEntryYear} placeholder={L.formPlaceholderEraEntryYear} onChange={(event) => logic.setNewEraEntryYear(event.target.value)} />
            <button
              type="button"
              onClick={() => {
                if (!logic.newEraEntryName.trim() || !logic.newEraEntryYear.trim()) return
                logic.setEraTimelineEntries((items) => [...items, { name: logic.newEraEntryName.trim(), startAnchorYear: Number.parseInt(logic.newEraEntryYear) || 1 }])
                logic.setNewEraEntryName('')
                logic.setNewEraEntryYear('')
              }}
            >{L.btnAddEraEntry}</button>
          </div>
          <p>{L.eraHint}</p>
        </div>
      )}
      <div className={styles.formActions}>
        {logic.editingWorldId ? (
          <>
            <button type="button" className={styles.primaryFormAction} disabled={!logic.customName.trim() || !logic.customDesc.trim()} onClick={logic.handleSaveEdit}>{L.btnSaveEdit}</button>
            <button type="button" onClick={logic.handleCancelEdit}>{L.btnCancel}</button>
          </>
        ) : (
          <button type="button" className={styles.primaryFormAction} disabled={!logic.customName.trim() || !logic.customDesc.trim()} onClick={logic.handleAddCustom}>{L.btnAddCustom}</button>
        )}
      </div>
    </fieldset>
  )
}
