/**
 * Purpose: Render guest authentication or the current authenticated account summary.
 * Owner: mod-pages/account
 * Responsibility: Authentication-tab presentation and command forwarding only.
 */

import type { AccountProfile } from '@/core/account/account-contract'

import styles from './Account.module.css'

interface AccountAuthPanelProps {
  account: AccountProfile | null
  busy: boolean
  confirmPassword: string
  customKey: string
  mode: 'login' | 'register'
  password: string
  qq: string
  registerSaveKey: boolean
  status: 'loading' | 'guest' | 'authenticated'
  syncLabel: string
  syncing: boolean
  username: string
  onConfirmPasswordChange: (value: string) => void
  onLoginOrRegister: () => void
  onLogout: () => void
  onModeChange: (mode: 'login' | 'register') => void
  onPasswordChange: (value: string) => void
  onQqChange: (value: string) => void
  onRegisterSaveKeyChange: (save: boolean) => void
  onSync: () => void
  onUsernameChange: (value: string) => void
}

export function AccountAuthPanel(props: AccountAuthPanelProps) {
  const { account, busy, mode, status } = props
  return (
    <section className={styles.panel} aria-label={status === 'authenticated' ? '当前账号' : mode === 'login' ? '登录账号' : '注册账号'}>
      {status === 'loading' ? <p className={styles.empty}>正在确认登录状态...</p> : null}
      {status === 'guest' ? (
        <div className={styles.form}>
          <label className={styles.field}>
            <span>账号</span>
            <input value={props.username} placeholder="输入账号" onChange={(event) => props.onUsernameChange(event.target.value)} autoComplete="username" maxLength={24} />
          </label>
          {mode === 'register' ? (
            <label className={styles.field}>
              <span>QQ 号（选填）</span>
              <input value={props.qq} onChange={(event) => props.onQqChange(event.target.value.replace(/\D/gu, ''))} inputMode="numeric" autoComplete="off" maxLength={12} />
            </label>
          ) : null}
          <label className={styles.field}>
            <span>密码</span>
            <input type="password" value={props.password} placeholder="输入密码" onChange={(event) => props.onPasswordChange(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} />
          </label>
          {mode === 'register' ? (
            <>
              <label className={styles.field}>
                <span>确认密码</span>
                <input type="password" value={props.confirmPassword} onChange={(event) => props.onConfirmPasswordChange(event.target.value)} autoComplete="new-password" maxLength={128} />
              </label>
              <label className={styles.checkRow}>
                <span><strong>加密保存 API Key</strong><small>仅在当前已填写 Key 时可选</small></span>
                <input type="checkbox" checked={props.registerSaveKey} onChange={(event) => props.onRegisterSaveKeyChange(event.target.checked)} disabled={!props.customKey.trim()} />
              </label>
            </>
          ) : null}
          <button type="button" className={styles.primary} disabled={busy} onClick={props.onLoginOrRegister}>
            {busy ? '处理中...' : mode === 'login' ? '登录并同步' : '注册并同步'}
          </button>
          <button type="button" className={styles.secondary} onClick={() => props.onModeChange(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '注册账号' : '返回登录'}
          </button>
        </div>
      ) : null}
      {status === 'authenticated' && account ? (
        <div className={styles.rows}>
          <div className={styles.profileRow}>
            <div><strong>{account.username}</strong><small>{account.linkedQq ? `已验证 QQ ${account.linkedQq}` : account.qq ? `登记 QQ ${account.qq}` : '尚未登记 QQ'}</small></div>
            <span>{props.syncLabel}</span>
          </div>
          <div className={styles.actionRow}>
            <button type="button" className={styles.primary} onClick={props.onSync} disabled={busy || props.syncing}>立即同步</button>
            <button type="button" className={styles.secondary} onClick={props.onLogout} disabled={busy}>退出登录</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
