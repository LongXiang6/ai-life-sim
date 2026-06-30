'use client'

/**
 * @module Card.tsx
 * @description 卡片容器分子组件 —— 圆角边框 + 标题 + 内容区
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：标题与内容层级分明
 *   - Deference：内容优先，卡片作为容器不抢眼
 *   - Depth：subtle 阴影增加卡片浮起感
 */

export interface CardProps {
  title?: string
  children: React.ReactNode
  className?: string
  padded?: boolean
}

/**
 * 卡片容器组件 —— 圆角边框 + 标题 + 内容区
 * @param {CardProps} props - 组件属性
 */
export function Card({
  title,
  children,
  className = '',
  padded = true,
}: CardProps) {
  return (
    <div
      className={[
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]',
        padded ? 'p-5' : '',
        className,
      ].join(' ')}
    >
      {title && (
        <h2 className="text-base font-semibold mb-3 text-[var(--color-text-primary)]">
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}
