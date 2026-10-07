/**
 * Purpose: Compose account authentication, cloud-save, and personal-data tabs.
 * Owner: mod-pages/account
 * Responsibility: Account page presentation and tab routing only.
 */

'use client'

import { AccountAuthPanel } from './AccountAuthPanel'
import { AccountCloudPanel } from './AccountCloudPanel'
import { AccountDataPanel } from './AccountDataPanel'
import { BottomActionBar, FlowRunningHead } from '@/mods/mod-ui'
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
              <FlowRunningHead stepLabel="附 · 账号" />
              <header className={styles.header}>
                <div><h1>☁️ 账号与云端</h1><p>登录同步后，存档与配置可跨设备继续。</p></div>
              </header>
              <nav className={styles.tabs} role="tablist" aria-label="账号页面">
                {([['login', '🔑', accountPage.status === 'authenticated' ? '账号' : '登录'], ['cloud', '☁️', '云存档'], ['data', '📊', '个人数据']] as const).map(([tab, icon, label]) => (
                  <button key={tab} type="button" role="tab" data-active={accountPage.activeTab === tab} aria-selected={accountPage.activeTab === tab} onClick={() => accountPage.setActiveTab(tab)}>
                    <span className="semantic-emoji" aria-hidden="true">{icon}</span>{label}
                  </button>
                ))}
              </nav>

              <div className={styles.content}>
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
                    reincarnationTalents={accountPage.reincarnationTalents}
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
                    onRemoveReincarnationTalent={accountPage.removeReincarnationTalent}
                    onSetDeleteOpen={accountPage.setDeleteOpen}
                    onSetSaveApiKey={accountPage.setCloudApiKeyPreference}
                    onUnlinkQq={() => void accountPage.handleUnlinkQq()}
                  />
                ) : null}

                {accountPage.message ? <p className={styles.error} role="alert">{accountPage.message}</p> : null}
                {accountPage.syncError ? <p className={styles.error} role="alert">{accountPage.syncError}</p> : null}
              </div>
            </div>
          </main>
          <BottomActionBar
            onBack={() => accountPage.router.back()}
            backTitle="返回上一页"
            backDescription="退出账号页"
            onConfirm={() => accountPage.router.push('/welcome')}
            confirmText="完成"
            confirmDescription="返回欢迎界面"
          />
        </div>
      </div>
    </div>
  )
}
