/**
 * Purpose: Orchestrate one complete MOD wiring metadata and output transaction.
 * Owner: code-generation
 * Responsibility: Deterministic generator sequencing and terminal result only.
 */

import path from 'node:path'

import { CHECK_ONLY, MODS_DIR, ROOT } from './context.mjs'
import {
  generateAllStores,
  generateCampaignStages,
  generateEventsConstants,
  generateModRegistry,
  generatePromptContextContract,
  generateRemoteContracts,
  parseCampaignHooksFromManifest,
  parseCampaignStageNames,
  parseNarrativePromptVars,
  parsePromptContextFields,
  validateCampaignStages,
} from './contract-generators.mjs'
import { generateEngineSubsystems, generateSubsystemAliases } from './engine-generators.mjs'
import {
  generateModControlImporters,
  generateModImporters,
  generateModImportersReExport,
  generateModSecondaryApiImporters,
  generateModSubsystemImporters,
} from './importer-generators.mjs'
import {
  generateCompatImporters,
  generateMigrationImporters,
  scanCompatibilityFiles,
  scanMigrationFiles,
} from './migration-generators.mjs'
import { writeOrCheck } from './output.mjs'
import {
  assertExplicitRemoteApiPrecedence,
  assertRemoteApiExtractionIsLineEndingAgnostic,
  buildSubsystemAliases,
  extractRemoteApiExports,
  listModDirs,
  parseManifestEvents,
  parseManifestStores,
  parseManifestStringArray,
  parseManifestSubsystems,
  readFile,
  resolveRemoteApiContract,
  scanSubsystemSingletons,
} from './source-analysis.mjs'

export function main() {
  assertRemoteApiExtractionIsLineEndingAgnostic()
  assertExplicitRemoteApiPrecedence()
  const modDirs = listModDirs()
  /** @type {Record<string, string>} */
  const allAliases = {}
  /** @type {Record<string, string[]>} */
  const secondaryApiImporters = {}
  /** @type {Record<string, string[]>} */
  const remoteContracts = {}
  /** @type {string[]} */
  let engineManifestClasses = []
  /** @type {Map<string, string>} */
  const engineSingletons = new Map()
  /** @type {Map<string, string[]>} 记录各 MOD manifest.stores 字段内容 */
  const modToStoreNames = new Map()
  /** @type {Map<string, { emits: string[], listens: string[] }>} */
  const modToEvents = new Map()

  for (const modName of modDirs) {
    const modPath = path.join(MODS_DIR, modName)
    const manifestPath = path.join(modPath, 'manifest.ts')
    const manifestContent = readFile(manifestPath)
    if (!manifestContent) continue

    const subsystems = parseManifestSubsystems(manifestContent)
    const storeNames = parseManifestStores(manifestContent)
    if (storeNames.length > 0) modToStoreNames.set(modName, storeNames)
    const events = parseManifestEvents(manifestContent)
    if (events.emits.length > 0 || events.listens.length > 0) modToEvents.set(modName, events)
    const aliases = buildSubsystemAliases(modPath, subsystems)
    if (modName !== 'mod-engine') {
      Object.assign(allAliases, aliases)
    }

    const indexPath = path.join(modPath, 'index.ts')
    const remoteFnSet = new Set(extractRemoteApiExports(readFile(indexPath)))
    const secondaryEntries = parseManifestStringArray(manifestContent, 'secondaryPublicEntries').values
    if (secondaryEntries.length > 0) {
      const entries = secondaryEntries
      for (const entry of entries) {
        const entryPath = path.join(modPath, entry)
        const entryContent = readFile(entryPath)
        if (entryContent) {
          for (const fn of extractRemoteApiExports(entryContent)) {
            remoteFnSet.add(fn)
          }
        }
      }
    }
    const remoteContract = resolveRemoteApiContract(manifestContent, [...remoteFnSet])
    if (remoteContract.declared || remoteContract.values.length > 0) {
      remoteContracts[modName] = remoteContract.values
    }
    if (secondaryEntries.length > 0 && remoteContract.values.length > 0) {
      secondaryApiImporters[modName] = secondaryEntries
    }

    if (modName === 'mod-engine') {
      engineManifestClasses = subsystems
      const scanned = scanSubsystemSingletons(modPath)
      for (const [cls, singleton] of scanned) {
        engineSingletons.set(cls, singleton)
      }
    }
  }

  const ctxFields = parsePromptContextFields()
  const narrativeVars = parseNarrativePromptVars()
  const missingInCtx = narrativeVars.filter((v) => !ctxFields.includes(v))
  if (missingInCtx.length > 0) {
    console.error(`[generate-mod-wiring] narrative 模板变量不在 PromptContext 中: ${missingInCtx.join(', ')}`)
    if (CHECK_ONLY) process.exit(1)
  }

  const indexStages = parseCampaignStageNames()
  const engineManifestContent = readFile(path.join(MODS_DIR, 'mod-engine', 'manifest.ts'))
  const manifestStages = parseCampaignHooksFromManifest(engineManifestContent)
  validateCampaignStages(manifestStages, indexStages)

  const compatMap = scanCompatibilityFiles(modDirs)
  const migrationMap = scanMigrationFiles(modDirs)

  const subsystemEntries = []
  for (const name of modDirs) {
    if (name === 'mod-engine') continue
    const modPath = path.join(MODS_DIR, name)
    const manifestContent = readFile(path.join(modPath, 'manifest.ts'))
    const subs = parseManifestSubsystems(manifestContent)
    if (subs.length === 0) continue
    subsystemEntries.push({ name, classNames: subs, modDir: modPath })
  }

  const outputs = [
    [path.join(MODS_DIR, 'registry.generated.ts'), generateModRegistry(modDirs)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-control-importers.generated.ts'), generateModControlImporters(modDirs)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-subsystem-importers.generated.ts'), generateModSubsystemImporters(subsystemEntries)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-importers.generated.ts'), generateModImporters(modDirs)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'mod-secondary-api-importers.generated.ts'), generateModSecondaryApiImporters(secondaryApiImporters)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'mod-importers.generated.ts'), generateModImportersReExport()],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'subsystem-aliases.generated.ts'), generateSubsystemAliases(allAliases)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'engine-subsystems.generated.ts'), generateEngineSubsystems(engineManifestClasses, engineSingletons)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'prompt-context-contract.generated.ts'), generatePromptContextContract(ctxFields, narrativeVars)],
    [path.join(MODS_DIR, 'mod-engine', 'campaigns', 'default', 'stages.generated.ts'), generateCampaignStages(indexStages)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'remote-contracts.generated.ts'), generateRemoteContracts(remoteContracts)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'compat-importers.generated.ts'), generateCompatImporters(compatMap)],
    [path.join(ROOT, 'src', 'core', 'mod-loader', 'migration-importers.generated.ts'), generateMigrationImporters(migrationMap)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'all-stores.generated.ts'), generateAllStores(modDirs, modToStoreNames)],
    [path.join(MODS_DIR, 'mod-engine', 'bootstrap', 'events.generated.ts'), generateEventsConstants(modDirs, modToEvents)],
  ]

  let ok = true
  for (const [filePath, content] of outputs) {
    if (!writeOrCheck(filePath, content)) ok = false
  }

  if (CHECK_ONLY) {
    if (!ok) process.exit(1)
    console.log('[generate-mod-wiring] 全部生成文件与源码一致')
    return
  }

  console.log(`[generate-mod-wiring] 完成: ${modDirs.length} MOD, ${Object.keys(allAliases).length} 别名, ${Object.keys(remoteContracts).length} Remote 契约`)
}
