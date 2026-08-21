/**
 * Purpose: Render named local custom-model profiles and switch the active profile.
 * Owner: mod-settings
 * Responsibility: Profile presentation and activation only; persistence belongs to the settings store.
 */

'use client'

import { useCallback, useState } from 'react'

import { useSettingsStore } from '../store'

import styles from './SettingsCustomProfiles.module.css'

interface SettingsCustomProfilesProps {
  customKey: string
  customUrl: string
  customModel: string
  markConnectionUntested: (target: string, model: string) => void
}

function connectionTargetKey(customUrl: string): string {
  return `custom:${customUrl.trim()}`
}

function maskApiKey(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 6) return '***'
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`
}

export function SettingsCustomProfiles({
  customKey,
  customUrl,
  customModel,
  markConnectionUntested,
}: SettingsCustomProfilesProps) {
  const customModelProfiles = useSettingsStore((state) => state.customModelProfiles)
  const saveCustomModelProfile = useSettingsStore((state) => state.saveCustomModelProfile)
  const activateCustomModelProfile = useSettingsStore((state) => state.activateCustomModelProfile)
  const [profileName, setProfileName] = useState('')
  const [profileNotice, setProfileNotice] = useState<string | null>(null)

  const handleSaveProfile = useCallback(() => {
    try {
      saveCustomModelProfile(profileName)
      setProfileNotice(`已保存“${profileName.trim()}”，并切换为当前配置。`)
      setProfileName('')
      markConnectionUntested(connectionTargetKey(customUrl), customModel)
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : '配置保存失败')
    }
  }, [customModel, customUrl, markConnectionUntested, profileName, saveCustomModelProfile])

  const handleActivateProfile = useCallback((id: string, name: string, target: string, model: string) => {
    activateCustomModelProfile(id)
    markConnectionUntested(connectionTargetKey(target), model)
    setProfileNotice(`已切换到“${name}”。`)
  }, [activateCustomModelProfile, markConnectionUntested])

  return (
    <div className={styles.root}>
      <div className={styles.tools}>
        <label className={styles.nameField}>
          <span>保存为自定义配置</span>
          <input
            className={styles.input}
            value={profileName}
            maxLength={32}
            placeholder="例如：家用中转"
            onChange={(event) => {
              setProfileName(event.target.value)
              setProfileNotice(null)
            }}
          />
        </label>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSaveProfile}
          disabled={!profileName.trim() || !customKey.trim() || !customUrl.trim() || !customModel.trim()}
        >
          保存配置
        </button>
      </div>
      {profileNotice ? <p className={styles.notice} role="status">{profileNotice}</p> : null}
      {customModelProfiles.length > 0 ? (
        <div className={styles.list} aria-label="已保存的自定义配置">
          {customModelProfiles.map((profile) => {
            const isActive = profile.customUrl === customUrl.trim()
              && profile.customModel === customModel.trim()
              && profile.customKey === customKey.trim()
            return (
              <button
                key={profile.id}
                type="button"
                className={styles.item}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => handleActivateProfile(profile.id, profile.name, profile.customUrl, profile.customModel)}
              >
                <span className={styles.itemMain}>
                  <strong>{profile.name}</strong>
                  <small>{profile.customModel} · Key {maskApiKey(profile.customKey)}</small>
                </span>
                <span className={styles.itemMark} aria-hidden="true">{isActive ? '当前' : '切换'}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className={styles.empty}>尚未保存配置。保存后可直接点击名称切换。</p>
      )}
    </div>
  )
}
