/** Purpose: Render the shared finalized running head. Owner: mod-ui. Responsibility: Brand and page-context presentation only. */

import styles from './FlowRunningHead.module.css'

export interface FlowRunningHeadProps {
  stepLabel: string
}

export function FlowRunningHead({ stepLabel }: FlowRunningHeadProps) {
  return (
    <div className={styles.root} data-flow-running-head aria-hidden="true">
      <span className={styles.brand}>AI LIFE SIM · 命书</span>
      <span className={styles.step}>{stepLabel}</span>
    </div>
  )
}
