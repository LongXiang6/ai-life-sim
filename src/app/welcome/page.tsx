/** Purpose: Render the welcome screen through a stable app route. Owner: app:welcome. Responsibility: Keep the first screen independent from client-side MOD route registration. */

/**
 * @file welcome/page.tsx
 * @description 欢迎页稳定入口
 * @mod app
 */

import WelcomePage from '@/mods/mod-pages/pages/welcome/page'

export default function WelcomeRoute() {
  return <WelcomePage />
}
