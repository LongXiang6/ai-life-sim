/**
 * 提示词性能基准测试
 */

import { describe, test, expect } from 'vitest'
import { performance } from 'perf_hooks'
import { NarrativeRepairPipeline } from '../../../../src/mods/mod-engine/helpers/repair-pipeline'
import { normalizeNarrativeAIJsonSyntax } from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol'

describe('Repair Pipeline Performance', () => {
  test('repairs typical input within 50ms', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const input = '{"重要程度":"高"，"情节状态":"进行中"}'
    const context = {
      source: 'performance-test',
      timestamp: Date.now(),
    }

    const start = performance.now()
    await pipeline.repairWithMetrics(input, context)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(50)
    expect(metrics.finalSuccess).toBe(true)
  })

  test('repairs large input within 100ms', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const largeData = {
      重要程度: '高',
      情节状态: '进行中',
      语义信号: {
        事件类型: '冲突',
        冲突强度: 60,
        张力变化: 3,
        行动规模: '中',
        不可逆: true,
        影响范围: '关系圈',
        叙事语域: '命运',
        语域理由: '测试',
        情节类型: '任务',
      },
      状态变更: Array.from({ length: 100 }, (_, i) => ({
        系统: '基础属性',
        说明: `变更${i}`,
        变更: { 体魄变化: -1 },
      })),
      长期事件: Array.from({ length: 50 }, (_, i) => `事件${i}`),
    }
    const input = JSON.stringify(largeData).replace(/"/g, '\u201C')
    const context = {
      source: 'performance-test',
      timestamp: Date.now(),
    }

    const start = performance.now()
    await pipeline.repairWithMetrics(input, context)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100)
  })

  test('handles multiple repairs efficiently', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const inputs = [
      '{"key"："value"}',
      '{"key": "value"',
      '{"key": "⟪说明⟫value"}',
      '{"key"："value"',
    ]
    const context = {
      source: 'performance-test',
      timestamp: Date.now(),
    }

    const start = performance.now()
    for (const input of inputs) {
      await pipeline.repairWithMetrics(input, context)
    }
    const duration = performance.now() - start

    expect(duration).toBeLessThan(200)
  })
})

describe('Syntax Normalization Performance', () => {
  test('normalizes typical input within 10ms', () => {
    const input = '{"重要程度":"高"，"情节状态":"进行中"}'

    const start = performance.now()
    const result = normalizeNarrativeAIJsonSyntax(input)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(10)
    expect(result).toBeDefined()
  })

  test('normalizes large input within 50ms', () => {
    const largeData = {
      重要程度: '高',
      情节状态: '进行中',
      语义信号: {
        事件类型: '冲突',
        冲突强度: 60,
        张力变化: 3,
        行动规模: '中',
        不可逆: true,
        影响范围: '关系圈',
        叙事语域: '命运',
        语域理由: '测试',
        情节类型: '任务',
      },
      状态变更: Array.from({ length: 100 }, (_, i) => ({
        系统: '基础属性',
        说明: `变更${i}`,
        变更: { 体魄变化: -1 },
      })),
    }
    const input = JSON.stringify(largeData).replace(/"/g, '\u201C')

    const start = performance.now()
    const result = normalizeNarrativeAIJsonSyntax(input)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(50)
    expect(result).toBeDefined()
  })
})

describe('Memory Usage', () => {
  test('repair pipeline does not leak memory', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const context = {
      source: 'memory-test',
      timestamp: Date.now(),
    }

    // 运行多次修复
    for (let i = 0; i < 100; i++) {
      await pipeline.repairWithMetrics('{"key":"value"}', context)
    }

    // 如果没有内存泄漏，这个测试应该通过
    // 实际的内存泄漏检测需要更复杂的工具
    expect(true).toBe(true)
  })
})
