'use client'

/**
 * @file [...mod-page]/page.tsx
 * @description MOD 页面路由分发（catch-all，Client Component）
 * @mod app
 */

import { useEffect, useState, Suspense } from 'react'

import { useParams } from 'next/navigation'

import { modRegistry } from '@/core/mod-loader/mod-registry'
import { useGlobalStore } from '@/core/global-store'

function NotFoundView({ path }: { path: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-6 text-6xl leading-none select-none">—</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          页面未注册
        </h1>
        <p className="text-sm leading-relaxed text-[var(--flow-muted)] mb-1">
          路径 <code className="text-[var(--flow-ink)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-xs">{path}</code> 未在任何 MOD 的 routes 中注册
        </p>
        <p className="text-xs text-[var(--flow-faint)]">
          请在 manifest.ts 的 routes 中添加此路径
        </p>
      </div>
    </div>
  )
}

function LoadErrorView({ path, modName, pagePath }: { path: string; modName: string; pagePath: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-6 text-6xl leading-none select-none">—</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          页面加载失败
        </h1>
        <p className="text-sm leading-relaxed text-[var(--flow-muted)] mb-1">
          路径 <code className="text-[var(--flow-ink)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-xs">{path}</code>
        </p>
        <p className="text-xs text-[var(--flow-faint)]">
          MOD <span className="font-medium text-[var(--flow-muted)]">&quot;{modName}&quot;</span> 的页面 <span className="font-medium text-[var(--flow-muted)]">&quot;{pagePath}&quot;</span> 未能加载
        </p>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-sm text-[var(--flow-faint)]">加载中…</div>
    </div>
  )
}

function ModPageLoader({ path, route }: { path: string; route: ReturnType<typeof modRegistry.getRoute> }) {
  const [PageComponent, setPageComponent] = useState<React.ComponentType | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!route) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 路由表就绪但无匹配项
      setLoaded(true)
      return
    }

    const { modName, pagePath } = route
    let cancelled = false

    import(`@/mods/${modName}/pages/${pagePath}/page.tsx`)
      .then((mod) => {
        if (!cancelled) {
          setPageComponent(() => mod.default)
          setLoaded(true)
        }
      })
      .catch((err) => {
        console.error(`[ModPage] 页面加载失败: ${modName}/${pagePath}`, err)
        if (!cancelled) {
          setLoaded(true)
        }
      })

    return () => { cancelled = true }
  }, [route, path])

  if (!loaded) {
    return <LoadingFallback />
  }

  if (!route) {
    return <NotFoundView path={path} />
  }

  if (PageComponent) {
    return <PageComponent />
  }

  return (
    <LoadErrorView
      path={path}
      modName={route.modName}
      pagePath={route.pagePath}
    />
  )
}

function ModPageContent() {
  const params = useParams()
  const modRoutesReady = useGlobalStore((s) => s.modRoutesReady)

  const segments = params['mod-page'] as string[] | undefined
  const path = segments && segments.length > 0 ? '/' + segments.join('/') : '/'
  const route = modRoutesReady ? modRegistry.getRoute(path) : undefined

  if (!modRoutesReady) {
    return <LoadingFallback />
  }

  return <ModPageLoader key={`${path}:${route?.modName ?? 'none'}:${route?.pagePath ?? 'none'}`} path={path} route={route} />
}

export default function ModPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ModPageContent />
    </Suspense>
  )
}
