'use client'

/**
 * @module settings-page
 * @description 独立设置页面
 * @mod mod-pages
 */

import { useRouter } from 'next/navigation'
import { SettingsModal } from '@/mods/mod-settings'
import { BottomActionBar } from '@/mods/mod-ui'

export default function SettingsPage() {
  const router = useRouter()

  const handleClose = () => {
    router.push('/welcome')
  }

  return (
    <div className="final-flow-frame">
      <div className="final-flow-design-fit final-flow-design-fit--330">
        <div className="final-flow-design-canvas">
          <main className="final-flow-page-surface" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <SettingsModal
              open={true}
              onClose={handleClose}
              initialTab="appearance"
              isPage={true}
            />
            <BottomActionBar
              onBack={() => router.back()}
              backTitle="返回上一页"
              onConfirm={() => router.push('/welcome')}
              confirmNumber="00"
              confirmText="返回欢迎界面"
              confirmDescription="回到欢迎界面"
              confirmTitle="返回欢迎界面"
            />
          </main>
        </div>
      </div>
    </div>
  )
}
