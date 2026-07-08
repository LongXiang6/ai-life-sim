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

/** 圆角 Token — 映射到 [effects.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/effects.css) */
export const RADIUS_TOKENS = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
} as const

/** 动效 Token — 映射到 [effects.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/effects.css) */
export const MOTION_TOKENS = {
  durationFast: 'var(--duration-fast)',
  durationNormal: 'var(--duration-normal)',
  durationSlow: 'var(--duration-slow)',
  easeStandard: 'var(--ease-standard)',
  easeEmphasized: 'var(--ease-emphasized)',
} as const

/** Glass Token — 映射到 [effects.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/effects.css) */
export const GLASS_TOKENS = {
  surfaceBg: 'var(--glass-surface-bg)',
  elevatedBg: 'var(--glass-elevated-bg)',
  modalBg: 'var(--glass-modal-bg)',
  popoutBg: 'var(--glass-popout-bg)',
  border: 'var(--glass-border)',
  blurSurface: 'var(--glass-blur-surface)',
  blurElevated: 'var(--glass-blur-elevated)',
  blurModal: 'var(--glass-blur-modal)',
  blurPopout: 'var(--glass-blur-popout)',
} as const

/** 间距 Token — 映射到 [spacing.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/spacing.css) */
export const SPACING_TOKENS = {
  0: 'var(--spacing-0)',
  0.5: 'var(--spacing-0\\.5)',
  1: 'var(--spacing-1)',
  2: 'var(--spacing-2)',
  3: 'var(--spacing-3)',
  3.5: 'var(--spacing-3\\.5)',
  4: 'var(--spacing-4)',
  5: 'var(--spacing-5)',
  6: 'var(--spacing-6)',
  8: 'var(--spacing-8)',
  10: 'var(--spacing-10)',
  12: 'var(--spacing-12)',
  px12: 'var(--spacing-px-12)',
  px14: 'var(--spacing-px-14)',
  px16: 'var(--spacing-px-16)',
  px20: 'var(--spacing-px-20)',
  px24: 'var(--spacing-px-24)',
  px32: 'var(--spacing-px-32)',
} as const

/** 字体 Token — 映射到 [typography.css](file:///d:/AI/ai-life-sim/src/foundation/tokens/typography.css) */
export const TYPOGRAPHY_TOKENS = {
  fontSize: {
    xs: 'var(--font-size-xs)',
    '2xs': 'var(--font-size-2xs)',
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
export const MAX_WIDTH = 'var(--content-max-width)' as const

/** 页面级内边距 Token；BottomActionBar 与 PageScroll 共享，避免页面边缘不齐。 */
export const PAGE_PADDING = {
  mobile: 'var(--spacing-px-16) var(--spacing-px-16) var(--spacing-px-32)',
  desktop: 'var(--spacing-px-24) var(--spacing-px-24) var(--spacing-12)',
  bottomBar: 'var(--spacing-px-12) var(--spacing-px-24)',
} as const

/** 汇总所有 Token */
export const TOKENS = {
  color: COLOR_TOKENS,
  shadow: SHADOW_TOKENS,
  radius: RADIUS_TOKENS,
  motion: MOTION_TOKENS,
  glass: GLASS_TOKENS,
  spacing: SPACING_TOKENS,
  typography: TYPOGRAPHY_TOKENS,
  layout: {
    maxWidth: MAX_WIDTH,
    pagePadding: PAGE_PADDING,
  },
} as const

export type ColorToken = keyof typeof COLOR_TOKENS
export type ShadowToken = keyof typeof SHADOW_TOKENS
export type RadiusToken = keyof typeof RADIUS_TOKENS
export type MotionToken = keyof typeof MOTION_TOKENS
export type GlassToken = keyof typeof GLASS_TOKENS
export type SpacingToken = keyof typeof SPACING_TOKENS
export type FontSizeToken = keyof typeof TYPOGRAPHY_TOKENS.fontSize
export type FontWeightToken = keyof typeof TYPOGRAPHY_TOKENS.fontWeight
