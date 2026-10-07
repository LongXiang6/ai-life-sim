/**
 * Purpose: Read development execution events from the canonical SQLite log store.
 * Owner: operations
 * Responsibility: Execution-diagnostic projection only; writers and business state remain elsewhere.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parsePlaintextJson, positiveInteger, tableExists, withReadonlyLogs } from './shared.mjs'

const EXECUTION_PHASE_ORDER = ['prepare', 'ready', 'execute', 'transition', 'finalize']

function createExecutionMetric() {
  return { events: 0, terminalEvents: 0, failures: 0, durationMs: 0, byPhase: {} }
}

function updateExecutionMetric(metric, execution, durationMs) {
  metric.events += 1
  const phase = String(execution.phase ?? 'unknown')
  const phaseMetric = metric.byPhase[phase] ?? { events: 0, terminalEvents: 0, failures: 0, durationMs: 0 }
  phaseMetric.events += 1
  if (execution.terminal === true) {
    const failed = !['succeeded', 'skipped'].includes(String(execution.status))
    const duration = Number.isFinite(durationMs) ? Number(durationMs) : 0
    metric.terminalEvents += 1
    metric.durationMs += duration
    phaseMetric.terminalEvents += 1
    phaseMetric.durationMs += duration
    if (failed) {
      metric.failures += 1
      phaseMetric.failures += 1
    }
  }
  metric.byPhase[phase] = phaseMetric
}

function aggregateExecutionDiagnostics(entries) {
  const total = createExecutionMetric()
  const departmentMap = new Map()
  for (const entry of entries) {
    const execution = entry.execution
    if (!execution || typeof execution !== 'object') continue
    updateExecutionMetric(total, execution, entry.durationMs)
    const departmentName = String(execution.department ?? 'unknown')
    const subsystemName = String(execution.subsystem ?? 'unknown')
    const componentName = String(execution.component ?? 'unknown')
    let department = departmentMap.get(departmentName)
    if (!department) {
      department = { name: departmentName, ...createExecutionMetric(), subsystemMap: new Map() }
      departmentMap.set(departmentName, department)
    }
    updateExecutionMetric(department, execution, entry.durationMs)
    let subsystem = department.subsystemMap.get(subsystemName)
    if (!subsystem) {
      subsystem = { name: subsystemName, ...createExecutionMetric(), componentMap: new Map() }
      department.subsystemMap.set(subsystemName, subsystem)
    }
    updateExecutionMetric(subsystem, execution, entry.durationMs)
    let component = subsystem.componentMap.get(componentName)
    if (!component) {
      component = { name: componentName, ...createExecutionMetric() }
      subsystem.componentMap.set(componentName, component)
    }
    updateExecutionMetric(component, execution, entry.durationMs)
  }

  const sortByName = (left, right) => left.name.localeCompare(right.name, 'en')
  const hierarchy = [...departmentMap.values()].map((department) => ({
    name: department.name,
    events: department.events,
    terminalEvents: department.terminalEvents,
    failures: department.failures,
    durationMs: department.durationMs,
    byPhase: department.byPhase,
    subsystems: [...department.subsystemMap.values()].map((subsystem) => ({
      name: subsystem.name,
      events: subsystem.events,
      terminalEvents: subsystem.terminalEvents,
      failures: subsystem.failures,
      durationMs: subsystem.durationMs,
      byPhase: subsystem.byPhase,
      components: [...subsystem.componentMap.values()].map((component) => ({
        name: component.name,
        events: component.events,
        terminalEvents: component.terminalEvents,
        failures: component.failures,
        durationMs: component.durationMs,
        byPhase: component.byPhase,
      })).sort(sortByName),
    })).sort(sortByName),
  })).sort(sortByName)

  return {
    rawEvents: total.events,
    terminalEvents: total.terminalEvents,
    failures: total.failures,
    durationMs: total.durationMs,
    byPhase: Object.fromEntries(EXECUTION_PHASE_ORDER.map((phase) => [
      phase,
      total.byPhase[phase] ?? { events: 0, terminalEvents: 0, failures: 0, durationMs: 0 },
    ])),
    hierarchy,
  }
}

function mapDevelopmentEvent(row) {
  const payload = parsePlaintextJson(row.payload_json)
  const meta = parsePlaintextJson(row.meta_json)
  return {
    ...(payload && typeof payload === 'object' ? payload : {}),
    timestamp: Number(row.created_at),
    system: row.module,
    event: row.event ?? row.message,
    status: meta?.status ?? row.level,
    durationMs: meta?.durationMs ?? payload?.durationMs,
    sourceId: row.source_id,
    sourceIp: row.source_ip,
    sourceFile: 'logs.sqlite',
    sourceLine: row.id,
  }
}

export function queryDevelopmentSystemDiagnostics(options, input = {}) {
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const query = String(input.query ?? '').trim().toLowerCase()
  const system = String(input.system ?? '').trim().toLowerCase()
  const status = String(input.status ?? '').trim().toLowerCase()
  return withReadonlyLogs(options.logDatabase, {
    available: false,
    root: options.logDatabase,
    total: 0,
    page,
    pageSize,
    bySystem: {},
    byStatus: {},
    incidents: { total: 0, byCategory: {} },
    execution: aggregateExecutionDiagnostics([]),
    entries: [],
  }, (database) => {
    if (!tableExists(database, 'log_entries')) {
      return {
        available: false,
        root: options.logDatabase,
        total: 0,
        page,
        pageSize,
        bySystem: {},
        byStatus: {},
        incidents: { total: 0, byCategory: {} },
        execution: aggregateExecutionDiagnostics([]),
        entries: [],
      }
    }

    const entries = database.prepare(`
      SELECT * FROM log_entries
      WHERE entry_type = 'development-event'
      ORDER BY created_at DESC, rowid DESC, id ASC
    `).all().map(mapDevelopmentEvent)
    const filtered = entries.filter((entry) => {
      if (system && String(entry.system ?? '').toLowerCase() !== system) return false
      if (status && String(entry.status ?? '').toLowerCase() !== status) return false
      if (!query) return true
      return JSON.stringify(entry).toLowerCase().includes(query)
    })
    const bySystem = {}
    const byStatus = {}
    const byIncidentCategory = {}
    for (const entry of filtered) {
      const systemName = String(entry.system ?? 'unknown')
      const statusName = String(entry.status ?? 'unknown')
      bySystem[systemName] = (bySystem[systemName] ?? 0) + 1
      byStatus[statusName] = (byStatus[statusName] ?? 0) + 1
      if (entry.category) {
        const category = String(entry.category)
        byIncidentCategory[category] = (byIncidentCategory[category] ?? 0) + 1
      }
    }
    const offset = (page - 1) * pageSize
    return {
      available: true,
      root: options.logDatabase,
      total: filtered.length,
      page,
      pageSize,
      bySystem,
      byStatus,
      incidents: {
        total: Object.values(byIncidentCategory).reduce((sum, count) => sum + count, 0),
        byCategory: byIncidentCategory,
      },
      execution: aggregateExecutionDiagnostics(filtered),
      entries: filtered.slice(offset, offset + pageSize),
    }
  })
}
