/**
 * Purpose: Expose the shared theme Provider, store, and theme contracts.
 * Owner: core/theme
 * Responsibility: Provide one public theme entry point for app and feature modules.
 *
 * @module index.ts
 * @description 主题服务统一导出
 * @mod core
 */

export { ThemeProvider } from './theme-provider'
export {
  DEFAULT_THEME,
  normalizeTheme,
  THEME_LABELS,
  THEME_TYPES,
  useThemeStore,
} from './theme-store'
export type { ThemeType } from './theme-store'
