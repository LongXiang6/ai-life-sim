'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  createCloudQqLinkCode,
  deleteCloudAccount,
  fetchAccountSession,
  loginCloudAccount,
  logoutCloudAccount,
  registerCloudAccount,
  unlinkCloudQq,
} from '@/core/account/account-client'
import {
  LoginRequestSchema,
  RegisterRequestSchema,
} from '@/core/account/account-contract'
import { useAccountClientStore } from '@/core/account/account-client-store'
import { fetchCloudManualSaveSummary, removeCloudManualSave } from '@/core/player-content/player-content-client'
import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'
import { useLifeRecordStore, useMythicLibraryStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'

import {
  applyAccountSession,
  buildInitialCloudData,
  clearAuthenticatedAccountState,
  setCloudApiKeyPreference,
  syncAccountNow,
} from '../../helpers/account-cloud-sync'
import { useCharacterCreationDraftStore } from '../../helpers/character-creation-draft-store'

import styles from './Account.module.css'

type GuestMode = 'login' | 'register'
type AccountTab = 'login' | 'cloud' | 'data'

function firstIssueMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return (error as { issues?: Array<{ message?: string }> }).issues?.[0]?.message ?? '输入内容无效'
  }
  return error instanceof Error ? error.message : '账号操作失败'
}

export default function AccountPage() {
  const router = useRouter()
  const status = useAccountClientStore((state) => state.status)
  const account = useAccountClientStore((state) => state.account)
  const syncStatus = useAccountClientStore((state) => state.syncStatus)
  const syncError = useAccountClientStore((state) => state.syncError)
  const saveApiKey = useAccountClientStore((state) => state.saveApiKey)
  const mythicTalents = useMythicLibraryStore((state) => state.patterns)
  const removeMythicTalent = useMythicLibraryStore((state) => state.removePattern)
  const gameRecords = useLifeRecordStore((state) => state.records)
  const removeGameRecord = useLifeRecordStore((state) => state.removeRecord)
  const customKey = useSettingsStore((state) => state.customKey)
  const characterDraft = useCharacterCreationDraftStore((state) => state.draft)

  const [mode, setMode] = useState<GuestMode>('login')
  const [activeTab, setActiveTab] = useState<AccountTab>('login')
  const [username, setUsername] = useState('')
  const [qq, setQq] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [registerSaveKey, setRegisterSaveKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [qqLinkCode, setQqLinkCode] = useState('')
  const [qqLinkExpiresAt, setQqLinkExpiresAt] = useState(0)
  const [qqLinkBusy, setQqLinkBusy] = useState(false)
  const [cloudSave, setCloudSave] = useState<CloudManualSaveSummary | null>(null)
  const [cloudSaveBusy, setCloudSaveBusy] = useState(false)
  const [cloudDeleteArmed, setCloudDeleteArmed] = useState(false)

  useEffect(() => {
    let active = true
    if (status !== 'authenticated') {
      queueMicrotask(() => {
        if (!active) return
        setCloudSave(null)
        setCloudDeleteArmed(false)
      })
      return () => { active = false }
    }
    queueMicrotask(() => { if (active) setCloudSaveBusy(true) })
    void fetchCloudManualSaveSummary()
      .then((summary) => { if (active) setCloudSave(summary) })
      .catch((error) => { if (active) setMessage(firstIssueMessage(error)) })
      .finally(() => { if (active) setCloudSaveBusy(false) })
    return () => { active = false }
  }, [status])

  const syncLabel = useMemo(() => {
    if (syncStatus === 'syncing') return '同步中'
    if (syncStatus === 'error') return '同步失败'
    if (syncStatus === 'synced') return '已同步'
    return '待同步'
  }, [syncStatus])

  const handleLogin = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const input = LoginRequestSchema.parse({ username, password })
      applyAccountSession(await loginCloudAccount(input))
      setPassword('')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleRegister = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const input = RegisterRequestSchema.parse({
        username,
        qq,
        password,
        confirmPassword,
        initialData: buildInitialCloudData(registerSaveKey),
      })
      applyAccountSession(await registerCloudAccount(input))
      setPassword('')
      setConfirmPassword('')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    if (busy) return
    setBusy(true)
    try {
      await logoutCloudAccount()
      clearAuthenticatedAccountState()
      router.replace('/welcome')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await deleteCloudAccount(deletePassword)
      clearAuthenticatedAccountState()
      router.replace('/welcome')
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleCreateQqLinkCode = async () => {
    if (qqLinkBusy) return
    setQqLinkBusy(true)
    setMessage('')
    try {
      const result = await createCloudQqLinkCode()
      setQqLinkCode(result.code)
      setQqLinkExpiresAt(result.expiresAt)
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setQqLinkBusy(false)
    }
  }

  const handleRefreshAccount = async () => {
    if (qqLinkBusy) return
    setQqLinkBusy(true)
    setMessage('')
    try {
      const payload = await fetchAccountSession()
      if (!payload.authenticated) throw new Error('登录状态已失效')
      applyAccountSession(payload)
      if (payload.account.linkedQq) {
        setQqLinkCode('')
        setQqLinkExpiresAt(0)
      }
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setQqLinkBusy(false)
    }
  }

  const handleUnlinkQq = async () => {
    if (qqLinkBusy) return
    setQqLinkBusy(true)
    setMessage('')
    try {
      applyAccountSession(await unlinkCloudQq())
      setQqLinkCode('')
      setQqLinkExpiresAt(0)
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setQqLinkBusy(false)
    }
  }

  const handleDeleteCloudSave = async () => {
    if (!cloudDeleteArmed || cloudSaveBusy) {
      setCloudDeleteArmed(true)
      return
    }
    setCloudSaveBusy(true)
    setMessage('')
    try {
      await removeCloudManualSave()
      setCloudSave(null)
      setCloudDeleteArmed(false)
    } catch (error) {
      setMessage(firstIssueMessage(error))
    } finally {
      setCloudSaveBusy(false)
    }
  }

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
                {([
                  ['login', '🔐', status === 'authenticated' ? '账号' : '登录'],
                  ['cloud', '☁️', '云存档'],
                  ['data', '👤', '个人数据'],
                ] as const).map(([tab, icon, label]) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                  ><span className="semantic-emoji" aria-hidden="true">{icon}</span>{label}</button>
                ))}
              </nav>

              {activeTab === 'login' ? (
                <section className={styles.panel} aria-label={status === 'authenticated' ? '当前账号' : mode === 'login' ? '登录账号' : '注册账号'}>
                  {status === 'loading' ? <p className={styles.empty}>正在确认登录状态...</p> : null}
                  {status === 'guest' ? (
                    <div className={styles.form}>
                      <label className={styles.field}>
                        <span>账号</span>
                        <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={24} />
                      </label>
                      {mode === 'register' ? (
                        <label className={styles.field}>
                          <span>QQ 号（选填）</span>
                          <input value={qq} onChange={(event) => setQq(event.target.value.replace(/\D/gu, ''))} inputMode="numeric" autoComplete="off" maxLength={12} />
                        </label>
                      ) : null}
                      <label className={styles.field}>
                        <span>密码</span>
                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} />
                      </label>
                      {mode === 'register' ? (
                        <>
                          <label className={styles.field}>
                            <span>确认密码</span>
                            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" maxLength={128} />
                          </label>
                          <label className={styles.checkRow}>
                            <span><strong>加密保存 API Key</strong><small>仅在当前已填写 Key 时可选</small></span>
                            <input type="checkbox" checked={registerSaveKey} onChange={(event) => setRegisterSaveKey(event.target.checked)} disabled={!customKey.trim()} />
                          </label>
                        </>
                      ) : null}
                      <button type="button" className={styles.primary} disabled={busy} onClick={() => void (mode === 'login' ? handleLogin() : handleRegister())}>
                        {busy ? '处理中...' : mode === 'login' ? '登录并同步' : '注册并同步'}
                      </button>
                      <button type="button" className={styles.secondary} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage('') }}>
                        {mode === 'login' ? '注册账号' : '返回登录'}
                      </button>
                    </div>
                  ) : null}
                  {status === 'authenticated' && account ? (
                    <div className={styles.rows}>
                      <div className={styles.profileRow}>
                        <div><strong>{account.username}</strong><small>{account.linkedQq ? `已验证 QQ ${account.linkedQq}` : account.qq ? `登记 QQ ${account.qq}` : '尚未登记 QQ'}</small></div>
                        <span>{syncLabel}</span>
                      </div>
                      <div className={styles.actionRow}>
                        <button type="button" className={styles.primary} onClick={() => void syncAccountNow()} disabled={busy || syncStatus === 'syncing'}>立即同步</button>
                        <button type="button" className={styles.secondary} onClick={() => void handleLogout()} disabled={busy}>退出登录</button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {activeTab === 'cloud' ? (
                <section className={styles.panel} aria-label="云存档">
                  {status !== 'authenticated' ? (
                    <div className={styles.emptyState}><strong>登录后使用云存档</strong><small>游客存档仍保留在当前浏览器。</small><button type="button" className={styles.primary} onClick={() => setActiveTab('login')}>前往登录</button></div>
                  ) : (
                    <div className={styles.rows}>
                      <div className={styles.dataRow}>
                        <div><strong>云端人生</strong><small>{cloudSave ? `${cloudSave.worldName || '未知世界'} · 第 ${cloudSave.totalRounds} 轮` : cloudSaveBusy ? '正在读取云端栏位' : '云端栏位为空'}</small></div>
                        <span>{cloudSave ? '已同步' : '0 / 1'}</span>
                      </div>
                      {cloudSave ? (
                        <div className={styles.dataRow}>
                          <div><strong>{cloudSave.name}</strong><small>{cloudSave.characterName || '未命名角色'}</small></div>
                          <button type="button" className={styles.textAction} disabled={cloudSaveBusy} onClick={() => void handleDeleteCloudSave()}>{cloudDeleteArmed ? '确认删除' : '删除'}</button>
                        </div>
                      ) : null}
                      <button type="button" className={styles.primary} onClick={() => void syncAccountNow()} disabled={syncStatus === 'syncing'}>{syncStatus === 'syncing' ? '正在同步' : '同步账号数据'}</button>
                    </div>
                  )}
                </section>
              ) : null}

              {activeTab === 'data' ? (
                <section className={styles.panel} aria-label="个人数据">
                  <div className={styles.rows}>
                    <div className={styles.dataRow}>
                      <div><strong>API Key</strong><small>{status === 'authenticated' && saveApiKey ? '服务端加密保存' : '仅保留在当前浏览器'}</small></div>
                      {status === 'authenticated' ? (
                        <label className={styles.switch}><input type="checkbox" checked={saveApiKey} onChange={(event) => setCloudApiKeyPreference(event.target.checked)} disabled={!customKey.trim() && !saveApiKey} /><span aria-hidden="true" /></label>
                      ) : <span>{customKey.trim() ? '本地' : '未设置'}</span>}
                    </div>
                    <div className={styles.dataRow}>
                      <div><strong>角色设定</strong><small>{characterDraft.name.trim() || '未填写姓名'} · {characterDraft.race.trim() || '未填写种族'}</small></div>
                      <span>{status === 'authenticated' ? syncLabel : '本地'}</span>
                    </div>
                    <div className={styles.sectionLine}><strong>轮回天赋</strong><span>{mythicTalents.length} / 10</span></div>
                    {mythicTalents.map((talent) => (
                      <div key={talent.id} className={styles.dataRow}><div><strong>{talent.name}</strong><small>{talent.concept}</small></div><button type="button" className={styles.textAction} onClick={() => removeMythicTalent(talent.id)}>删除</button></div>
                    ))}
                    {mythicTalents.length === 0 ? <p className={styles.empty}>暂无已封存天赋</p> : null}
                    <div className={styles.sectionLine}><strong>每局战绩</strong><span>{gameRecords.length} / 10</span></div>
                    {gameRecords.map((record) => (
                      <div key={record.recordId} className={styles.dataRow}><div><strong>{record.characterName} · {record.worldName}</strong><small>{record.finalAge} 岁 · {record.rounds} 轮 · 评分 {record.overallScore}</small></div><button type="button" className={styles.textAction} onClick={() => removeGameRecord(record.recordId)}>删除</button></div>
                    ))}
                    {gameRecords.length === 0 ? <p className={styles.empty}>暂无结构化战绩</p> : null}

                    {status === 'authenticated' && account ? (
                      <>
                        <div className={styles.sectionLine}><strong>QQ群机器人</strong><span>{account.linkedQq ? `${account.pointsBalance} 积分` : '未绑定'}</span></div>
                        {qqLinkCode ? <p className={styles.linkCode}>/绑定游戏 {qqLinkCode}<small>{new Date(qqLinkExpiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 失效</small></p> : null}
                        <div className={styles.actionRow}>
                          {account.linkedQq ? (
                            <>
                              <button type="button" className={styles.secondary} onClick={() => void handleRefreshAccount()} disabled={qqLinkBusy}>刷新状态</button>
                              <button type="button" className={styles.secondary} onClick={() => void handleUnlinkQq()} disabled={qqLinkBusy}>解除绑定</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className={styles.secondary} onClick={() => void handleCreateQqLinkCode()} disabled={qqLinkBusy}>{qqLinkCode ? '更换绑定码' : '生成绑定码'}</button>
                              {qqLinkCode ? <button type="button" className={styles.secondary} onClick={() => void handleRefreshAccount()} disabled={qqLinkBusy}>刷新绑定</button> : null}
                            </>
                          )}
                        </div>
                        <div className={styles.dangerRow}>
                          {!deleteOpen ? <button type="button" onClick={() => setDeleteOpen(true)}>删除账号</button> : (
                            <><input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="输入当前密码" autoComplete="current-password" maxLength={128} /><button type="button" onClick={() => void handleDelete()} disabled={busy}>确认删除</button><button type="button" onClick={() => { setDeleteOpen(false); setDeletePassword('') }}>取消</button></>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {message ? <p className={styles.error} role="alert">{message}</p> : null}
              {syncError ? <p className={styles.error} role="alert">{syncError}</p> : null}
            </div>

            <footer className={styles.footer} data-flow-bottom-bar>
              <button type="button" className={styles.back} onClick={() => router.push('/welcome')} aria-label="返回欢迎界面">←</button>
              <button type="button" className={styles.done} onClick={() => router.push('/welcome')}>
                <span className={styles.doneNumber}>00</span><span className={styles.doneCopy}><strong>完成</strong><small>返回欢迎界面</small></span><span className={styles.doneArrow} aria-hidden="true">→</span>
              </button>
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}
