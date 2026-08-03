/**
 * Purpose: Read development diagnostic JSONL and aggregate execution hierarchy metrics.
 * Owner: operations
 * Responsibility: Execution-diagnostic projection only; diagnostic writers and business state remain elsewhere.
 */

import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_PAGE_SIZE, listFiles, MAX_PAGE_SIZE, positiveInteger } from './shared.mjs'

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

export function queryDevelopmentSystemDiagnostics(options, input = {}) {
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const query = String(input.query ?? '').trim().toLowerCase()
  const system = String(input.system ?? '').trim().toLowerCase()
  const status = String(input.status ?? '').trim().toLowerCase()
  const entries = []
  const files = listFiles(
    options.diagnosticRoot,
    (entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(entry.name),
  ).reverse()

  for (const fileName of files) {
    const filePath = path.join(options.diagnosticRoot, fileName)
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!line) continue
      try {
        const event = JSON.parse(line)
        entries.push({ ...event, sourceFile: fileName, sourceLine: index + 1 })
      } catch (error) {
        entries.push({
          schemaVersion: 1,
          timestamp: 0,
          system: 'diagnostic-reader',
          event: 'invalid-jsonl-line',
          status: 'error',
          sourceFile: fileName,
          sourceLine: index + 1,
          details: { rawLine: line },
          error: { message: error instanceof Error ? error.message : String(error) },
        })
      }
    }
  }

  const filtered = entries.filter((entry) => {
    if (system && String(entry.system ?? '').toLowerCase() !== system) return false
    if (status && String(entry.status ?? '').toLowerCase() !== status) return false
    if (!query) return true
    return JSON.stringify(entry).toLowerCase().includes(query)
  }).sort((left, right) => (
    Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0)
      || String(right.sourceFile).localeCompare(String(left.sourceFile))
      || Number(right.sourceLine ?? 0) - Number(left.sourceLine ?? 0)
  ))
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
    available: fs.existsSync(options.diagnosticRoot),
    root: options.diagnosticRoot,
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
}
