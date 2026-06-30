'use client'

/**
 * @module WorldMapPage
 * @description 世界地图页面 —— Canvas 六边形地图渲染
 * @mod mod-world-map
 */

import { useBaseUniverseStore } from '@/mods/mod-base-universe'
import { PageShell } from '@/mods/mod-ui'
import { WorldMapCanvas } from '../../components/WorldMapCanvas'

export default function WorldMapPage() {
  const regions = useBaseUniverseStore((s) => s.worldMap?.regions ?? [])

  return (
    <PageShell title="世界地图">
      <div style={{ width: '100%', height: 'calc(100vh - 120px)', padding: '16px' }}>
        <WorldMapCanvas regions={regions} />
      </div>
    </PageShell>
  )
}
