#!/usr/bin/env node
/**
 * Purpose: Preserve the data viewer command and public query API while routing work to owned components.
 * Owner: operations
 * Responsibility: CLI parsing, public exports, and direct-process startup only; queries, assets, and HTTP routes live below data-viewer/.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createDataViewerServer } from './data-viewer/server.mjs'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4318
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function defaultPaths() {
  const dataRoot = path.resolve(process.cwd(), '.data')
  return {
    logDatabase: process.env.AI_LOG_DB_PATH || path.join(dataRoot, 'logs.sqlite'),
    accountDatabase: process.env.ACCOUNT_DB_PATH || path.join(dataRoot, 'accounts.sqlite'),
    playerContentDatabase: process.env.PLAYER_CONTENT_DB_PATH || path.join(dataRoot, 'player-content.sqlite'),
    memoryRoot: process.env.NARRATIVE_MEMORY_DIR || path.join(dataRoot, 'narrative-memory'),
  }
}

export function parseDataViewerArgs(argv) {
  const options = { host: DEFAULT_HOST, port: DEFAULT_PORT, ...defaultPaths() }
  for (let index = 0; index < argv.length; index += 1) {
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${argv[index - 1]} 缺少参数`)
      return value
    }
    if (argv[index] === '--host') options.host = next()
    else if (argv[index] === '--port') options.port = Number(next())
    else if (argv[index] === '--log-database') options.logDatabase = next()
    else if (argv[index] === '--account-database') options.accountDatabase = next()
    else if (argv[index] === '--player-content-database') options.playerContentDatabase = next()
    else if (argv[index] === '--memory-root') options.memoryRoot = next()
    else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('Usage: data-viewer.mjs [--host 127.0.0.1] [--port 4318] [--log-database <path>] [--account-database <path>] [--player-content-database <path>] [--memory-root <path>]')
      process.exit(0)
    } else {
      throw new Error(`未知参数：${argv[index]}`)
    }
  }
  if (!LOOPBACK_HOSTS.has(options.host)) throw new Error('数据查看器只允许监听本机回环地址')
  if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('--port 必须是有效端口')
  }
  return {
    ...options,
    logDatabase: path.resolve(options.logDatabase),
    accountDatabase: path.resolve(options.accountDatabase),
    playerContentDatabase: path.resolve(options.playerContentDatabase),
    memoryRoot: path.resolve(options.memoryRoot),
  }
}

export { createDataViewerServer }
export { inspectDatabaseSchema, queryReadonlyDatabase } from './data-viewer/database-inspection.mjs'
export { queryDevelopmentSystemDiagnostics } from './data-viewer/execution-diagnostics.mjs'
export { buildDataOverview, queryAiCalls, queryUserLinks } from './data-viewer/log-queries.mjs'
export {
  listMemoryDatabases,
  queryMemoryRows,
} from './data-viewer/memory-archives.mjs'

export function isDirectExecution(argvEntry, moduleUrl = import.meta.url) {
  if (!argvEntry) return false
  return path.resolve(argvEntry) === fileURLToPath(moduleUrl)
}

if (isDirectExecution(process.argv[1])) {
  const options = parseDataViewerArgs(process.argv.slice(2))
  const server = createDataViewerServer(options)
  server.listen(options.port, options.host, () => {
    console.log(`[data-viewer] http://${options.host}:${options.port}`)
    console.log(`[data-viewer] logs=${options.logDatabase}`)
    console.log(`[data-viewer] memory=${options.memoryRoot}`)
  })
}
