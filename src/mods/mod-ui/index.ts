/** Purpose: Export the mod-ui public API. Owner: mod-ui. Responsibility: Public UI exports only. */

export { useIsMobile } from '@/foundation'

export type { ComponentSize, ComponentVariant, BaseComponentProps } from './types'

export { Button } from './components/atoms/Button'
export type { ButtonProps } from './components/atoms/Button'

export { Input } from './components/atoms/Input'
export type { InputProps } from './components/atoms/Input'

export { Select } from './components/atoms/Select'
export type { SelectProps, SelectOption } from './components/atoms/Select'

export { Dropdown } from './components/atoms/Dropdown'

export { Badge } from './components/atoms/Badge'
export type { BadgeProps } from './components/atoms/Badge'

export { Spinner } from './components/atoms/Spinner'
export type { SpinnerProps } from './components/atoms/Spinner'

export { ProgressBar } from './components/atoms/ProgressBar'
export type { ProgressBarProps } from './components/atoms/ProgressBar'

export { FlowRunningHead } from './components/atoms/FlowRunningHead'
export type { FlowRunningHeadProps } from './components/atoms/FlowRunningHead'

export { Card } from './components/molecules/Card'
export type { CardProps } from './components/molecules/Card'

export { FormField } from './components/molecules/FormField'
export type { FormFieldProps } from './components/molecules/FormField'

export { Modal } from './components/molecules/Modal'
export type { ModalProps } from './components/molecules/Modal'

export { Tabs } from './components/molecules/Tabs'
export type { TabsProps, TabItem } from './components/molecules/Tabs'

export { Toggle } from './components/molecules/Toggle'
export type { ToggleProps, ToggleOption } from './components/molecules/Toggle'

export { TimeStepSelector } from './components/molecules/TimeStepSelector'
export type { TimeStepSelectorProps } from './components/molecules/TimeStepSelector'

export { RadarChart, DEFAULT_DIMENSIONS } from './components/molecules/RadarChart'
export type { RadarChartProps, RadarDimension } from './components/molecules/RadarChart'

export { ToastContainer } from './components/molecules/Toast'
export type { ToastItem, ToastContainerProps } from './components/molecules/Toast'

export { ActionMenu } from './components/molecules/ActionMenu'
export type { ActionMenuProps, ActionMenuItem } from './components/molecules/ActionMenu'

export { useToastStore } from './store'

export { PageShell } from './components/organisms/PageShell'
export type { PageShellProps } from './components/organisms/PageShell'

export { PageScroll } from './components/organisms/PageScroll'
export type { PageScrollProps } from './components/organisms/PageScroll'

export { BottomActionBar } from './components/organisms/BottomActionBar'
export type { BottomActionBarProps } from './components/organisms/BottomActionBar'

export { HelpModal } from './components/organisms/HelpModal'
export type { HelpModalProps } from './components/organisms/HelpModal'

export { SaveDialog } from './components/molecules/SaveDialog'

export { DisclaimerModal, isDisclaimerAccepted, acceptDisclaimer } from './components/organisms/DisclaimerModal'
export type { DisclaimerModalProps } from './components/organisms/DisclaimerModal'

// ---- 新增游戏模拟页组件 ----

export { CharacterStatusBar } from './components/organisms/CharacterStatusBar'
export type { CharacterStatusBarProps, TalentInfo, BaseAttributes, DynamicAttributes } from './components/organisms/CharacterStatusBar'

export { WorldInfoPanel } from './components/organisms/WorldInfoPanel'
export type { WorldInfoPanelProps } from './components/organisms/WorldInfoPanel'

export { NarrativeTimeline } from './components/organisms/NarrativeTimeline'
export type {
  NarrativeTimelineProps,
  NarrativeEntry,
  NarrativeDestinyPatternGrowthEntry,
  NarrativeDestinyPatternGrowthPatternEntry,
} from './components/organisms/NarrativeTimeline'

export { GameBottomBar, DEFAULT_TIME_STEPS } from './components/organisms/GameBottomBar'
export type { GameBottomBarProps, TimeStepOption } from './components/organisms/GameBottomBar'

export { MoreActionsModal } from './components/organisms/MoreActionsModal'
export type { MoreActionsModalProps } from './components/organisms/MoreActionsModal'

export { AttributeTag } from './components/molecules/AttributeTag'
export type { AttributeTagProps } from './components/molecules/AttributeTag'

export { TalentBadge } from './components/molecules/TalentBadge'
export type { TalentBadgeProps, TalentRarity } from './components/molecules/TalentBadge'

export { PageErrorBoundary } from './components/organisms/PageErrorBoundary'
export type { PageErrorBoundaryProps } from './components/organisms/PageErrorBoundary'


export { TOKENS, COLOR_TOKENS, SPACING_TOKENS, TYPOGRAPHY_TOKENS, MAX_WIDTH, PAGE_PADDING } from './tokens'
export type { ColorToken, SpacingToken, FontSizeToken, FontWeightToken } from './tokens'
