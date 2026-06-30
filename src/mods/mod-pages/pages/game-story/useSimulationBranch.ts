/**
 * @module useSimulationBranch.ts
 * @description 命运分叉 Hook —— 对齐废弃项目 useSimulationBranch
 * @mod mod-pages
 */

'use client'

import { useCallback, useMemo, useState } from 'react'

import { clearPreGenQueue, orchestrator } from '@/mods/mod-engine/engine-api'
import { useEngineStore } from '@/mods/mod-engine'

interface UseSimulationBranchDeps {
  advanceRound: () => Promise<void>
}

export function useSimulationBranch({ advanceRound }: UseSimulationBranchDeps) {
  const narrativeHistory = useEngineStore((s) => s.narrativeHistory)
  const resolvedBranches = useEngineStore((s) => s.resolvedBranches)
  const forceBranchNext = useEngineStore((s) => s.forceBranchNext)
  const setForceBranchNext = useEngineStore((s) => s.setForceBranchNext)
  const resolveBranch = useEngineStore((s) => s.resolveBranch)

  const [branchCustomText, setBranchCustomText] = useState('')
  const [selectedBranchOptionId, setSelectedBranchOptionId] = useState<string | null>(null)

  const unresolvedBranchIndex = useMemo(() => {
    for (let i = narrativeHistory.length - 1; i >= 0; i--) {
      const entry = narrativeHistory[i]
      if (entry.isBranchPoint && resolvedBranches[i] === undefined) return i
    }
    return null
  }, [narrativeHistory, resolvedBranches])

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
    setForceBranchNext(!forceBranchNext)
    clearPreGenQueue()
  }, [forceBranchNext, setForceBranchNext])

  const handleBranchConfirm = useCallback(async () => {
    if (unresolvedBranchIndex === null) return

    const selectedLabel = selectedBranchOptionId !== null
      ? branchOptions[Number(selectedBranchOptionId)]
      : undefined
    const choice = branchCustomText.trim() || selectedLabel?.trim()
    if (!choice) return

    resolveBranch(unresolvedBranchIndex, choice)
    orchestrator.setLastPlayerChoice(choice)
    clearPreGenQueue()
    setBranchCustomText('')
    setSelectedBranchOptionId(null)

    await advanceRound()
  }, [
    unresolvedBranchIndex,
    branchOptions,
    selectedBranchOptionId,
    branchCustomText,
    resolveBranch,
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
