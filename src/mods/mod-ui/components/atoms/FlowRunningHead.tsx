/** Purpose: Render the shared finalized running head. Owner: mod-ui. Responsibility: Brand and page-context presentation only. */

import styles from './FlowRunningHead.module.css'

export interface FlowRunningHeadProps {
  stepLabel: string
}

const CREATION_STEPS = ['世界', '角色', '抽取', '选择', '属性', '命运', '故事']

export function FlowRunningHead({ stepLabel }: FlowRunningHeadProps) {
  const stepNumber = Number(stepLabel.match(/\d+/)?.[0] ?? 0)
  const showCreationSteps = /\/\s*07/.test(stepLabel) && stepNumber >= 1 && stepNumber <= CREATION_STEPS.length

  return (
    <div className={styles.root} data-flow-running-head>
      <div className={styles.brandLockup}>
        <span className={styles.seal} aria-hidden="true">命</span>
        <span className={styles.brandCopy}>
          <strong>AI LIFE SIM</strong>
          <small>人生模拟器 · 命书</small>
        </span>
      </div>

      {showCreationSteps ? (
        <div className={styles.steps} aria-label="创建流程进度">
          {CREATION_STEPS.map((label, index) => {
            const current = index + 1 === stepNumber
            const done = index + 1 < stepNumber
            return (
              <span
                key={label}
                className={`${styles.stepItem} ${current ? styles.stepCurrent : ''} ${done ? styles.stepDone : ''}`.trim()}
                aria-current={current ? 'step' : undefined}
              >
                <i>{String(index + 1).padStart(2, '0')}</i>
                <span>{label}</span>
              </span>
            )
          })}
        </div>
      ) : null}

      <span className={styles.step}>{stepLabel}</span>
    </div>
  )
}
