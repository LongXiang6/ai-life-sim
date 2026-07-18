/**
 * @module save-manager-page
 * @description 存档管理页面 —— 查看/加载/删除存档
 * @mod mod-pages
 *
 * 参照废弃项目 SaveManager 重写：
 *   简洁 slot 卡片、删除按钮文字切换确认、CSS Module
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

import { saveManager, type SaveMetadata } from '@/core/storage/save-manager'
import { applyGameSave, orchestrator } from '@/mods/mod-engine/engine-api'
import { useEngineStore } from '@/mods/mod-engine'
import { useRouter } from 'next/navigation'

import styles from './save-manager.module.css'

export default function SaveManagerPage() {
  const router = useRouter()
  const [saves, setSaves] = useState<SaveMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const refreshSaves = useCallback(() => {
    setSaves(saveManager.listSaves())
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSaves()
  }, [refreshSaves])

  const handleLoad = useCallback(async (slot: number) => {
    try {
      const data = await saveManager.loadSave(slot)
      if (data) {
        await orchestrator.waitForBackgroundCompression()
        applyGameSave(data)
        router.push(useEngineStore.getState().status === 'complete' ? '/game-over' : '/game-story')
      }
    } catch (err) {
      alert(`加载失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [router])

  const handleDelete = useCallback((slot: number) => {
    if (confirmDelete === slot) {
      saveManager.deleteSave(slot).then(() => {
        setConfirmDelete(null)
        refreshSaves()
      }).catch((err: unknown) => {
        alert(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
      })
    } else {
      setConfirmDelete(slot)
    }
  }, [confirmDelete, refreshSaves])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const autoSaves = saves.filter((s) => s.isAutoSave)
  const normalSaves = saves.filter((s) => !s.isAutoSave)

  return (
    <div className={styles.container}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.push('/welcome')}
            aria-label="返回欢迎页"
          >
            ← 返回
          </button>
          <h1 className={styles.title}>存档管理</h1>
          <span aria-hidden="true" />
        </header>

        {loading ? (
          <p className={styles.loading}>加载中...</p>
        ) : saves.length === 0 ? (
          <p className={styles.empty}>暂无本地模拟存档</p>
        ) : (
          <div className={styles.list}>
            {/* 自动存档 */}
            {autoSaves.map((slot) => {
              const isDelConfirm = confirmDelete === slot.slot
              return (
                <div
                  key={slot.slot}
                  className={`${styles.slot} ${styles.slotAuto} ${isDelConfirm ? styles.slotDeleteConfirm : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(slot.slot)}
                    className={styles.slotRow}
                    aria-label={`加载存档：${slot.name}，${slot.totalRounds}轮`}
                  >
                    <div>
                      <div className={`${styles.name} ${styles.nameAuto}`}>{slot.name}</div>
                      <div className={styles.meta}>
                        {slot.worldName || '未知'} / {slot.totalRounds}轮
                      </div>
                      <div className={styles.time}>{formatTime(slot.timestamp)}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(slot.slot) }}
                    title={isDelConfirm ? '再次点击确认删除此存档' : '删除此存档'}
                    className={`${styles.deleteBtn} ${isDelConfirm ? styles.deleteConfirmColor : ''}`}
                  >
                    {isDelConfirm ? '确认删除?' : '删除'}
                  </button>
                </div>
              )
            })}

            {/* 普通存档 */}
            {normalSaves.map((slot) => {
              const isDelConfirm = confirmDelete === slot.slot
              return (
                <div
                  key={slot.slot}
                  className={`${styles.slot} ${isDelConfirm ? styles.slotDeleteConfirm : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(slot.slot)}
                    className={styles.slotRow}
                    aria-label={`加载存档：${slot.name}，${slot.totalRounds}轮`}
                  >
                    <div>
                      <div className={styles.name}>{slot.name}</div>
                      <div className={styles.meta}>
                        {slot.worldName || '未知'} / {slot.characterName || '未知'} / {slot.totalRounds}轮
                      </div>
                      <div className={styles.time}>{formatTime(slot.timestamp)}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(slot.slot) }}
                    title={isDelConfirm ? '再次点击确认删除此存档' : '删除此存档'}
                    className={`${styles.deleteBtn} ${isDelConfirm ? styles.deleteConfirmColor : ''}`}
                  >
                    {isDelConfirm ? '确认删除?' : '删除'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
