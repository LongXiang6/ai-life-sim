/** Purpose: Render character creation navigation actions. Owner: mod-pages. Responsibility: Page action presentation and event forwarding only. */

import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import { BottomActionBar } from '@/mods/mod-ui'

export function CharacterCreateBottomBar({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  const hint = logic.nextBlockReason ?? `${logic.name.trim()} · 进入命格抽取`

  return <BottomActionBar
    onBack={logic.handleBack}
    backTitle={logic.LABELS.backTitleMobile}
    backText="返回"
    backDescription="回到世界配置"
    onConfirm={logic.handleNext}
    confirmNumber="04"
    confirmText="确认角色"
    confirmDescription={hint}
    confirmDisabled={!logic.canProceed}
    confirmTitle={logic.nextBlockReason ?? undefined}
  />
}
