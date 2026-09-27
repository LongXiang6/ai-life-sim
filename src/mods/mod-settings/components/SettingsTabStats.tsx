'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { DEFAULT_AI_MODEL, getCacheStats, resetCacheStats } from '@/core/ai-service'
import {
  DEEPSEEK_PRICE_SOURCE,
  formatNanoYuan,
  getAiUsageStats,
  resetAiUsageStats,
  type AiUsageAggregate,
} from '@/core/ai-service/usage-stats'
import { fetchDeepSeekBalance, type DeepSeekBalanceSnapshot } from '@/core/ai-service'
import { useEngineStore } from '@/mods/mod-engine'

import { useSettingsStore } from '../store'

import styles from './SettingsTabStats.module.css'

function formatTokenCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('zh-CN')
}

function costLabel(aggregate: AiUsageAggregate | undefined): string {
  if (!aggregate) return '未知'
  const known = formatNanoYuan(aggregate.costNanoYuan)
  return aggregate.unknownUsageCalls > 0 || aggregate.unpricedCalls > 0
    ? `${known} + 未知`
    : known
}

function hitRateLabel(aggregate: AiUsageAggregate): string {
  const total = aggregate.hitTokens + aggregate.missTokens
  return total > 0 ? `${Math.round(aggregate.hitTokens / total * 10_000) / 100}%` : '0%'
}

function averageLatency(aggregate: AiUsageAggregate | undefined): number {
  if (!aggregate || aggregate.latencySamples <= 0) return 0
  return Math.round(aggregate.latencyMsTotal / aggregate.latencySamples)
}

export function SettingsTabStats() {
  const { provider, customKey, customUrl, customModel } = useSettingsStore()
  const [revision, setRevision] = useState(0)
  const [balance, setBalance] = useState<DeepSeekBalanceSnapshot | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState('')
  const compressionStats = useEngineStore((state) => state.compressionStats)

  const model = customModel || DEFAULT_AI_MODEL
  const canQueryBalance = provider === 'custom'
    && customKey.trim().length > 0
    && /^https:\/\/api\.deepseek\.com(?:\/|$)/iu.test(customUrl.trim())

  useEffect(() => {
    const update = () => setRevision((current) => current + 1)
    window.addEventListener('ai-usage-stats-updated', update)
    window.addEventListener('cache-stats-updated', update)
    return () => {
      window.removeEventListener('ai-usage-stats-updated', update)
      window.removeEventListener('cache-stats-updated', update)
    }
  }, [])

  const usage = useMemo(() => {
    void revision
    return getAiUsageStats()
  }, [revision])
  const run = usage.latestLifeRunId ? usage.runs[usage.latestLifeRunId] : undefined
  const cache = useMemo(() => {
    void revision
    return getCacheStats({ providerId: provider, model })
  }, [model, provider, revision])
  const poolEntries = Object.entries(run?.byPool ?? {}).sort(([left], [right]) => left.localeCompare(right))

  const loadBalance = useCallback(async (forceRefresh = false) => {
    if (!canQueryBalance) return
    setBalanceLoading(true)
    setBalanceError('')
    try {
      setBalance(await fetchDeepSeekBalance({
        apiKey: customKey,
        baseUrl: customUrl,
        forceRefresh,
      }))
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : 'DeepSeek 余额查询失败')
    } finally {
      setBalanceLoading(false)
    }
  }, [canQueryBalance, customKey, customUrl])

  useEffect(() => {
    if (!canQueryBalance) return
    const timer = window.setTimeout(() => { void loadBalance(false) }, 0)
    return () => window.clearTimeout(timer)
  }, [canQueryBalance, loadBalance])

  const resetCurrentStats = () => {
    resetCacheStats({ providerId: provider, model })
    resetAiUsageStats()
  }

  return (
    <div className={styles.tabRoot}>
      <section className={styles.section} aria-labelledby="settings-experience-heading">
        <div className={styles.sectionLabel}><h3 id="settings-experience-heading">体验概览</h3><span>当前存档</span></div>
        <div className={styles.sectionCard}>
          <div className={styles.metricGrid}>
            <div><span>已推进轮次</span><strong>{run?.latestRound ?? 0}</strong><small>{run?.latestRound ? `第 ${run.latestRound} 轮` : '尚未开始'}</small></div>
            <div><span>平均生成等待</span><strong>{formatTokenCount(averageLatency(run?.total))} ms</strong><small>完整响应平均耗时</small></div>
            <div><span>叙事压缩</span><strong>{compressionStats.lastSourceRound !== null ? `第 ${compressionStats.lastSourceRound} 轮` : '尚未压缩'}</strong><small>最近离开详细窗口的回合</small></div>
            <div><span>缓存命中</span><strong>{cache.hitRate}%</strong><small>减少重复输入费用</small></div>
          </div>
          <div className={styles.feedbackRow}>
            <span>遇到问题或想提出建议？</span>
            <button type="button" onClick={() => { window.location.href = '/feedback' }}>填写反馈</button>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-usage-heading">
        <div className={styles.sectionLabel}><h3 id="settings-usage-heading">本轮与存档</h3><span>{model}</span></div>
        <div className={styles.sectionCard}>
          <div className={styles.metricGrid}>
            <div><span>本轮费用</span><strong>{costLabel(run?.latestRoundUsage)}</strong><small>{run?.latestRound ? `第 ${run.latestRound} 轮` : '尚无轮次数据'}</small></div>
            <div><span>存档累计</span><strong>{costLabel(run?.total)}</strong><small>{run ? `${run.total.knownCalls} 次有用量返回` : '尚无存档数据'}</small></div>
            <div><span>输入 Token</span><strong>{formatTokenCount((run?.total.hitTokens ?? 0) + (run?.total.missTokens ?? 0))}</strong><small>命中 + 未命中</small></div>
            <div><span>输出 Token</span><strong>{formatTokenCount(run?.total.completionTokens ?? 0)}</strong><small>含思考 {formatTokenCount(run?.total.reasoningTokens ?? 0)}</small></div>
            <div><span>平均延迟</span><strong>{formatTokenCount(averageLatency(run?.total))} ms</strong><small>{formatTokenCount(run?.total.latencySamples ?? 0)} 次完整响应</small></div>
            <div><span>最大延迟</span><strong>{formatTokenCount(run?.total.latencyMaxMs ?? 0)} ms</strong><small>当前存档内</small></div>
          </div>
          {(run?.total.unknownUsageCalls ?? 0) > 0 ? <p className={styles.notice}>有 {run?.total.unknownUsageCalls} 次上游未返回 usage，对应费用保持未知。</p> : null}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-cache-heading">
        <div className={styles.sectionLabel}><h3 id="settings-cache-heading">缓存</h3><span>命中率 {cache.hitRate}%</span></div>
        <div className={styles.sectionCard}>
          <div className={styles.cacheRow}><span>命中 Token<strong>{formatTokenCount(cache.hitTokens)}</strong></span><span>未命中 Token<strong>{formatTokenCount(cache.missTokens)}</strong></span></div>
          <progress max={100} value={cache.hitRate} aria-label={`缓存命中率 ${cache.hitRate}%`} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-pool-heading">
        <div className={styles.sectionLabel}><h3 id="settings-pool-heading">调用池</h3><span>{poolEntries.length} 个</span></div>
        <div className={styles.sectionCard}>
          {poolEntries.length === 0 ? <p className={styles.empty}>暂无调用数据</p> : (
            <ul className={styles.poolList}>
              {poolEntries.map(([pool, aggregate]) => (
                <li key={pool}><span><strong>{pool}</strong><small>{hitRateLabel(aggregate)} 命中 · {formatTokenCount(aggregate.hitTokens)} / {formatTokenCount(aggregate.missTokens)} 输入 · {formatTokenCount(averageLatency(aggregate))} ms 平均</small></span><b>{costLabel(aggregate)}</b></li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-compression-heading">
        <div className={styles.sectionLabel}><h3 id="settings-compression-heading">叙事压缩</h3><span>{compressionStats.lastSourceRound !== null ? `最近第 ${compressionStats.lastSourceRound} 轮` : '尚未压缩'}</span></div>
        <div className={styles.sectionCard}>
          <div className={styles.metricGrid}>
            <div><span>已压缩回合</span><strong>{formatTokenCount(compressionStats.compressedRoundCount)}</strong><small>逐轮处理离开三轮窗口的故事</small></div>
            <div><span>最近来源回合</span><strong>{compressionStats.lastSourceRound ?? '-'}</strong><small>完整正文仍保留在故事历史</small></div>
            <div><span>近期窗口</span><strong>3 轮</strong><small>主故事读取最近三轮已结算结果</small></div>
            <div><span>最近完成</span><strong>{compressionStats.lastCompletedAt > 0 ? new Date(compressionStats.lastCompletedAt).toLocaleTimeString('zh-CN') : '-'}</strong><small>逐轮压缩提交时间</small></div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-balance-heading">
        <div className={styles.sectionLabel}><h3 id="settings-balance-heading">DeepSeek 余额</h3><span>{balance?.isAvailable ? '可用' : '实时账户'}</span></div>
        <div className={styles.sectionCard}>
          {!canQueryBalance ? <p className={styles.empty}>使用自己的 DeepSeek 官方 API Key 后显示余额。</p> : null}
          {canQueryBalance && balanceLoading && !balance ? <p className={styles.empty}>正在查询余额...</p> : null}
          {balance ? (
            <ul className={styles.balanceList}>
              {balance.balances.map((item) => <li key={item.currency}><span>{item.currency}</span><strong>{item.totalBalance}</strong><small>赠送 {item.grantedBalance} · 充值 {item.toppedUpBalance}</small></li>)}
            </ul>
          ) : null}
          {balanceError ? <p className={styles.error} role="alert">{balanceError}</p> : null}
          {canQueryBalance ? <div className={styles.actionRow}><small>{balance ? `查询于 ${new Date(balance.fetchedAt).toLocaleString('zh-CN')}` : ''}</small><button type="button" onClick={() => void loadBalance(true)} disabled={balanceLoading}>{balanceLoading ? '查询中' : '刷新余额'}</button></div> : null}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-price-heading">
        <div className={styles.sectionLabel}><h3 id="settings-price-heading">统计口径</h3><span>{usage.priceVersion}</span></div>
        <div className={styles.sectionCard}>
          <p className={styles.notice}>金额按命中输入、未命中输入和输出 Token 计算；思考 Token 已包含在输出中，不重复计费。</p>
          <div className={styles.actionRow}><a href={DEEPSEEK_PRICE_SOURCE} target="_blank" rel="noreferrer">官方价格</a><button type="button" onClick={resetCurrentStats}>重置统计</button></div>
        </div>
      </section>
    </div>
  )
}
