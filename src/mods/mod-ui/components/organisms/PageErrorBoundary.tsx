'use client'

/**
 * @module PageErrorBoundary
 * @description MOD 级错误边界组件 —— 捕获子组件渲染错误，防止单个 MOD 崩溃影响全局
 * @mod mod-ui
 */

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

export interface PageErrorBoundaryProps {
  /** 错误时显示的自定义文本 */
  message?: string
  /** 子组件 */
  children: ReactNode
  /** 错误恢复回调 */
  onReset?: () => void
}

interface PageErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[PageErrorBoundary] 组件渲染错误:', error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          textAlign: 'center',
          minHeight: '200px',
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px',
            opacity: 0.5,
          }}>
            !
          </div>
          <p style={{
            fontSize: '16px',
            color: 'var(--color-text-primary)',
            margin: '0 0 8px 0',
            fontWeight: 600,
          }}>
            {this.props.message ?? '页面组件加载异常'}
          </p>
          <p style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            margin: '0 0 24px 0',
            maxWidth: '360px',
            lineHeight: 1.6,
          }}>
            {this.state.error?.message ?? '发生了未知错误，请尝试刷新页面'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
