/**
 * Purpose: Route the local read-only data viewer HTTP endpoints to their owning query modules.
 * Owner: operations
 * Responsibility: HTTP response and route orchestration only; query modules own data projection.
 */

import http from 'node:http'

import { servedViewerCss, servedViewerJs, viewerHtml } from './assets.mjs'
import { inspectDatabaseSchema, queryReadonlyDatabase } from './database-inspection.mjs'
import { queryDevelopmentSystemDiagnostics } from './execution-diagnostics.mjs'
import { buildDataOverview, queryAiCalls, queryUserLinks } from './log-queries.mjs'
import {
  listMemoryDatabases,
  queryMemoryRows,
} from './memory-archives.mjs'
import { pageInput } from './shared.mjs'

function jsonResponse(response, value, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function textResponse(response, value, contentType) {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(value)
}

export function createDataViewerServer(options) {
  return http.createServer((request, response) => {
    if (request.method !== 'GET') return jsonResponse(response, { error: '只读查看器仅接受 GET' }, 405)
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    try {
      if (url.pathname === '/') return textResponse(response, viewerHtml, 'text/html; charset=utf-8')
      if (url.pathname === '/styles.css') return textResponse(response, servedViewerCss, 'text/css; charset=utf-8')
      if (url.pathname === '/app.js') return textResponse(response, servedViewerJs, 'text/javascript; charset=utf-8')
      if (url.pathname === '/api/overview') return jsonResponse(response, buildDataOverview(options))
      if (url.pathname === '/api/ai-calls') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryAiCalls(options, { ...page, query: url.searchParams.get('q') ?? '', callKind: url.searchParams.get('callKind') ?? '' }))
      }
      if (url.pathname === '/api/system-diagnostics') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryDevelopmentSystemDiagnostics(options, {
          ...page,
          query: url.searchParams.get('q') ?? '',
          system: url.searchParams.get('system') ?? '',
          status: url.searchParams.get('status') ?? '',
        }))
      }
      if (url.pathname === '/api/memory') return jsonResponse(response, listMemoryDatabases(options))
      if (url.pathname === '/api/memory/rows') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryMemoryRows(options, { ...page, lifeRunId: url.searchParams.get('lifeRunId'), view: url.searchParams.get('view') ?? 'events' }))
      }
      if (url.pathname === '/api/users') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryUserLinks(options, { ...page, query: url.searchParams.get('q') ?? '' }))
      }
      if (url.pathname === '/api/schema') return jsonResponse(response, inspectDatabaseSchema(options, url.searchParams.get('source') ?? 'logs'))
      if (url.pathname === '/api/query') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryReadonlyDatabase(options, {
          ...page,
          source: url.searchParams.get('source') ?? 'logs',
          sql: url.searchParams.get('sql') ?? '',
        }))
      }
      return jsonResponse(response, { error: '未找到' }, 404)
    } catch (error) {
      return jsonResponse(response, { error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })
}
