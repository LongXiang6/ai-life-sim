/**
 * Purpose: Compose account authentication, cloud-save, and personal-data tabs.
 * Owner: mod-pages/account
 * Responsibility: Account page presentation and tab routing only.
 */

'use client'

import { AccountAuthPanel } from './AccountAuthPanel'
import { AccountCloudPanel } from './AccountCloudPanel'
import { AccountDataPanel } from './AccountDataPanel'
import styles from './Account.module.css'
import { useAccountPageCommands } from './useAccountPageCommands'

export default function AccountPage() {
  const accountPage = useAccountPageCommands()

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={`${styles.page} final-flow-page-surface`}>
            <div className={styles.screen}>
              <header className={styles.header}>
                <div className={styles.meta}><span>AI LIFE SIM · 命书</span><span>附 · 账号</span></div>
                <h1>账号与云端</h1>
              </header>
              <nav className={styles.tabs} role="tablist" aria-label="账号页面">
                {([['login', '🔐', accountPage.status === 'authenticated' ? '账号' : '登录'], ['cloud', '☁️', '云存档'], ['data', '👤', '个人数据']] as const).map(([tab, icon, label]) => (
                  <button key={tab} type="button" role="tab" aria-selected={accountPage.activeTab === tab} onClick={() => accountPage.setActiveTab(tab)}>
                    <span className="semantic-emoji" aria-hidden="true">{icon}</span>{label}
                  </button>
                ))}
              </nav>

              {accountPage.activeTab === 'login' ? (
                <AccountAuthPanel
                  account={accountPage.account}
                  busy={accountPage.busy}
                  confirmPassword={accountPage.confirmPassword}
                  customKey={accountPage.customKey}
                  mode={accountPage.mode}
                  password={accountPage.password}
                  qq={accountPage.qq}
                  registerSaveKey={accountPage.registerSaveKey}
                  status={accountPage.status}
                  syncLabel={accountPage.syncLabel}
                  syncing={accountPage.syncStatus === 'syncing'}
                  username={accountPage.username}
                  onConfirmPasswordChange={accountPage.setConfirmPassword}
                  onLoginOrRegister={() => void (accountPage.mode === 'login' ? accountPage.handleLogin() : accountPage.handleRegister())}
                  onLogout={() => void accountPage.handleLogout()}
                  onModeChange={(mode) => { accountPage.setMode(mode); accountPage.setMessage('') }}
                  onPasswordChange={accountPage.setPassword}
                  onQqChange={accountPage.setQq}
                  onRegisterSaveKeyChange={accountPage.setRegisterSaveKey}
                  onSync={() => void accountPage.syncAccountNow()}
                  onUsernameChange={accountPage.setUsername}
                />
              ) : null}

              {accountPage.activeTab === 'cloud' ? (
                <AccountCloudPanel
                  authenticated={accountPage.status === 'authenticated'}
                  cloudSave={accountPage.cloudSave}
                  cloudSaveBusy={accountPage.cloudSaveBusy}
                  cloudDeleteArmed={accountPage.cloudDeleteArmed}
                  syncing={accountPage.syncStatus === 'syncing'}
                  onDeleteCloudSave={() => void accountPage.handleDeleteCloudSave()}
                  onGoToLogin={() => accountPage.setActiveTab('login')}
                  onSync={() => void accountPage.syncAccountNow()}
                />
              ) : null}

              {accountPage.activeTab === 'data' ? (
                <AccountDataPanel
                  account={accountPage.account}
                  authenticated={accountPage.status === 'authenticated'}
                  busy={accountPage.busy}
                  characterDraft={accountPage.characterDraft}
                  customKey={accountPage.customKey}
                  deleteOpen={accountPage.deleteOpen}
                  deletePassword={accountPage.deletePassword}
                  gameRecords={accountPage.gameRecords}
                  mythicTalents={accountPage.mythicTalents}
                  qqLinkBusy={accountPage.qqLinkBusy}
                  qqLinkCode={accountPage.qqLinkCode}
                  qqLinkExpiresAt={accountPage.qqLinkExpiresAt}
                  saveApiKey={accountPage.saveApiKey}
                  syncLabel={accountPage.syncLabel}
                  onCreateQqLinkCode={() => void accountPage.handleCreateQqLinkCode()}
                  onDeleteAccount={() => void accountPage.handleDelete()}
                  onDeletePasswordChange={accountPage.setDeletePassword}
                  onRefreshAccount={() => void accountPage.handleRefreshAccount()}
                  onRemoveGameRecord={accountPage.removeGameRecord}
                  onRemoveMythicTalent={accountPage.removeMythicTalent}
                  onSetDeleteOpen={accountPage.setDeleteOpen}
                  onSetSaveApiKey={accountPage.setCloudApiKeyPreference}
                  onUnlinkQq={() => void accountPage.handleUnlinkQq()}
                />
              ) : null}

              {accountPage.message ? <p className={styles.error} role="alert">{accountPage.message}</p> : null}
              {accountPage.syncError ? <p className={styles.error} role="alert">{accountPage.syncError}</p> : null}
            </div>
            <footer className={styles.footer} data-flow-bottom-bar>
              <button type="button" className={styles.back} onClick={() => accountPage.router.push('/welcome')} aria-label="返回欢迎界面">←</button>
              <button type="button" className={styles.done} onClick={() => accountPage.router.push('/welcome')}>
                <span className={styles.doneNumber}>00</span><span className={styles.doneCopy}><strong>完成</strong><small>返回欢迎界面</small></span><span className={styles.doneArrow} aria-hidden="true">→</span>
              </button>
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}
