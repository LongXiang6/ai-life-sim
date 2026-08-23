/** Purpose: Render the read-only runtime registry console. Owner: mod-pages. Responsibility: RuntimeRegistry snapshot presentation only. */

/**
 * @module runtime-registry-panel.tsx
 * @description RuntimeRegistry 只读调试视图（Factorio data.raw 等价物）
 * @mod mod-pages
 */

'use client'

import { useEffect, useState } from 'react'

import { runtimeRegistry } from '@/core'

import styles from './debug-log.module.css'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7rem] border-l border-[var(--color-border)] pl-4 first:border-l-0 first:pl-0">
      <dt className="text-[10px] text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</dd>
    </div>
  )
}

export function RuntimeRegistryPanel() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 2000)
    return () => window.clearInterval(timer)
  }, [])

  const frozen = runtimeRegistry.isFrozen()
  const snapshot = runtimeRegistry.toDebugView()

  if (!frozen || !snapshot) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--color-bg)]">
        <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-warning)]" aria-hidden="true" /><h2 className="text-sm font-semibold text-[var(--color-text-primary)]">运行时注册表</h2></div>
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">只读查看 InitMods 完成后的模块与子系统绑定</p>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="w-full max-w-xl border border-[var(--color-warning)] bg-[var(--color-warning-bg)] px-5 py-4">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">RuntimeRegistry 尚未冻结</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">请等待 InitMods 完成 lifecycle + onLoad。此面板会每 2 秒自动检查状态。</p>
          </div>
        </div>
      </div>
    )
  }

  const subsystemEntries = Object.entries(
    (snapshot.activeSubsystems as Record<string, { id: string; mod: string }>) ?? {},
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--color-bg)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center justify-between gap-5 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-success)]" aria-hidden="true" /><h2 className="text-sm font-semibold text-[var(--color-text-primary)]">运行时注册表</h2></div>
            <p className="mt-1 truncate text-[11px] text-[var(--color-text-tertiary)]">冻结于 {String(snapshot.frozenAt)} · 每 2 秒自动刷新</p>
          </div>
          <dl className="flex shrink-0 items-start gap-5 text-right"><Metric label="MOD" value={String(snapshot.modCount)} /><Metric label="子系统" value={String(snapshot.subsystemCount)} /></dl>
        </div>
      </header>

      <div className={`${styles.scrollRegion} min-h-0 flex-1 overflow-auto`}>
        <div className="grid min-w-[760px] grid-cols-[minmax(20rem,1fr)_minmax(22rem,1.2fr)] gap-px bg-[var(--color-border)]">
          <section className="min-w-0 bg-[var(--color-bg)]">
            <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2.5"><h3 className="text-xs font-semibold text-[var(--color-text-primary)]">加载顺序</h3><p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">模块按此顺序完成注册</p></header>
            <div className={`${styles.scrollRegion} max-h-48 overflow-auto px-4 py-3`}>
              <code className="block whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">{(snapshot.loadOrder as string[]).join(' → ')}</code>
            </div>
          </section>

          <section className="min-w-0 bg-[var(--color-bg)]">
            <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2.5"><h3 className="text-xs font-semibold text-[var(--color-text-primary)]">已激活子系统</h3><p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">当前只读绑定关系</p></header>
            <div className={`${styles.scrollRegion} max-h-48 overflow-auto`}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(10rem,0.6fr)] border-b border-[var(--color-border)] px-4 py-2 text-[10px] font-semibold text-[var(--color-text-tertiary)]"><span>子系统</span><span>MOD</span></div>
              {subsystemEntries.length ? subsystemEntries.map(([id, binding]) => <div key={id} className="grid grid-cols-[minmax(0,1fr)_minmax(10rem,0.6fr)] gap-3 border-b border-[var(--color-border)] px-4 py-2 last:border-b-0"><span className="truncate font-mono text-xs text-[var(--color-text-primary)]" title={id}>{id}</span><span className="truncate font-mono text-[11px] text-[var(--color-text-secondary)]" title={binding.mod}>{binding.mod}</span></div>) : <p className="px-4 py-4 text-xs text-[var(--color-text-tertiary)]">暂无激活子系统</p>}
            </div>
          </section>

          <section className="min-w-0 bg-[var(--color-bg)] [grid-column:1/-1]">
            <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2.5"><div><h3 className="text-xs font-semibold text-[var(--color-text-primary)]">完整快照（JSON）</h3><p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">用于检查注册表的最终只读投影</p></div><span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">只读</span></header>
            <pre tabIndex={0} className={`${styles.scrollRegion} max-h-[34rem] overflow-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]`}>{JSON.stringify(snapshot, null, 2)}</pre>
          </section>
        </div>
      </div>
    </div>
  )
}
