import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import { BottomActionBar } from '@/mods/mod-ui'

export function CharacterCreateBottomBar({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  const hint = logic.nextBlockReason ?? `${logic.name.trim()} · 进入命格抽取`

  return <BottomActionBar
    onBack={logic.handleBack}
    backTitle={logic.LABELS.backTitleMobile}
    onConfirm={logic.handleNext}
    confirmNumber="04"
    confirmText="确认角色"
    confirmDescription={hint}
    confirmDisabled={!logic.canProceed}
    confirmTitle={logic.nextBlockReason ?? undefined}
  />
}
