import { BottomActionBar } from '@/mods/mod-ui'

export function WorldCustomizeBottomBar({
  onBack,
  onConfirm,
  isSaving,
  canConfirm,
  blockedReason,
  worldName,
}: {
  onBack: () => void
  onConfirm: () => void
  isSaving: boolean
  canConfirm: boolean
  blockedReason: string | null
  worldName: string
}) {
  const disabled = isSaving || !canConfirm
  const hint = isSaving
    ? '正在校准规则与世界数据，请稍候'
    : blockedReason ?? `${worldName} · 下一步塑造角色`

  return <BottomActionBar
    onBack={onBack}
    backTitle="返回世界选择"
    backDisabled={isSaving}
    onConfirm={onConfirm}
    confirmNumber="03"
    confirmText={isSaving ? '正在初始化世界' : '确认世界'}
    confirmDescription={hint}
    confirmDisabled={disabled}
    confirmTitle={blockedReason ?? undefined}
  />
}
