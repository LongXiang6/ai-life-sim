/**
 * @module repair-analytics.ts
 * @description 修复成功率监控 — 记录、统计和分析修复行为
 * @mod mod-engine
 *
 * 所有修复操作通过全局 analytics 实例记录，用于指导提示词优化。
 */

import type { RepairMetrics, RepairContext } from './repair-pipeline'

/** 修复记录 */
export interface RepairRecord {
  id: string
  timestamp: number
  source: string
  errorType: string
  repairStage: string
  success: boolean
  changesCount: number
  timeMs: number
  context: RepairContext
}

/** 修复统计 */
export interface RepairStats {
  totalAttempts: number
  successCount: number
  failureCount: number
  successRate: number
  averageTimeMs: number
  byErrorType: Record<string, { attempts: number; successes: number; rate: number }>
  byStage: Record<string, { attempts: number; successes: number; rate: number }>
}

/** 时间范围 */
export interface TimeRange {
  start: number
  end: number
}

/** 错误频率 */
export interface ErrorFrequency {
  errorType: string
  count: number
  percentage: number
}

/**
 * 修复分析器
 * 收集和分析修复指标
 */
export class RepairAnalytics {
  private records: RepairRecord[] = []
  private maxRecords: number

  constructor(maxRecords: number = 10000) {
    this.maxRecords = maxRecords
  }

  /**
   * 记录修复尝试
   */
  recordRepairAttempt(metrics: RepairMetrics): void {
    const record: RepairRecord = {
      id: this.generateId(),
      timestamp: metrics.context.timestamp,
      source: metrics.context.source,
      errorType: this.extractErrorType(metrics),
      repairStage: this.extractAppliedStage(metrics),
      success: metrics.finalSuccess,
      changesCount: metrics.stages.reduce((sum, s) => sum + s.changes.length, 0),
      timeMs: metrics.totalTimeMs,
      context: metrics.context,
    }

    this.records.push(record)

    // 保持记录数量在限制内
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords)
    }
  }

  /**
   * 获取指定时间范围的统计
   */
  getRepairStats(timeRange?: TimeRange): RepairStats {
    const filtered = timeRange
      ? this.records.filter(r => r.timestamp >= timeRange.start && r.timestamp <= timeRange.end)
      : this.records

    if (filtered.length === 0) {
      return {
        totalAttempts: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        averageTimeMs: 0,
        byErrorType: {},
        byStage: {},
      }
    }

    const successCount = filtered.filter(r => r.success).length
    const byErrorType = this.groupBy(filtered, 'errorType')
    const byStage = this.groupBy(filtered, 'repairStage')

    return {
      totalAttempts: filtered.length,
      successCount,
      failureCount: filtered.length - successCount,
      successRate: successCount / filtered.length,
      averageTimeMs: filtered.reduce((sum, r) => sum + r.timeMs, 0) / filtered.length,
      byErrorType: this.calculateGroupStats(byErrorType),
      byStage: this.calculateGroupStats(byStage),
    }
  }

  /**
   * 获取最常见的错误类型
   */
  getCommonErrors(limit: number = 10, timeRange?: TimeRange): ErrorFrequency[] {
    const filtered = timeRange
      ? this.records.filter(r => r.timestamp >= timeRange.start && r.timestamp <= timeRange.end)
      : this.records

    const errorCounts = new Map<string, number>()
    for (const record of filtered) {
      errorCounts.set(record.errorType, (errorCounts.get(record.errorType) || 0) + 1)
    }

    const total = filtered.length
    return Array.from(errorCounts.entries())
      .map(([errorType, count]) => ({
        errorType,
        count,
        percentage: total > 0 ? count / total : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  /**
   * 获取修复成功率趋势（按天）
   */
  getSuccessRateTrend(days: number = 30): Array<{ date: string; rate: number; count: number }> {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const trend: Array<{ date: string; rate: number; count: number }> = []

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const dayRecords = this.records.filter(
        r => r.timestamp >= dayStart && r.timestamp < dayEnd,
      )

      const date = new Date(dayStart).toISOString().split('T')[0]
      const successCount = dayRecords.filter(r => r.success).length

      trend.push({
        date,
        rate: dayRecords.length > 0 ? successCount / dayRecords.length : 0,
        count: dayRecords.length,
      })
    }

    return trend
  }

  /**
   * 获取最近的失败记录
   */
  getRecentFailures(limit: number = 10): RepairRecord[] {
    return this.records
      .filter(r => !r.success)
      .slice(-limit)
      .reverse()
  }

  /**
   * 清除所有记录
   */
  clear(): void {
    this.records = []
  }

  /**
   * 获取记录数量
   */
  getRecordCount(): number {
    return this.records.length
  }

  private extractErrorType(metrics: RepairMetrics): string {
    const appliedStage = metrics.stages.find(s => s.applied)
    return appliedStage ? appliedStage.stage : 'unknown'
  }

  private extractAppliedStage(metrics: RepairMetrics): string {
    const appliedStage = metrics.stages.find(s => s.applied)
    return appliedStage ? appliedStage.stage : 'none'
  }

  private groupBy(records: RepairRecord[], key: keyof RepairRecord): Map<string, RepairRecord[]> {
    const groups = new Map<string, RepairRecord[]>()
    for (const record of records) {
      const groupKey = String(record[key])
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(record)
    }
    return groups
  }

  private calculateGroupStats(
    groups: Map<string, RepairRecord[]>,
  ): Record<string, { attempts: number; successes: number; rate: number }> {
    const stats: Record<string, { attempts: number; successes: number; rate: number }> = {}
    for (const [key, records] of groups) {
      const successes = records.filter(r => r.success).length
      stats[key] = {
        attempts: records.length,
        successes,
        rate: records.length > 0 ? successes / records.length : 0,
      }
    }
    return stats
  }

  private generateId(): string {
    return `repair_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
}

/**
 * 全局修复分析实例
 */
export const globalRepairAnalytics = new RepairAnalytics()

/**
 * 便捷函数：记录修复尝试
 */
export function recordRepairAttempt(metrics: RepairMetrics): void {
  globalRepairAnalytics.recordRepairAttempt(metrics)
}

/**
 * 便捷函数：获取修复统计
 */
export function getRepairStats(timeRange?: TimeRange): RepairStats {
  return globalRepairAnalytics.getRepairStats(timeRange)
}

/**
 * 便捷函数：获取常见错误
 */
export function getCommonErrors(limit?: number, timeRange?: TimeRange): ErrorFrequency[] {
  return globalRepairAnalytics.getCommonErrors(limit, timeRange)
}
