/** Purpose: Render the desktop console for AI exchange inspection. Owner: mod-pages. Responsibility: Save, round, call navigation, and full input/output detail only. */

'use client'

import { useMemo, useState } from 'react'

import styles from './debug-log.module.css'
import {
  formatCallKind,
  formatCount,
  formatShortTime,
  formatTime,
  getLifeRunId,
  pairProxyTraceEntries,
  type PlaintextLogEntry,
} from './debug-log-types'

interface SaveGroup {
  id: string
  label: string
  entries: PlaintextLogEntry[]
  latestAt: number
  rounds: number
}

interface RoundGroup {
  id: string
  entries: PlaintextLogEntry[]
  latestAt: number
}

function MessagePane({ title, value, tone }: { title: string; value: string | null; tone: 'input' | 'output' }) {
  const accent = tone === 'input' ? 'var(--color-info)' : 'var(--color-success)'
  const hasValue = Boolean(value)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-card)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
          <h3 className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-tertiary)]">{hasValue ? `${formatCount(value?.length ?? 0)} 字符` : '无记录'}</span>
      </header>
      <pre tabIndex={0} className={`${styles.scrollRegion} min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-[13px] leading-[1.65] text-[var(--color-text-primary)]`}>{hasValue ? value : '这一侧没有记录内容。'}</pre>
    </section>
  )
}

function StatCell({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 border-r border-[var(--color-border)] px-5 py-3 first:pl-0 last:border-r-0">
      <dt className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[17px] font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</dd>
      {detail ? <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">{detail}</p> : null}
    </div>
  )
}

function ActivityBars({ entries }: { entries: PlaintextLogEntry[] }) {
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>()
    entries.forEach((entry) => {
      const label = formatCallKind(entry.callKind)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4)
  }, [entries])
  const max = breakdown[0]?.[1] ?? 1

  return (
    <div className="min-w-0 px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">调用类型分布</span>
        <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">主要 {breakdown.length} 类</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {breakdown.map(([label, count]) => (
          <div key={label} className="grid grid-cols-[9rem_minmax(0,1fr)_2.2rem] items-center gap-2 text-[10px]">
            <span className="truncate text-[var(--color-text-secondary)]">{label}</span>
            <span className="h-1.5 overflow-hidden bg-[var(--color-bg-tertiary)]" aria-hidden="true"><span className="block h-full bg-[var(--color-primary)]" style={{ width: `${Math.max(8, Math.round((count / max) * 100))}%` }} /></span>
            <span className="text-right font-mono text-[var(--color-text-tertiary)]">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SaveRail({ groups, activeId, onSelect }: { groups: SaveGroup[]; activeId: string | null; onSelect: (id: string) => void }) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]" aria-label="存档列表" data-ai-save-rail>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div><h2 className="text-sm font-semibold text-[var(--color-text-primary)]">存档</h2><p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">AI 调用来源</p></div>
        <span className="font-mono text-xs text-[var(--color-text-tertiary)]">{formatCount(groups.length)}</span>
      </header>
      <div className={`${styles.scrollRegion} min-h-0 flex-1 overflow-y-auto p-3`} role="tablist" aria-label="人生存档">
        {groups.map((group) => {
          const selected = activeId === group.id
          return (
            <button key={group.id} type="button" role="tab" aria-selected={selected} onClick={() => onSelect(group.id)} title={group.id} className={`mb-1.5 w-full border-l-2 px-3 py-3 text-left transition-colors ${selected ? 'border-[var(--color-primary)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]' : 'border-transparent hover:bg-[var(--color-surface)]/70'}`}>
              <span className="flex items-center justify-between gap-2"><strong className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{group.label}</strong><span className="shrink-0 font-mono text-[11px] text-[var(--color-text-tertiary)]">{group.rounds} 轮</span></span>
              <span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-secondary)]">{group.id === 'unassigned' ? '未关联 ID' : group.id}</span>
              <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-tertiary)]"><span>{formatCount(group.entries.length)} 次调用</span><time dateTime={new Date(group.latestAt).toISOString()} title={formatTime(group.latestAt)}>{formatShortTime(group.latestAt)}</time></span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function CallNavigator({ save, rounds, activeRoundId, activeEntryId, onRoundSelect, onEntrySelect }: { save: SaveGroup; rounds: RoundGroup[]; activeRoundId: string | null; activeEntryId: string | null; onRoundSelect: (id: string) => void; onEntrySelect: (id: string) => void }) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]" aria-label="轮次和调用列表" data-ai-call-nav>
      <header className="shrink-0 border-b border-[var(--color-border)] px-5 py-4"><p className="truncate font-mono text-xs font-semibold text-[var(--color-text-primary)]" title={save.id}>{save.id}</p><p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{formatCount(save.entries.length)} 次调用 · {save.rounds} 轮</p></header>
      <div className={`${styles.scrollRegion} min-h-0 flex-1 overflow-y-auto p-3`}>
        <div className="mb-2 px-1 text-[11px] font-semibold text-[var(--color-text-tertiary)]">调用目录</div>
        {rounds.map((round) => {
          const roundSelected = activeRoundId === round.id
          return (
            <section key={round.id} className="mb-3 border border-[var(--color-border)] bg-[var(--color-surface)] last:mb-0">
              <button type="button" onClick={() => onRoundSelect(round.id)} className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left ${roundSelected ? 'bg-[var(--color-bg-tertiary)]' : 'hover:bg-[var(--color-bg-secondary)]'}`} aria-current={roundSelected ? 'step' : undefined}>
                <span><strong className="block text-[13px] font-semibold text-[var(--color-text-primary)]">{round.id === 'unknown' ? '未标记轮次' : `第 ${round.id} 轮`}</strong><span className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">{formatCount(round.entries.length)} 次调用</span></span><span className="text-[11px] text-[var(--color-text-tertiary)]" title={formatTime(round.latestAt)}>{formatShortTime(round.latestAt)}</span>
              </button>
              <div className="border-t border-[var(--color-border)] px-2 py-2">
                {round.entries.map((entry) => <button key={entry.id} type="button" onClick={() => onEntrySelect(entry.id)} aria-current={activeEntryId === entry.id ? 'true' : undefined} className={`mb-1 flex w-full items-center justify-between gap-2 border-l-2 px-3 py-2.5 text-left last:mb-0 ${activeEntryId === entry.id ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]' : 'border-transparent hover:bg-[var(--color-bg-secondary)]'}`}><span className="min-w-0 truncate text-xs text-[var(--color-text-primary)]">{formatCallKind(entry.callKind)}</span><span className={`shrink-0 font-mono text-[10px] ${entry.prompt && entry.response ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>{entry.prompt && entry.response ? '完整' : '部分'}</span></button>)}
              </div>
            </section>
          )
        })}
      </div>
    </aside>
  )
}

export function AiExchangeView({ entries, loading, error }: { entries: PlaintextLogEntry[]; loading: boolean; error: string | null }) {
  const [selectedSaveId, setSelectedSaveId] = useState<string | null>(null)
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  const exchanges = useMemo(() => pairProxyTraceEntries(entries), [entries])

  const saves = useMemo<SaveGroup[]>(() => {
    const grouped = new Map<string, PlaintextLogEntry[]>()
    exchanges.forEach((entry) => {
      const id = getLifeRunId(entry)
      grouped.set(id, [...(grouped.get(id) ?? []), entry])
    })
    return [...grouped.entries()].map(([id, group]) => ({
      id,
      label: id === 'unassigned' ? '未关联存档' : `存档 ${id.slice(-6)}`,
      entries: group,
      latestAt: Math.max(...group.map((entry) => entry.createdAt)),
      rounds: new Set(group.map((entry) => entry.round ?? 'unknown')).size,
    })).sort((left, right) => right.latestAt - left.latestAt)
  }, [exchanges])

  const activeSaveId = saves.some((save) => save.id === selectedSaveId) ? selectedSaveId : saves[0]?.id ?? null
  const activeSave = saves.find((save) => save.id === activeSaveId) ?? null
  const rounds = useMemo<RoundGroup[]>(() => {
    if (!activeSave) return []
    const grouped = new Map<string, PlaintextLogEntry[]>()
    activeSave.entries.forEach((entry) => {
      const id = entry.round === null ? 'unknown' : String(entry.round)
      grouped.set(id, [...(grouped.get(id) ?? []), entry])
    })
    return [...grouped.entries()].map(([id, group]) => ({ id, entries: group, latestAt: Math.max(...group.map((entry) => entry.createdAt)) })).sort((left, right) => {
      if (left.id === 'unknown') return 1
      if (right.id === 'unknown') return -1
      return Number(right.id) - Number(left.id)
    })
  }, [activeSave])

  const activeRoundId = rounds.some((round) => round.id === selectedRoundId) ? selectedRoundId : rounds[0]?.id ?? null
  const activeRound = rounds.find((round) => round.id === activeRoundId) ?? null
  const activeEntryId = activeRound?.entries.some((entry) => entry.id === selectedEntryId) ? selectedEntryId : activeRound?.entries[0]?.id ?? null
  const activeEntry = activeRound?.entries.find((entry) => entry.id === activeEntryId) ?? null
  const completeCount = exchanges.filter((entry) => Boolean(entry.prompt && entry.response)).length
  const roundCount = new Set(exchanges.map((entry) => entry.round ?? 'unknown')).size
  const inputChars = exchanges.reduce((sum, entry) => sum + (entry.prompt?.length ?? 0), 0)
  const outputChars = exchanges.reduce((sum, entry) => sum + (entry.response?.length ?? 0), 0)

  const selectSave = (id: string) => { setSelectedSaveId(id); setSelectedRoundId(null); setSelectedEntryId(null) }
  const selectRound = (id: string) => { setSelectedRoundId(id); setSelectedEntryId(null) }

  if (loading) return <div className="flex h-full min-h-0 items-center justify-center text-sm text-[var(--color-text-secondary)]">正在读取 AI 收发记录...</div>
  if (error) return <div className="m-6 border border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error)]" role="alert">{error}</div>
  if (!saves.length) return <div className="m-6 border border-dashed border-[var(--color-border)] px-4 py-16 text-center text-sm text-[var(--color-text-secondary)]">暂无核心叙事 AI 收发记录</div>

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      <section className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-6 py-3" aria-label="AI 收发统计">
        <div className="flex items-end justify-between gap-6"><div><h2 className="text-base font-semibold text-[var(--color-text-primary)]">AI 收发数据</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">按同一请求配对发送文本与对应返回。</p></div><div className="font-mono text-[10px] text-[var(--color-text-tertiary)]">已载入 {formatCount(exchanges.length)} 组调用</div></div>
        <dl className="mt-3 grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(18rem,1.35fr)] border-t border-[var(--color-border)] pt-1">
          <StatCell label="AI 调用" value={formatCount(exchanges.length)} detail="核心叙事范围" />
          <StatCell label="完整往返" value={formatCount(completeCount)} detail={exchanges.length ? `${Math.round((completeCount / exchanges.length) * 100)}% 完整` : '0% 完整'} />
          <StatCell label="存档" value={formatCount(saves.length)} detail="lifeRunId 分组" />
          <StatCell label="轮次" value={formatCount(roundCount)} detail="跨存档汇总" />
          <StatCell label="字符量" value={formatCount(inputChars + outputChars)} detail={`${formatCount(inputChars)} 输入 · ${formatCount(outputChars)} 输出`} />
          <ActivityBars entries={exchanges} />
        </dl>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-[15rem_18rem_minmax(34rem,1fr)]" data-ai-exchange-layout>
        <SaveRail groups={saves} activeId={activeSaveId} onSelect={selectSave} />
        {activeSave ? <CallNavigator save={activeSave} rounds={rounds} activeRoundId={activeRoundId} activeEntryId={activeEntryId} onRoundSelect={selectRound} onEntrySelect={setSelectedEntryId} /> : <div />}
        {activeEntry ? (
          <section className="flex min-h-0 min-w-0 flex-col bg-[var(--color-bg)]" aria-label="AI 调用详情" data-ai-detail>
            <header className="flex shrink-0 items-center justify-between gap-5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[var(--color-text-primary)]">{formatCallKind(activeEntry.callKind)}</span><span className="border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">{activeRound?.id === 'unknown' ? '轮次 ?' : `第 ${activeRound?.id} 轮`}</span><span className={`border px-2 py-1 font-mono text-[10px] ${activeEntry.prompt && activeEntry.response ? 'border-[var(--color-success)]/30 bg-[var(--color-success-bg)] text-[var(--color-success)]' : 'border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] text-[var(--color-warning)]'}`}>{activeEntry.prompt && activeEntry.response ? '完整' : '部分'}</span></div><p className="mt-1.5 truncate text-[11px] text-[var(--color-text-tertiary)]" title={activeSave?.id ?? undefined}>{formatTime(activeEntry.createdAt)} · {activeSave?.id ?? '未关联存档'}</p></div><div className="shrink-0 text-right font-mono text-[10px] leading-relaxed text-[var(--color-text-tertiary)]"><div>输入 {formatCount(activeEntry.prompt?.length ?? 0)} 字符</div><div>输出 {formatCount(activeEntry.response?.length ?? 0)} 字符</div></div></header>
            <div data-ai-messages className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-[var(--color-border)] p-px"><MessagePane title="发送给 AI" value={activeEntry.prompt} tone="input" /><MessagePane title="AI 返回" value={activeEntry.response} tone="output" /></div>
          </section>
        ) : <div />}
      </div>
    </div>
  )
}
