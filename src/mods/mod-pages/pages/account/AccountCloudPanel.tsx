/**
 * Purpose: Render the account page cloud-save tab without owning cloud data.
 * Owner: mod-pages/account
 * Responsibility: Cloud-save presentation and user command forwarding only.
 */

import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'

import styles from './Account.module.css'

interface AccountCloudPanelProps {
  authenticated: boolean
  cloudSave: CloudManualSaveSummary | null
  cloudSaveBusy: boolean
  cloudDeleteArmed: boolean
  syncing: boolean
  onDeleteCloudSave: () => void
  onGoToLogin: () => void
  onSync: () => void
}

export function AccountCloudPanel({
  authenticated,
  cloudSave,
  cloudSaveBusy,
  cloudDeleteArmed,
  syncing,
  onDeleteCloudSave,
  onGoToLogin,
  onSync,
}: AccountCloudPanelProps) {
  return (
    <section className={styles.panel} aria-label="云存档">
      {!authenticated ? (
        <div className={styles.emptyState}>
          <strong>登录后使用云存档</strong>
          <small>游客存档仍保留在当前浏览器。</small>
          <button type="button" className={styles.primary} onClick={onGoToLogin}>前往登录</button>
        </div>
      ) : (
        <div className={styles.rows}>
          <div className={styles.dataRow}>
            <div>
              <strong>云端人生</strong>
              <small>
                {cloudSave
                  ? `${cloudSave.worldName || '未知世界'} · 第 ${cloudSave.totalRounds} 轮`
                  : cloudSaveBusy ? '正在读取云端栏位' : '云端栏位为空'}
              </small>
            </div>
            <span>{cloudSave ? '已同步' : '0 / 1'}</span>
          </div>
          {cloudSave ? (
            <div className={styles.dataRow}>
              <div><strong>{cloudSave.name}</strong><small>{cloudSave.characterName || '未命名角色'}</small></div>
              <button type="button" className={styles.textAction} disabled={cloudSaveBusy} onClick={onDeleteCloudSave}>
                {cloudDeleteArmed ? '确认删除' : '删除'}
              </button>
            </div>
          ) : null}
          <button type="button" className={styles.primary} onClick={onSync} disabled={syncing}>
            {syncing ? '正在同步' : '同步账号数据'}
          </button>
        </div>
      )}
    </section>
  )
}
