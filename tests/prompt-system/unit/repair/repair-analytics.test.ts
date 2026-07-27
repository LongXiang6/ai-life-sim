/**
 * 修复分析单元测试
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { RepairAnalytics } from '../../../../src/mods/mod-engine/helpers/repair-analytics'
import type { RepairMetrics } from '../../../../src/mods/mod-engine/helpers/repair-pipeline'

describe('RepairAnalytics', () => {
  let analytics: RepairAnalytics

  beforeEach(() => {
    analytics = new RepairAnalytics(100)
  })

  test('records repair attempt', () => {
    const metrics: RepairMetrics = {
      original: '{"key": "value"}',
      stages: [
        {
          stage: 'json-syntax',
          applied: true,
          changes: [{ type: 'syntax', description: 'test' }],
          success: true,
        },
      ],
      finalResult: '{"key": "value"}',
      finalSuccess: true,
      totalTimeMs: 10,
      context: {
        source: 'test',
        timestamp: Date.now(),
      },
    }

    analytics.recordRepairAttempt(metrics)
    expect(analytics.getRecordCount()).toBe(1)
  })

  test('calculates repair stats', () => {
    const now = Date.now()
    const metrics1: RepairMetrics = {
      original: '{"key": "value"}',
      stages: [
        {
          stage: 'json-syntax',
          applied: true,
          changes: [{ type: 'syntax', description: 'test' }],
          success: true,
        },
      ],
      finalResult: '{"key": "value"}',
      finalSuccess: true,
      totalTimeMs: 10,
      context: { source: 'test', timestamp: now },
    }

    const metrics2: RepairMetrics = {
      original: 'invalid',
      stages: [
        {
          stage: 'json-syntax',
          applied: false,
          changes: [],
          success: true,
        },
      ],
      finalResult: 'invalid',
      finalSuccess: false,
      totalTimeMs: 5,
      context: { source: 'test', timestamp: now },
    }

    analytics.recordRepairAttempt(metrics1)
    analytics.recordRepairAttempt(metrics2)

    const stats = analytics.getRepairStats()
    expect(stats.totalAttempts).toBe(2)
    expect(stats.successCount).toBe(1)
    expect(stats.failureCount).toBe(1)
    expect(stats.successRate).toBe(0.5)
    expect(stats.byStage['json-syntax']).toBeDefined()
    expect(stats.byStage['json-syntax'].attempts).toBe(2)
    expect(stats.byStage['json-syntax'].successes).toBe(1)
  })

  test('gets common errors', () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      analytics.recordRepairAttempt({
        original: 'test',
        stages: [
          {
            stage: 'json-syntax',
            applied: true,
            changes: [],
            success: true,
          },
        ],
        finalResult: 'test',
        finalSuccess: true,
        totalTimeMs: 10,
        context: { source: 'test', timestamp: now },
      })
    }

    for (let i = 0; i < 3; i++) {
      analytics.recordRepairAttempt({
        original: 'test',
        stages: [
          {
            stage: 'missing-brace',
            applied: true,
            changes: [],
            success: true,
          },
        ],
        finalResult: 'test',
        finalSuccess: true,
        totalTimeMs: 10,
        context: { source: 'test', timestamp: now },
      })
    }

    const commonErrors = analytics.getCommonErrors(10)
    expect(commonErrors.length).toBe(2)
    expect(commonErrors[0].errorType).toBe('json-syntax')
    expect(commonErrors[0].count).toBe(5)
    expect(commonErrors[1].errorType).toBe('missing-brace')
    expect(commonErrors[1].count).toBe(3)
  })

  test('gets success rate trend', () => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    // 今天成功
    analytics.recordRepairAttempt({
      original: 'test',
      stages: [
        {
          stage: 'json-syntax',
          applied: true,
          changes: [],
          success: true,
        },
      ],
      finalResult: 'test',
      finalSuccess: true,
      totalTimeMs: 10,
      context: { source: 'test', timestamp: now },
    })

    // 昨天失败
    analytics.recordRepairAttempt({
      original: 'test',
      stages: [
        {
          stage: 'json-syntax',
          applied: true,
          changes: [],
          success: true,
        },
      ],
      finalResult: 'test',
      finalSuccess: false,
      totalTimeMs: 10,
      context: { source: 'test', timestamp: now - dayMs },
    })

    const trend = analytics.getSuccessRateTrend(2)
    expect(trend.length).toBe(2)
    expect(trend[0].count).toBe(1)
    expect(trend[0].rate).toBe(0)
    expect(trend[1].count).toBe(1)
    expect(trend[1].rate).toBe(1)
  })

  test('gets recent failures', () => {
    const now = Date.now()
    analytics.recordRepairAttempt({
      original: 'test',
      stages: [
        {
          stage: 'json-syntax',
          applied: true,
          changes: [],
          success: true,
        },
      ],
      finalResult: 'test',
      finalSuccess: false,
      totalTimeMs: 10,
      context: { source: 'test', timestamp: now },
    })

    analytics.recordRepairAttempt({
      original: 'test',
      stages: [
        {
          stage: 'json-syntax',
          applied: true,
          changes: [],
          success: true,
        },
      ],
      finalResult: 'test',
      finalSuccess: true,
      totalTimeMs: 10,
      context: { source: 'test', timestamp: now + 1 },
    })

    const failures = analytics.getRecentFailures(10)
    expect(failures.length).toBe(1)
    expect(failures[0].success).toBe(false)
  })

  test('clears records', () => {
    analytics.recordRepairAttempt({
      original: 'test',
      stages: [
        {
          stage: 'json-syntax',
          applied: true,
          changes: [],
          success: true,
        },
      ],
      finalResult: 'test',
      finalSuccess: true,
      totalTimeMs: 10,
      context: { source: 'test', timestamp: Date.now() },
    })

    expect(analytics.getRecordCount()).toBe(1)
    analytics.clear()
    expect(analytics.getRecordCount()).toBe(0)
  })

  test('respects max records limit', () => {
    const limitedAnalytics = new RepairAnalytics(2)

    for (let i = 0; i < 5; i++) {
      limitedAnalytics.recordRepairAttempt({
        original: 'test',
        stages: [
          {
            stage: 'json-syntax',
            applied: true,
            changes: [],
            success: true,
          },
        ],
        finalResult: 'test',
        finalSuccess: true,
        totalTimeMs: 10,
        context: { source: 'test', timestamp: Date.now() + i },
      })
    }

    expect(limitedAnalytics.getRecordCount()).toBe(2)
  })
})
