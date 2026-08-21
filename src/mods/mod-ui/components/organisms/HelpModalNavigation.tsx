/** Purpose: Render help workspace tab navigation. Owner: mod-ui. Responsibility: Navigation presentation and selection forwarding only. */

import styles from './HelpModal.module.css'
import { HELP_TABS, type HelpTab } from './help-tabs'

interface HelpModalNavigationProps {
  tab: HelpTab
  onTabChange: (tab: HelpTab) => void
}

export function HelpModalNavigation({
  tab,
  onTabChange,
}: HelpModalNavigationProps) {
  return (
    <div className={styles.tabBar} role="tablist" aria-label="说明内容分类">
      {HELP_TABS.map((item) => (
        <button
          key={item.id}
          id={`help-tab-${item.id}`}
          type="button"
          role="tab"
          aria-controls="help-content-panel"
          aria-selected={tab === item.id}
          tabIndex={tab === item.id ? 0 : -1}
          onClick={() => onTabChange(item.id)}
          className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
