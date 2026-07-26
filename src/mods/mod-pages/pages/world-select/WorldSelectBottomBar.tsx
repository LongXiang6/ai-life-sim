import type { WorldSelectLogic } from './world-select.types'

import { BottomActionBar } from '@/mods/mod-ui'

export function WorldSelectBottomBar({ logic }: { logic: WorldSelectLogic }) {
  const hint = logic.isConfirming
    ? '正在生成世界数据，请稍候'
    : logic.selectedWorld
      ? `${logic.selectedWorld.name} · 下一步世界配置`
      : '请先选择或创建一个世界'

  return <BottomActionBar
    onBack={logic.handleBack}
    backTitle={logic.LABELS.backTitle}
    backDisabled={logic.isConfirming}
    onConfirm={logic.handleConfirm}
    confirmNumber="02"
    confirmText={logic.isConfirming ? '正在确认世界' : '确认世界'}
    confirmDescription={hint}
    confirmDisabled={!logic.selectedWorld || logic.isConfirming}
    confirmTitle={logic.confirmTitle}
  />
}
