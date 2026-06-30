/**
 * @file page.tsx
 * @description 首页 —— 重定向到 mod-pages 的首页
 * @mod app
 */

import { redirect } from 'next/navigation'

const DEFAULT_PAGE = '/welcome'

export default function Home() {
  redirect(DEFAULT_PAGE)
}
