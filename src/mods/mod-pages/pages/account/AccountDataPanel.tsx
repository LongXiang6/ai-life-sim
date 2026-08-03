/**
 * Purpose: Render personal account data, QQ linking, and deletion controls.
 * Owner: mod-pages/account
 * Responsibility: Account-data presentation and command forwarding only.
 */

import type { AccountProfile, CloudGameRecord } from '@/core/account/account-contract'
import type { MythicPattern } from '@/mods/mod-character'

import styles from './Account.module.css'

interface CharacterDraftSummary {
  name: string
  race: string
}

interface AccountDataPanelProps {
  account: AccountProfile | null
  authenticated: boolean
  busy: boolean
  characterDraft: CharacterDraftSummary
  customKey: string
  deleteOpen: boolean
  deletePassword: string
  gameRecords: CloudGameRecord[]
  mythicTalents: MythicPattern[]
  qqLinkBusy: boolean
  qqLinkCode: string
  qqLinkExpiresAt: number
  saveApiKey: boolean
  syncLabel: string
  onCreateQqLinkCode: () => void
  onDeleteAccount: () => void
  onDeletePasswordChange: (value: string) => void
  onRefreshAccount: () => void
  onRemoveGameRecord: (recordId: string) => void
  onRemoveMythicTalent: (talentId: string) => void
  onSetDeleteOpen: (open: boolean) => void
  onSetSaveApiKey: (save: boolean) => void
  onUnlinkQq: () => void
}

export function AccountDataPanel({
  account,
  authenticated,
  busy,
  characterDraft,
  customKey,
  deleteOpen,
  deletePassword,
  gameRecords,
  mythicTalents,
  qqLinkBusy,
  qqLinkCode,
  qqLinkExpiresAt,
  saveApiKey,
  syncLabel,
  onCreateQqLinkCode,
  onDeleteAccount,
  onDeletePasswordChange,
  onRefreshAccount,
  onRemoveGameRecord,
  onRemoveMythicTalent,
  onSetDeleteOpen,
  onSetSaveApiKey,
  onUnlinkQq,
}: AccountDataPanelProps) {
  return (
    <section className={styles.panel} aria-label="个人数据">
      <div className={styles.rows}>
        <div className={styles.dataRow}>
          <div><strong>API Key</strong><small>{authenticated && saveApiKey ? '服务端加密保存' : '仅保留在当前浏览器'}</small></div>
          {authenticated ? (
            <label className={styles.switch}>
              <input type="checkbox" checked={saveApiKey} onChange={(event) => onSetSaveApiKey(event.target.checked)} disabled={!customKey.trim() && !saveApiKey} />
              <span aria-hidden="true" />
            </label>
          ) : <span>{customKey.trim() ? '本地' : '未设置'}</span>}
        </div>
        <div className={styles.dataRow}>
          <div><strong>角色设定</strong><small>{characterDraft.name.trim() || '未填写姓名'} · {characterDraft.race.trim() || '未填写种族'}</small></div>
          <span>{authenticated ? syncLabel : '本地'}</span>
        </div>
        <div className={styles.sectionLine}><strong>轮回天赋</strong><span>{mythicTalents.length} / 10</span></div>
        {mythicTalents.map((talent) => (
          <div key={talent.id} className={styles.dataRow}>
            <div><strong>{talent.name}</strong><small>{talent.concept}</small></div>
            <button type="button" className={styles.textAction} onClick={() => onRemoveMythicTalent(talent.id)}>删除</button>
          </div>
        ))}
        {mythicTalents.length === 0 ? <p className={styles.empty}>暂无已封存天赋</p> : null}
        <div className={styles.sectionLine}><strong>每局战绩</strong><span>{gameRecords.length} / 10</span></div>
        {gameRecords.map((record) => (
          <div key={record.recordId} className={styles.dataRow}>
            <div><strong>{record.characterName} · {record.worldName}</strong><small>{record.finalAge} 岁 · {record.rounds} 轮 · 评分 {record.overallScore}</small></div>
            <button type="button" className={styles.textAction} onClick={() => onRemoveGameRecord(record.recordId)}>删除</button>
          </div>
        ))}
        {gameRecords.length === 0 ? <p className={styles.empty}>暂无结构化战绩</p> : null}

        {authenticated && account ? (
          <>
            <div className={styles.sectionLine}><strong>QQ群机器人</strong><span>{account.linkedQq ? `${account.pointsBalance} 积分` : '未绑定'}</span></div>
            {qqLinkCode ? (
              <p className={styles.linkCode}>
                /绑定游戏 {qqLinkCode}
                <small>{new Date(qqLinkExpiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 失效</small>
              </p>
            ) : null}
            <div className={styles.actionRow}>
              {account.linkedQq ? (
                <>
                  <button type="button" className={styles.secondary} onClick={onRefreshAccount} disabled={qqLinkBusy}>刷新状态</button>
                  <button type="button" className={styles.secondary} onClick={onUnlinkQq} disabled={qqLinkBusy}>解除绑定</button>
                </>
              ) : (
                <>
                  <button type="button" className={styles.secondary} onClick={onCreateQqLinkCode} disabled={qqLinkBusy}>{qqLinkCode ? '更换绑定码' : '生成绑定码'}</button>
                  {qqLinkCode ? <button type="button" className={styles.secondary} onClick={onRefreshAccount} disabled={qqLinkBusy}>刷新绑定</button> : null}
                </>
              )}
            </div>
            <div className={styles.dangerRow}>
              {!deleteOpen ? <button type="button" onClick={() => onSetDeleteOpen(true)}>删除账号</button> : (
                <>
                  <input type="password" value={deletePassword} onChange={(event) => onDeletePasswordChange(event.target.value)} placeholder="输入当前密码" autoComplete="current-password" maxLength={128} />
                  <button type="button" onClick={onDeleteAccount} disabled={busy}>确认删除</button>
                  <button type="button" onClick={() => { onSetDeleteOpen(false); onDeletePasswordChange('') }}>取消</button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
