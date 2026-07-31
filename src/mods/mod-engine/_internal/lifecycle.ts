/**
 * @module lifecycle.ts
 * @description MOD 生命周期实现（内部）—— 避免副作用 import 污染公共 API
 * @mod mod-engine
 *
 * P3-1 修复：将 lifecycle 从 index.ts 移至 _internal/，避免公共 API 中的副作用 import。
 */

import type { ModLifecycle } from '@/foundation'
import { runtimeRegistry } from '@/core'
import { registerAllSubsystems } from '../bootstrap/register-subsystems'

/** Turbopack 开发模式下等待 chunk 编译完成的延迟（ms） */
const CHUNK_READY_DELAY = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 1500 : 0

export const lifecycle: ModLifecycle = {
  onInit: async () => {
    // 开发模式下等待 Turbopack 完成 chunk 编译，避免 ERR_ABORTED
    if (CHUNK_READY_DELAY > 0) {
      await new Promise((r) => setTimeout(r, CHUNK_READY_DELAY))
    }
    const { modRegistry } = await import('@/core')
    const manifests = modRegistry.getLoadOrder().map((name) => modRegistry.get(name)!.manifest)
    await registerAllSubsystems(manifests)

    const { orchestrator } = await import('../subsystems/orchestrator-system')
    runtimeRegistry.recordActiveSubsystems(orchestrator.getSubsystemBindings())
  },
}
