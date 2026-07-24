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
import { PageScroll } from '@/mods/mod-ui'

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
    <PageScroll maxWidth={920} className={styles.page}>
      <main className={styles.shell}>
        <span className={styles.spine} aria-hidden="true" />
        <span className={styles.verticalBrand} aria-hidden="true">AI LIFE SIM</span>
        <header className={styles.header}>
          <button type="button" className={styles.back} onClick={() => router.push('/welcome')} title="返回欢迎页" aria-label="返回欢迎页">←</button>
          <div className={styles.headerCopy}>
            <span>AI LIFE SIM · 命书 / 附页 03</span>
            <h1>账号与云端</h1>
            <p>游客可以完整游玩，登录只用于保留和同步你的个人数据。</p>
          </div>
          {status === 'authenticated' ? <strong className={styles.syncBadge} data-state={syncStatus}>{syncLabel}</strong> : null}
        </header>

        {status === 'loading' ? <p className={styles.loading}>正在确认登录状态...</p> : null}

        {status === 'guest' ? (
          <div className={styles.guestLayout}>
            <section className={styles.authTool} aria-labelledby="auth-title">
              <div className={styles.form}>
                <div className={styles.formHead}>
                  <span>AI LIFE SIM · 云端续页</span>
                  <h2 id="auth-title">{mode === 'login' ? '登录账号' : '注册账号'}</h2>
                  <p>{mode === 'login' ? '载入你的配置、角色设定、轮回天赋与战绩。' : '建立一份可跨设备续写的个人命书。'}</p>
                </div>
                <label>
                  <span>用户名</span>
                  <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={24} />
                  {mode === 'register' ? <small>3-24 位中文、英文、数字或下划线</small> : null}
                </label>
                {mode === 'register' ? (
                  <label>
                    <span>QQ 号（选填）</span>
                    <input value={qq} onChange={(event) => setQq(event.target.value.replace(/\D/gu, ''))} inputMode="numeric" autoComplete="off" maxLength={12} />
                    <small>这里只作联系方式；机器人身份需注册后用一次性绑定码验证</small>
                  </label>
                ) : null}
                <label>
                  <span>密码</span>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} />
                  {mode === 'register' ? <small>至少 8 位，可使用任意字符</small> : null}
                </label>
                {mode === 'register' ? (
                  <>
                    <label>
                      <span>确认密码</span>
                      <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" maxLength={128} />
                    </label>
                    <label className={styles.checkbox}>
                      <input type="checkbox" checked={registerSaveKey} onChange={(event) => setRegisterSaveKey(event.target.checked)} disabled={!customKey.trim()} />
                      <span>加密保存当前 API Key</span>
                    </label>
                  </>
                ) : null}
                {message ? <p className={styles.error} role="alert">{message}</p> : null}
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void (mode === 'login' ? handleLogin() : handleRegister())}>
                  {busy ? '处理中...' : mode === 'login' ? '登录并载入云端' : '注册并同步当前数据'}
                </button>
                <p className={styles.formSwitch}>
                  {mode === 'login' ? '还没有账号？' : '已经有账号？'}
                  <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage('') }}>
                    {mode === 'login' ? '注册账号' : '返回登录'}
                  </button>
                </p>
                <div className={styles.authNotice}>
                  <span>每类数据最多 10 个栏位</span>
                  <span>连续 30 天未登录自动清理</span>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {status === 'guest' && (mythicTalents.length > 0 || gameRecords.length > 0) ? (
          <div className={styles.localData}>
            <section className={styles.slots} aria-labelledby="local-talent-slots-title">
              <div className={styles.sectionHead}>
                <h2 id="local-talent-slots-title">本地轮回天赋</h2>
                <span>{mythicTalents.length} / 10</span>
              </div>
              <div className={styles.slotList}>
                {mythicTalents.map((talent) => (
                  <div key={talent.id} className={styles.slotRow}>
                    <div><strong>{talent.name}</strong><small>{talent.concept}</small></div>
                    <button type="button" onClick={() => removeMythicTalent(talent.id)}>删除</button>
                  </div>
                ))}
              </div>
            </section>
            <section className={styles.slots} aria-labelledby="local-record-slots-title">
              <div className={styles.sectionHead}>
                <h2 id="local-record-slots-title">本地每局战绩</h2>
                <span>{gameRecords.length} / 10</span>
              </div>
              <div className={styles.slotList}>
                {gameRecords.map((record) => (
                  <div key={record.recordId} className={styles.slotRow}>
                    <div><strong>{record.characterName} · {record.worldName}</strong><small>{record.finalAge} 岁 · {record.rounds} 轮 · 评分 {record.overallScore}</small></div>
                    <button type="button" onClick={() => removeGameRecord(record.recordId)}>删除</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {status === 'authenticated' && account ? (
          <div className={styles.accountLayout}>
            <section className={styles.profile} aria-labelledby="profile-title">
              <div>
                <span>当前账号</span>
                <h2 id="profile-title">{account.username}</h2>
                <p>{account.linkedQq ? `已验证 QQ ${account.linkedQq}` : account.qq ? `登记 QQ ${account.qq}（未验证）` : '尚未登记 QQ'}</p>
              </div>
              <div className={styles.profileActions}>
                <button type="button" onClick={() => void syncAccountNow()} disabled={busy || syncStatus === 'syncing'}>立即同步</button>
                <button type="button" onClick={() => void handleLogout()} disabled={busy}>退出登录</button>
              </div>
            </section>

            <section className={styles.slots} aria-labelledby="cloud-save-slot-title">
              <div className={styles.sectionHead}>
                <h2 id="cloud-save-slot-title">云端手动存档</h2>
                <span>{cloudSave ? '1 / 1' : '0 / 1'}</span>
              </div>
              <div className={styles.slotList}>
                {cloudSave ? (
                  <div className={styles.slotRow}>
                    <div>
                      <strong>{cloudSave.name}</strong>
                      <small>{cloudSave.characterName || '未命名'} · {cloudSave.worldName || '未知世界'} · 第 {cloudSave.totalRounds} 轮</small>
                    </div>
                    <button type="button" disabled={cloudSaveBusy} onClick={() => void handleDeleteCloudSave()}>
                      {cloudDeleteArmed ? '确认删除' : '删除'}
                    </button>
                  </div>
                ) : <p className={styles.empty}>{cloudSaveBusy ? '正在读取云端栏位...' : '云端栏位为空'}</p>}
              </div>
            </section>

            <section className={styles.qqBinding} aria-labelledby="qq-binding-title">
              <div className={styles.bindingHead}>
                <div>
                  <span>社区联动</span>
                  <h2 id="qq-binding-title">QQ群机器人</h2>
                  <p>验证后可在群内查询账号状态，并使用同一份全局积分。</p>
                </div>
                {account.linkedQq ? <strong>{account.pointsBalance} 积分</strong> : null}
              </div>
              {account.linkedQq ? (
                <div className={styles.bindingActions}>
                  <p>QQ {account.linkedQq} 已绑定。积分交易不会读取你的配置、Key、角色设定或故事。</p>
                  <div>
                    <button type="button" onClick={() => void handleRefreshAccount()} disabled={qqLinkBusy}>刷新状态</button>
                    <button type="button" onClick={() => void handleUnlinkQq()} disabled={qqLinkBusy}>解除绑定</button>
                  </div>
                </div>
              ) : (
                <div className={styles.bindingActions}>
                  {qqLinkCode ? (
                    <div className={styles.linkCode} aria-live="polite">
                      <span>在机器人所在群发送</span>
                      <strong>/绑定游戏 {qqLinkCode}</strong>
                      <small>绑定码于 {new Date(qqLinkExpiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 失效</small>
                    </div>
                  ) : <p>生成一次性绑定码后，由当前 QQ 在群内确认归属。</p>}
                  <div>
                    <button type="button" onClick={() => void handleCreateQqLinkCode()} disabled={qqLinkBusy}>{qqLinkCode ? '换一个绑定码' : '生成绑定码'}</button>
                    {qqLinkCode ? <button type="button" onClick={() => void handleRefreshAccount()} disabled={qqLinkBusy}>我已绑定，刷新</button> : null}
                  </div>
                </div>
              )}
            </section>

            <section className={styles.preference} aria-labelledby="key-title">
              <div>
                <h2 id="key-title">API Key 云保存</h2>
                <p>{saveApiKey ? '已使用服务端密钥加密保存' : '仅保留在当前浏览器'}</p>
              </div>
              <label className={styles.switch}>
                <input type="checkbox" checked={saveApiKey} onChange={(event) => setCloudApiKeyPreference(event.target.checked)} disabled={!customKey.trim() && !saveApiKey} />
                <span aria-hidden="true" />
              </label>
            </section>

            <section className={styles.preference} aria-labelledby="character-draft-title">
              <div>
                <h2 id="character-draft-title">长期角色设定</h2>
                <p>{characterDraft.name.trim() || '未填写姓名'} · {characterDraft.race.trim() || '未填写种族'}</p>
              </div>
              <span className={styles.syncBadge} data-state={syncStatus}>{syncLabel}</span>
            </section>

            {syncError ? <p className={styles.error} role="alert">{syncError}</p> : null}

            <section className={styles.slots} aria-labelledby="talent-slots-title">
              <div className={styles.sectionHead}>
                <h2 id="talent-slots-title">轮回天赋</h2>
                <span>{mythicTalents.length} / 10</span>
              </div>
              <div className={styles.slotList}>
                {mythicTalents.map((talent) => (
                  <div key={talent.id} className={styles.slotRow}>
                    <div><strong>{talent.name}</strong><small>{talent.concept}</small></div>
                    <button type="button" onClick={() => removeMythicTalent(talent.id)}>删除</button>
                  </div>
                ))}
                {mythicTalents.length === 0 ? <p className={styles.empty}>暂无已封存天赋</p> : null}
              </div>
            </section>

            <section className={styles.slots} aria-labelledby="record-slots-title">
              <div className={styles.sectionHead}>
                <h2 id="record-slots-title">每局战绩</h2>
                <span>{gameRecords.length} / 10</span>
              </div>
              <div className={styles.slotList}>
                {gameRecords.map((record) => (
                  <div key={record.recordId} className={styles.slotRow}>
                    <div><strong>{record.characterName} · {record.worldName}</strong><small>{record.finalAge} 岁 · {record.rounds} 轮 · 评分 {record.overallScore}</small></div>
                    <button type="button" onClick={() => removeGameRecord(record.recordId)}>删除</button>
                  </div>
                ))}
                {gameRecords.length === 0 ? <p className={styles.empty}>暂无结构化战绩</p> : null}
              </div>
            </section>

            <section className={styles.danger} aria-labelledby="danger-title">
              <div>
                <h2 id="danger-title">删除账号</h2>
                <p>立即删除云端配置、角色设定、Key、天赋、战绩、手动存档、邮箱内容和全部会话。</p>
              </div>
              {!deleteOpen ? (
                <button type="button" onClick={() => setDeleteOpen(true)}>删除账号</button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="输入当前密码" autoComplete="current-password" maxLength={128} />
                  <button type="button" onClick={() => void handleDelete()} disabled={busy}>确认删除</button>
                  <button type="button" onClick={() => { setDeleteOpen(false); setDeletePassword('') }}>取消</button>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </PageScroll>
  )
}
