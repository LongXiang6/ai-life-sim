/**
 * @module font-config.ts
 * @description 字体配置 —— 12 种字体选择 + useFontFamily Hook
 * @mod core
 *
 * 废弃项目参考：src/hooks/useFontFamily.ts
 */

import { useEffect } from 'react'

/** 字体配置 */
export interface FontConfig {
  id: string
  label: string
  /** CSS font-family 值 */
  fontFamily: string
  /** 字体分类 */
  category: 'sans-serif' | 'serif' | 'monospace' | 'decorative',
}

/** 7 种常用字体配置 */
export const FONT_CONFIGS: FontConfig[] = [
  {
    id: 'default',
    label: '默认',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    category: 'sans-serif',
  },
  {
    id: 'pingfang',
    label: '苹方',
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    category: 'sans-serif',
  },
  {
    id: 'yahei',
    label: '微软雅黑',
    fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
    category: 'sans-serif',
  },
  {
    id: 'source-han-sans',
    label: '思源黑体',
    fontFamily: '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
    category: 'sans-serif',
  },
  {
    id: 'songti',
    label: '宋体',
    fontFamily: '"SimSun", "STSong", "Source Han Serif SC", serif',
    category: 'serif',
  },
  {
    id: 'heiti',
    label: '黑体',
    fontFamily: '"SimHei", "STHeiti", "Microsoft YaHei", sans-serif',
    category: 'sans-serif',
  },
  {
    id: 'kaiti',
    label: '楷体',
    fontFamily: '"KaiTi", "STKaiti", "AR PL UKai CN", serif',
    category: 'serif',
  },
]

/**
 * 根据字体 ID 获取 CSS font-family
 *
 * @param fontId - 字体配置 ID
 * @returns CSS font-family 字符串
 */
export function getFontFamilyCSS(fontId: string): string {
  const config = FONT_CONFIGS.find((f) => f.id === fontId)
  return config?.fontFamily ?? FONT_CONFIGS[0].fontFamily
}

/**
 * 将字体 ID 应用到 document
 *
 * @param fontId - 字体配置 ID
 */
export function applyFontToDocument(fontId: string): void {
  if (typeof document === 'undefined') return
  const css = getFontFamilyCSS(fontId)
  document.documentElement.style.setProperty('--font-family-sans', css)
}

/**
 * 字体切换 Hook —— 监听 fontId 变化并应用到 document
 *
 * @param fontId - 字体配置 ID
 */
export function useFontFamily(fontId: string): void {
  useEffect(() => {
    applyFontToDocument(fontId)
  }, [fontId])
}

