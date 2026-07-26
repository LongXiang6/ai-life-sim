'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { fetchLeaderboard } from '@/core/player-content/player-content-client'
import type { LeaderboardEntry } from '@/core/player-content/player-content-contract'
import { BottomActionBar } from '@/mods/mod-ui'

import styles from '../player-content/PlayerContent.module.css'

export default function LeaderboardPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void fetchLeaderboard()
      .then((result) => { if (active) setEntries(result) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '排行榜读取失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="final-flow-frame">
      <div className="final-flow-design-fit">
        <div className="final-flow-design-canvas">
          <main className={styles.page}>
            <div className={styles.screen}>
              <div className={styles.meta} aria-hidden="true"><span>AI LIFE SIM · 命书</span><span>附 · 排行</span></div>
              <header className={styles.header}><h1>人生排行榜</h1><p>百世留名</p></header>
              <section className={styles.content} aria-label="人生排行榜">
                {loading ? <p className={styles.status}>正在读取排行榜...</p> : null}
                {!loading && error ? <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p> : null}
                {!loading && !error && entries.length === 0 ? <p className={styles.status}>尚无人入榜</p> : null}
                {!loading && !error && entries.length > 0 ? (
                  <ol className={styles.entryList}>
                    {entries.map((entry) => (
                      <li className={styles.entry} key={entry.recordId}>
                        <div className={styles.entryTop}>
                          <span className={styles.rank}>{String(entry.rank).padStart(2, '0')}</span>
                          <span className={styles.entryCopy}>
                            <strong>{entry.characterName}</strong>
                            <small>{entry.username} · {entry.worldName}</small>
                          </span>
                          <span className={styles.score}><strong>{Math.round(entry.score)}</strong><small>评分</small></span>
                        </div>
                        <p className={styles.entryMeta}>{entry.finalAge} 岁 · {entry.rounds} 轮 · {new Date(entry.completedAt).toLocaleDateString('zh-CN')}</p>
                        <dl className={styles.dimensionGrid}>
                          {entry.dimensions.map((dimension) => (
                            <div key={dimension.id ?? dimension.label}>
                              <dt>{dimension.label}</dt>
                              <dd>{Math.round(dimension.value)}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className={styles.endingReview}>{entry.endingReview.review}</p>
                        {entry.portraitAssetUrl ? (
                          <Image
                            className={styles.leaderboardPortrait}
                            src={entry.portraitAssetUrl}
                            alt={`${entry.characterName}的人物画像`}
                            width={720}
                            height={720}
                            unoptimized
                          />
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>
            </div>
            <BottomActionBar
              onBack={() => router.back()}
              backTitle="返回上一页"
              onConfirm={() => router.push('/welcome')}
              confirmNumber="00"
              confirmText="返回欢迎界面"
              confirmDescription="回到欢迎界面"
              confirmTitle="返回欢迎界面"
            />
          </main>
        </div>
      </div>
    </div>
  )
}
