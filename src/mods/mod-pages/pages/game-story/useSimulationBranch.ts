/**
 * @module useSimulationBranch.ts
 * @description 命运分叉 Hook —— 对齐废弃项目 useSimulationBranch
 * @mod mod-pages
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveNarrativeBranchChoice, setForceBranchNextRound } from '@/mods/mod-engine/engine-api'
import { useEngineStore } from '@/mods/mod-engine'

interface UseSimulationBranchDeps {
  advanceRound: () => Promise<void>
}

export function useSimulationBranch({ advanceRound }: UseSimulationBranchDeps) {
  const narrativeHistory = useEngineStore((s) => s.narrativeHistory)
  const forceBranchNext = useEngineStore((s) => s.forceBranchNext)

  const [branchCustomText, setBranchCustomText] = useState('')
  const [selectedBranchOptionId, setSelectedBranchOptionId] = useState<string | null>(null)
  const confirmingBranchRef = useRef(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const unresolvedBranchIndex = useMemo(() => {
    // 直接读 chunk 自带的 resolvedChoice 判断是否已解决：该字段随条目移动，
    // narrativeHistory 超长被裁剪后仍正确；而 resolvedBranches[i] 用数组下标，裁剪后会错位。
    for (let i = narrativeHistory.length - 1; i >= 0; i--) {
      const entry = narrativeHistory[i]
      if (entry.isBranchPoint && entry.resolvedChoice === undefined) return i
    }
    return null
  }, [narrativeHistory])

  const hasUnresolvedBranch = unresolvedBranchIndex !== null

  const branchEntry = unresolvedBranchIndex !== null
    ? narrativeHistory[unresolvedBranchIndex]
    : null

  const branchTitle = branchEntry?.branchTitle ?? '命运分叉点'
  const branchOptions = useMemo(
    () => branchEntry?.branchOptions ?? [],
    [branchEntry?.branchOptions],
  )

  // 当未解决分支变化时，重置确认锁（防止上次失败后 ref 卡死）
  useEffect(() => {
    confirmingBranchRef.current = false
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
    }
  }, [unresolvedBranchIndex])

  const handleForceBranch = useCallback(() => {
    setForceBranchNextRound(!forceBranchNext)
  }, [forceBranchNext])

  const handleBranchConfirm = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (unresolvedBranchIndex === null) {
      return { ok: false, error: '当前没有待解决的命运分叉' }
    }
    if (confirmingBranchRef.current) {
      return { ok: false, error: '正在处理中，请稍候' }
    }

    const selectedLabel = selectedBranchOptionId !== null
      ? branchOptions[Number(selectedBranchOptionId)]
      : undefined
    const choice = branchCustomText.trim() || selectedLabel?.trim()
    if (!choice) {
      return { ok: false, error: '请先选择一个选项或写下你的做法' }
    }

    // 使用 chunk id 而非数组下标解决分支（防御 narrativeHistory 裁剪后索引漂移）
    const branchEntry = narrativeHistory[unresolvedBranchIndex]
    const branchId = branchEntry?.id
    if (!branchId) {
      return { ok: false, error: '分支数据异常，请尝试刷新页面' }
    }

    confirmingBranchRef.current = true
    // 安全超时：若 advanceRound 挂起，10 秒后自动解锁
    confirmTimerRef.current = setTimeout(() => {
      confirmingBranchRef.current = false
      confirmTimerRef.current = null
    }, 10_000)

    const resolved = resolveNarrativeBranchChoice(branchId, choice)
    if (!resolved) {
      confirmingBranchRef.current = false
      if (confirmTimerRef.current !== null) {
        clearTimeout(confirmTimerRef.current)
        confirmTimerRef.current = null
      }
      return { ok: false, error: '当前分支已失效或选择内容未通过校验' }
    }
    setBranchCustomText('')
    setSelectedBranchOptionId(null)

    try {
      await advanceRound()
      return { ok: true }
    } catch {
      return { ok: false, error: '故事推进失败，请重试' }
    } finally {
      confirmingBranchRef.current = false
      if (confirmTimerRef.current !== null) {
        clearTimeout(confirmTimerRef.current)
        confirmTimerRef.current = null
      }
    }
  }, [
    unresolvedBranchIndex,
    narrativeHistory,
    branchOptions,
    selectedBranchOptionId,
    branchCustomText,
    advanceRound,
  ])

  const handleBranchCancel = useCallback(() => {
    setBranchCustomText('')
    setSelectedBranchOptionId(null)
  }, [])

  return {
    unresolvedBranchIndex,
    hasUnresolvedBranch,
    branchTitle,
    branchOptions,
    forceBranchNext,
    handleForceBranch,
    handleBranchConfirm,
    handleBranchCancel,
    branchCustomText,
    setBranchCustomText,
    selectedBranchOptionId,
    setSelectedBranchOptionId,
  }
}
