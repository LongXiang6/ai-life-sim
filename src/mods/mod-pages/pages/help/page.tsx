/** Purpose: Render the standalone finalized help surface. Owner: mod-pages. Responsibility: Page composition and navigation only. */

'use client'

/**
 * @module help-page
 * @description 独立游戏说明页面
 * @mod mod-pages
 */

import { useRouter } from 'next/navigation'
import { HelpModal, BottomActionBar } from '@/mods/mod-ui'

export default function HelpPage() {
  const router = useRouter()

  const handleClose = () => {
    router.push('/welcome')
  }

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className="final-flow-page-surface" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <HelpModal visible={true} onClose={handleClose} isPage={true} />
          </main>
          <BottomActionBar
            onBack={() => router.back()}
            backTitle="返回上一页"
            backDescription="退出说明页"
            onConfirm={() => router.push('/welcome')}
            confirmNumber="00"
            confirmText="完成"
            confirmDescription="返回欢迎界面"
            confirmTitle="完成阅读"
          />
        </div>
      </div>
    </div>
  )
}
