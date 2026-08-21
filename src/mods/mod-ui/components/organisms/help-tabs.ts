/** Purpose: Define the help workspace tab contract. Owner: mod-ui. Responsibility: Stable help tab IDs and display order only. */

export type HelpTab =
  | 'docs'
  | 'changelog'
  | 'qq-bot'
  | 'factorio-localizer'
  | 'novelist-sim'
  | 'wechat-advisor'

export type WorkspaceProjectHelpTab = Exclude<HelpTab, 'docs' | 'changelog'>

export const HELP_TABS: ReadonlyArray<{ id: HelpTab; label: string }> = [
  { id: 'docs', label: '说明' },
  { id: 'changelog', label: '更新日志' },
  { id: 'qq-bot', label: 'QQ群机器人' },
  { id: 'factorio-localizer', label: 'FACTORIO模组汉化器' },
  { id: 'novelist-sim', label: '小说模拟器' },
  { id: 'wechat-advisor', label: '微信聊天军师' },
]

export function isWorkspaceProjectHelpTab(tab: HelpTab): tab is WorkspaceProjectHelpTab {
  return tab !== 'docs' && tab !== 'changelog'
}
