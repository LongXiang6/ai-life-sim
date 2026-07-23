/**
 * @module useSimulationBranch.ts
 * @description 命运分叉 Hook —— 对齐废弃项目 useSimulationBranch
 * @mod mod-pages
 */

'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

import { resolveNarrativeBranchChoice, setForceBranchNextRound } from '@/mods/mod-engine/engine-api'
import { useEngineStore } from '@/mods/mod-engine'
import { reportUsageMetric } from '@/core/logger/client-logger'
import { extractAggregateTerms } from '@/core/logger/usage-metrics'

interface UseSimulationBranchDeps {
  advanceRound: () => Promise<void>
}

export function useSimulationBranch({ advanceRound }: UseSimulationBranchDeps) {
  const narrativeHistory = useEngineStore((s) => s.narrativeHistory)
  const forceBranchNext = useEngineStore((s) => s.forceBranchNext)

  const [branchCustomText, setBranchCustomText] = useState('')
  const [selectedBranchOptionId, setSelectedBranchOptionId] = useState<string | null>(null)
  const confirmingBranchRef = useRef(false)

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

  const handleForceBranch = useCallback(() => {
    setForceBranchNextRound(!forceBranchNext)
  }, [forceBranchNext])

  const handleBranchConfirm = useCallback(async () => {
    if (unresolvedBranchIndex === null || confirmingBranchRef.current) return

    const selectedLabel = selectedBranchOptionId !== null
      ? branchOptions[Number(selectedBranchOptionId)]
      : undefined
    const choice = branchCustomText.trim() || selectedLabel?.trim()
    if (!choice) {
      console.warn('[useSimulationBranch] handleBranchConfirm: 未选择任何选项')
      return
    }

    // 使用 chunk id 而非数组下标解决分支（防御 narrativeHistory 裁剪后索引漂移）
    const branchEntry = narrativeHistory[unresolvedBranchIndex]
    const branchId = branchEntry?.id
    if (!branchId) {
      console.warn('[useSimulationBranch] handleBranchConfirm: branchEntry 缺少 id 字段')
      return
    }

    const isCustomChoice = Boolean(branchCustomText.trim())
    reportUsageMetric({
      schemaVersion: 1,
      kind: 'branch_choice',
      branchChoiceType: isCustomChoice ? 'custom' : 'preset',
      branchTerms: isCustomChoice ? extractAggregateTerms(choice) : undefined,
      branchChars: isCustomChoice ? choice.length : undefined,
    })

    confirmingBranchRef.current = true
    const resolved = resolveNarrativeBranchChoice(branchId, choice)
    if (!resolved) {
      confirmingBranchRef.current = false
      console.warn('[useSimulationBranch] handleBranchConfirm: 当前分支已失效，请重新选择')
      return
    }
    setBranchCustomText('')
    setSelectedBranchOptionId(null)

    try {
      await advanceRound()
    } finally {
      confirmingBranchRef.current = false
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
