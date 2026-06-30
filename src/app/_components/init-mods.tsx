'use client'

/**
 * @module InitMods
 * @description MOD 加载入口 —— 轻量壳，重逻辑延迟 dynamic import
 * @mod app
 */

import { useEffect } from 'react'

import { useGlobalStore } from '@/core/global-store'
import { installGlobalLogHandlers } from '@/core/logger/client-logger'

/**
 * InitMods —— 挂载后异步加载 init-mods-bootstrap，避免 18 MOD 进入根布局首屏编译图
 */
export function InitMods({ children }: { children: React.ReactNode }) {
  const setModRoutesReady = useGlobalStore((s) => s.setModRoutesReady)
  const setAllModsLoaded = useGlobalStore((s) => s.setAllModsLoaded)

  useEffect(() => {
    installGlobalLogHandlers()
    let cancelled = false

    void (async () => {
      const { registerModRoutes } = await import('./init-mods-routes')
      const result = await registerModRoutes()
      if (cancelled) return

      if (result.loaded.length > 0 && result.errors.length === 0) {
        setModRoutesReady(true)
        // 让出主线程一帧，先绘制 welcome 再拉取重 bootstrap 包
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => { resolve() })
        })
      }

      if (cancelled) return

      const { runModBootstrap } = await import('./init-mods-bootstrap')
      if (cancelled) return

      await runModBootstrap({
        setModRoutesReady,
        setAllModsLoaded,
        isCancelled: () => cancelled,
        loadResult: result,
        skipRouteRegistration: true,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [setAllModsLoaded, setModRoutesReady])

  return <>{children}</>
}
