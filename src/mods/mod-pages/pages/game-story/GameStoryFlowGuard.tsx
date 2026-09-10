/**
 * Purpose: Render the creation-flow guard shown before the story runtime is available.
 * Owner: mod-pages/game-story
 * Responsibility: Guard presentation and return command only.
 */

import styles from './GameStory.module.css'
import { FlowRunningHead } from '@/mods/mod-ui'

interface GameStoryFlowGuardProps {
  action: string
  message: string
  onReturn: (action: string) => void
  title: string
}

export function GameStoryFlowGuard({ action, message, onReturn, title }: GameStoryFlowGuardProps) {
  return (
    <div className="final-flow-frame final-flow-frame--core-simulation">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <div className={styles.root}>
            <div className={styles.guardHead}>
              <FlowRunningHead stepLabel="07 / 07" />
            </div>
            <div className={styles.guardShell}>
              <div className={styles.guardCard}>
                <div className={styles.guardIcon}>⚠</div>
                <h1 className={styles.guardTitle}>{title}</h1>
                <p className={styles.guardMessage}>{message}</p>
                <button type="button" className={styles.ctrlBtnPrimary} onClick={() => onReturn(action)}>
                  返回创建流程
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
