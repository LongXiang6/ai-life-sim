'use client'

import { useEngineStore } from '@/mods/mod-engine'
import { PageShell } from '@/mods/mod-ui'
import { useWorldStore } from '@/mods/mod-world'
import { WorldMapCanvas } from '../../components/WorldMapCanvas'
import { projectWorldMap } from '../../map-projection'

export default function WorldMapPage() {
  const currentContextId = useWorldStore((state) => state.currentContextId)
  useWorldStore((state) => state.contexts)
  useWorldStore((state) => state.crossContextEdges)
  useWorldStore((state) => state.entityReferences)
  const totalDays = useEngineStore((state) => state.round.totalDays)

  const projection = currentContextId
    ? projectWorldMap({ contextId: currentContextId, totalDays })
    : null

  return (
    <PageShell title={projection?.contextName ?? '世界地图'}>
      <div style={{ width: '100%', height: 'calc(100vh - 120px)', padding: '16px' }}>
        <WorldMapCanvas projection={projection} />
      </div>
    </PageShell>
  )
}
