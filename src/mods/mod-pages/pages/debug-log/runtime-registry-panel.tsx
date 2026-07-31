/**
 * @module runtime-registry-panel.tsx
 * @description RuntimeRegistry 只读调试视图（Factorio data.raw 等价物）
 * @mod mod-pages
 */

'use client'

import { useEffect, useState } from 'react'

import { runtimeRegistry } from '@/core'

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
      <div className="text-center py-16">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-[var(--color-text-secondary)]">
          RuntimeRegistry 尚未冻结
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
          请等待 InitMods 完成 lifecycle + onLoad
        </p>
      </div>
    )
  }

  const subsystemEntries = Object.entries(
    (snapshot.activeSubsystems as Record<string, { id: string; mod: string }>) ?? {},
  )

  return (
    <div className="space-y-4">
      <div className="text-sm text-[var(--color-text-secondary)]">
        冻结于 {String(snapshot.frozenAt)} ·{' '}
        {String(snapshot.modCount)} MOD ·{' '}
        {String(snapshot.subsystemCount)} 子系统
        <span className="text-[var(--color-text-tertiary)] ml-2">（每 2s 自动刷新）</span>
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold mb-2">加载顺序</h2>
        <p className="text-xs font-mono text-[var(--color-text-secondary)] break-all">
          {(snapshot.loadOrder as string[]).join(' → ')}
        </p>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold mb-2">已激活子系统</h2>
        <div className="grid gap-1 max-h-48 overflow-y-auto">
          {subsystemEntries.map(([id, binding]) => (
            <div key={id} className="flex justify-between text-xs font-mono">
              <span>{id}</span>
              <span className="text-[var(--color-text-tertiary)]">{binding.mod}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold mb-2">完整快照（JSON）</h2>
        <pre className="text-xs font-mono text-[var(--color-text-secondary)] whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>
    </div>
  )
}
