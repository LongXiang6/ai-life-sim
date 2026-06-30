'use client'

/**
 * @module error.tsx
 * @description 全局错误边界
 * @mod app
 */

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error)
  }, [error])

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-[var(--color-bg-primary)]">
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">出错了</h2>
      <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-md">
        {error.message}
      </p>
      {isDev && error.digest && (
        <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
          Digest: {error.digest}
        </p>
      )}
      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
        >
          重试
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(
              `Error: ${error.message}\nDigest: ${error.digest ?? 'N/A'}`
            ).catch(() => {})
          }}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          复制错误
        </button>
        <button
          type="button"
          onClick={() => { window.location.href = '/' }}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          返回首页
        </button>
      </div>
    </div>
  )
}
