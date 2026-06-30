/**
 * @module init-mods-bootstrap.ts
 * @description MOD 加载初始化实现 —— 由 InitMods 动态 import，避免进入根布局首屏编译图
 * @mod app
 */

import { setOnAiError } from '@/core/ai-service'
import { eventBus } from '@/core/event-bus'
import { useGlobalStore } from '@/core/global-store'
import {
  loadMods,
  modRegistry,
  invokeModLifecycles,
  invokeModOnLoad,
  notifyConfigurationChanged,
  getModControlImporter,
  enrichModLoadError,
  runtimeRegistry,
} from '@/core/mod-loader'
import type { LoadResult } from '@/core/mod-loader/mod-loader'
import { REMOTE_API_CONTRACTS } from '@/core/mod-loader/remote-contracts.generated'
import { runPrototypeStage } from '@/core/mod-loader/prototype-stage'
import { runSettingsStage } from '@/core/mod-loader/settings-stage'
import { remote } from '@/core/remote-interface/remote-interface'
import { configStore } from '@/core/storage'
import { autoMigrateFromDir } from '@/core/store-migration/migration-runner'

export interface ModBootstrapOptions {
  setModRoutesReady: (ready: boolean) => void
  setAllModsLoaded: (loaded: boolean) => void
  isCancelled: () => boolean
  /** 已由 init-mods-routes 完成 loadMods 时传入，跳过重置与路由注册 */
  loadResult?: LoadResult
  skipRouteRegistration?: boolean
}

function buildModContext(result: ReturnType<typeof loadMods>) {
  return {
    eventBus,
    globalStore: useGlobalStore.getState() as unknown as Record<string, unknown>,
    aiService: {
      callAI: async () => {
        throw new Error('[InitMods] aiService.callAI 未注册：请在运行时通过 MOD onInit 注册真实 AI 服务')
      },
      callAIStream: async function* () {
        throw new Error('[InitMods] aiService.callAIStream 未注册：请在运行时通过 MOD onInit 注册真实 AI 服务')
      },
    },
    storage: {
      getItem: (key: string) => configStore.get<string>('app', key),
      setItem: (key: string, value: string) => { configStore.set('app', key, value) },
      removeItem: (key: string) => { configStore.remove('app', key) },
      keys: () => configStore.keys('app'),
    },
    getMod: <T,>(name: string) => {
      const mod = modRegistry.getMod<T>(name)
      if (!mod) throw new Error(`[InitMods] MOD "${name}" 未注册，无法获取 API`)
      return mod
    },
    mods: result.modsTable,
  }
}

/** 执行完整 MOD 引导（Settings → Prototype → 迁移 → lifecycle → onLoad → freeze） */
export async function runModBootstrap(options: ModBootstrapOptions): Promise<void> {
  const {
    setModRoutesReady,
    setAllModsLoaded,
    isCancelled,
    loadResult,
    skipRouteRegistration,
  } = options

  let result: LoadResult
  if (skipRouteRegistration && loadResult) {
    runtimeRegistry.reset()
    result = loadResult
  } else {
    const { MOD_REGISTRY } = await import('@/mods/registry')
    modRegistry.reset()
    runtimeRegistry.reset()
    setModRoutesReady(false)
    result = loadMods(MOD_REGISTRY)

    if (result.loaded.length > 0 && result.errors.length === 0) {
      setModRoutesReady(true)
    }
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      const enriched = enrichModLoadError(err)
      console.error('[InitMods] 加载错误:', enriched.message)
      if (enriched.hint) {
        console.error('[InitMods] 修复提示:', enriched.hint)
      }
    }
  }

  if (result.cycles.length > 0) {
    for (const cycle of result.cycles) {
      const enriched = enrichModLoadError(`循环依赖检测: ${cycle.join(' → ')}`)
      console.error('[InitMods] 循环依赖:', enriched.message)
      if (enriched.hint) {
        console.error('[InitMods] 修复提示:', enriched.hint)
      }
    }
  }

  if (result.loaded.length === 0 || result.errors.length > 0) {
    return
  }

  const settingsResult = await runSettingsStage(result.loaded, getModControlImporter)
  if (!settingsResult.valid) {
    for (const err of settingsResult.errors) {
      console.error('[InitMods] Settings 阶段错误:', err)
    }
  }

  const prototypeResult = await runPrototypeStage(
    result.loaded,
    (name) => modRegistry.get(name)?.manifest,
  )
  if (!prototypeResult.valid) {
    for (const err of prototypeResult.errors) {
      console.error('[InitMods] Prototype 阶段错误:', err)
    }
  }

  for (const name of result.loaded) {
    const scanEntry = result.modsTable.get(name)
    if (!scanEntry) continue
    try {
      const migResult = await autoMigrateFromDir(name, scanEntry.version)
      if (migResult.stepsExecuted > 0) {
        console.info(`[InitMods] ${name}: 迁移 ${migResult.stepsExecuted} 步完成`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[InitMods] ${name} 迁移失败:`, msg)
    }
  }

  const modContext = buildModContext(result)
  const lifecycleErrors = await invokeModLifecycles(modContext)

  if (isCancelled()) return

  for (const err of lifecycleErrors) {
    console.error('[InitMods] 生命周期错误:', err)
  }

  if (lifecycleErrors.length > 0) {
    return
  }

  const MODS_SNAPSHOT_KEY = 'app:mods-snapshot'
  const prevSnapshotRaw = configStore.get<string>('app', MODS_SNAPSHOT_KEY) ?? '{}'
  let prevSnapshot: Record<string, string>
  try {
    prevSnapshot = JSON.parse(prevSnapshotRaw)
  } catch {
    prevSnapshot = {}
  }

  const currSnapshot: Record<string, string> = {}
  for (const name of result.loaded) {
    const scanEntry = result.modsTable.get(name)
    if (scanEntry) currSnapshot[name] = scanEntry.version
  }

  const addedMods: string[] = []
  const removedMods: string[] = []
  const modChanges: Record<string, { oldVersion: string; newVersion: string }> = {}

  for (const name of Object.keys(currSnapshot)) {
    if (!(name in prevSnapshot)) {
      addedMods.push(name)
    } else if (prevSnapshot[name] !== currSnapshot[name]) {
      modChanges[name] = {
        oldVersion: prevSnapshot[name],
        newVersion: currSnapshot[name],
      }
    }
  }
  for (const name of Object.keys(prevSnapshot)) {
    if (!(name in currSnapshot)) {
      removedMods.push(name)
    }
  }

  const isFirstSnapshot = Object.keys(prevSnapshot).length === 0
  const hasChanges = addedMods.length > 0 || removedMods.length > 0 || Object.keys(modChanges).length > 0
  if (hasChanges && !isFirstSnapshot) {
    const reason = addedMods.length > 0
      ? 'mod_added'
      : removedMods.length > 0
        ? 'mod_removed'
        : 'mod_version_changed'

    const configErrors = await notifyConfigurationChanged(
      {
        reason,
        addedMods: addedMods.length > 0 ? addedMods : undefined,
        removedMods: removedMods.length > 0 ? removedMods : undefined,
        modChanges: Object.keys(modChanges).length > 0 ? modChanges : undefined,
      },
      modContext,
    )
    for (const err of configErrors) {
      console.error('[InitMods] onConfigurationChanged 错误:', err)
    }
  }

  configStore.set('app', MODS_SNAPSHOT_KEY, JSON.stringify(currSnapshot))

  const onLoadErrors = await invokeModOnLoad(modContext)
  if (onLoadErrors.length > 0) {
    for (const err of onLoadErrors) {
      console.error('[InitMods] onLoad 错误:', err)
    }
  }

  runtimeRegistry.freeze({
    loadOrder: result.loaded,
    getManifest: (name) => modRegistry.get(name)?.manifest,
    listRemoteMods: () => remote.list(),
    listRemoteFunctions: (mod) => remote.listFunctions(mod),
    remoteContracts: REMOTE_API_CONTRACTS,
  })

  console.info(
    `[InitMods] 已加载 ${result.loaded.length} MOD:`,
    result.loaded,
  )

  eventBus.emit('core:all-mods-loaded', { loaded: result.loaded })
  setAllModsLoaded(true)

  const { useToastStore } = await import('@/mods/mod-ui')
  setOnAiError((msg: string) => {
    useToastStore.getState().addToast('error', msg, 8000)
  })
}
