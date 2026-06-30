/**
 * @module tokens.ts
 * @description Design Token 绑定 —— JavaScript/TypeScript 侧引用 Design Token CSS 变量
 * @mod mod-ui
 *
 * 用途：
 *   1. 提供类型安全的 Design Token 常量，供组件和页面在 JS 中引用
 *   2. 映射 CSS 变量名到 JS 常量，避免拼写错误
 *   3. 主题相关 Token（如主色、背景色）通过 CSS 变量间接支持主题切换
 *
 * 使用方式：
 *   import { TOKENS } from '@/mods/mod-ui'
 *   const primaryColor = TOKENS.color.primary // → 'var(--color-primary)'
 */

/** 颜色 Token — 映射到 [colors.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/colors.css) 中的变量 */
export const COLOR_TOKENS = {
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  primaryLight: 'var(--color-primary-light)',
  secondary: 'var(--color-secondary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
  errorBg: 'var(--color-error-bg)',
  bg: 'var(--color-bg)',
  bgPrimary: 'var(--color-bg-primary)',
  bgSecondary: 'var(--color-bg-secondary)',
  bgTertiary: 'var(--color-bg-tertiary)',
  surface: 'var(--color-surface)',
  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  textTertiary: 'var(--color-text-tertiary)',
  border: 'var(--color-border)',
  borderFocus: 'var(--color-border-focus)',
  borderHover: 'var(--color-border-hover)',
  accentGlow: 'var(--color-accent-glow)',
} as const

/** 阴影 Token */
export const SHADOW_TOKENS = {
  sm: 'var(--shadow-sm)',
  default: 'var(--shadow)',
  lg: 'var(--shadow-lg)',
} as const

/** 间距 Token — 映射到 [spacing.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/spacing.css) */
export const SPACING_TOKENS = {
  0: 'var(--spacing-0)',
  0.5: 'var(--spacing-0\\.5)',
  1: 'var(--spacing-1)',
  2: 'var(--spacing-2)',
  3: 'var(--spacing-3)',
  4: 'var(--spacing-4)',
  5: 'var(--spacing-5)',
  6: 'var(--spacing-6)',
  8: 'var(--spacing-8)',
  10: 'var(--spacing-10)',
  12: 'var(--spacing-12)',
} as const

/** 字体 Token — 映射到 [typography.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/typography.css) */
export const TYPOGRAPHY_TOKENS = {
  fontSize: {
    xs: 'var(--font-size-xs)',
    sm: 'var(--font-size-sm)',
    base: 'var(--font-size-base)',
    lg: 'var(--font-size-lg)',
    xl: 'var(--font-size-xl)',
    '2xl': 'var(--font-size-2xl)',
    '3xl': 'var(--font-size-3xl)',
  },
  fontWeight: {
    normal: 'var(--font-weight-normal)',
    medium: 'var(--font-weight-medium)',
    semibold: 'var(--font-weight-semibold)',
    bold: 'var(--font-weight-bold)',
  },
} as const

/** 布局 Token — 映射到 [layout.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/layout.css) */
export const MAX_WIDTH = '800px' as const

/** 汇总所有 Token */
export const TOKENS = {
  color: COLOR_TOKENS,
  shadow: SHADOW_TOKENS,
  spacing: SPACING_TOKENS,
  typography: TYPOGRAPHY_TOKENS,
} as const

export type ColorToken = keyof typeof COLOR_TOKENS
export type ShadowToken = keyof typeof SHADOW_TOKENS
export type SpacingToken = keyof typeof SPACING_TOKENS
export type FontSizeToken = keyof typeof TYPOGRAPHY_TOKENS.fontSize
export type FontWeightToken = keyof typeof TYPOGRAPHY_TOKENS.fontWeight
