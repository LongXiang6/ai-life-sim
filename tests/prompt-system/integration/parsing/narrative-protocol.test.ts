/**
 * 叙事协议解析集成测试
 */

import { describe, test, expect } from 'vitest'
import {
  normalizeNarrativeAIJsonSyntax,
  stripNarrativeAIAnnotations,
  NarrativeAIResponseSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol'

describe('Narrative AI Protocol - Syntax Normalization', () => {
  test('handles full-width quotation marks', () => {
    const input = '{"key": "value"}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    expect(JSON.parse(result)).toEqual({ key: 'value' })
  })

  test('handles full-width colon', () => {
    const input = '{"key"："value"}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    expect(JSON.parse(result)).toEqual({ key: 'value' })
  })

  test('handles full-width comma', () => {
    const input = '{"key"："value"，"key2"："value2"}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    expect(JSON.parse(result)).toEqual({ key: 'value', key2: 'value2' })
  })

  test('handles mixed language punctuation', () => {
    const input = '{"重要程度": "高"，"情节状态": "进行中"}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    expect(JSON.parse(result)).toEqual({
      重要程度: '高',
      情节状态: '进行中',
    })
  })

  test('preserves ASCII strings with quotes', () => {
    const input = '{"key": "value with \\"quotes\\" inside"}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    expect(JSON.parse(result)).toEqual({
      key: 'value with "quotes" inside',
    })
  })
})

describe('Narrative AI Protocol - Annotation Cleanup', () => {
  test('removes annotation markers', () => {
    const input = '{"key": "⟪说明⟫value"}'
    const result = stripNarrativeAIAnnotations(input)
    expect(JSON.parse(result)).toEqual({ key: 'value' })
  })

  test('removes multiple annotations', () => {
    const input = '{"key": "⟪说明1⟫value1", "key2": "⟪说明2⟫value2"}'
    const result = stripNarrativeAIAnnotations(input)
    expect(JSON.parse(result)).toEqual({ key: 'value1', key2: 'value2' })
  })

  test('preserves strings with similar characters', () => {
    const input = '{"key": "value with <angle> brackets"}'
    const result = stripNarrativeAIAnnotations(input)
    expect(JSON.parse(result)).toEqual({
      key: 'value with <angle> brackets',
    })
  })
})

describe('Narrative AI Response Schema Validation', () => {
  test('validates minimal valid response', () => {
    const data = {
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
    }

    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('validates response with branch', () => {
    const data = {
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
      命运分支: true,
      分支标题: '选择',
      分支选项: ['选项1', '选项2'],
    }

    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('rejects empty data object', () => {
    const data = {}
    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('rejects incomplete semantic core', () => {
    const data = {
      重要程度: '高',
      情节状态: '进行中',
      // 缺少语义信号
    }

    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('rejects branch without semantic core', () => {
    const data = {
      命运分支: true,
      分支标题: '选择',
      分支选项: ['选项1', '选项2'],
    }

    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('rejects branch with low importance', () => {
    const data = {
      重要程度: '普通', // 应该是高
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
      命运分支: true,
      分支标题: '选择',
      分支选项: ['选项1', '选项2'],
    }

    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('rejects branch with life register', () => {
    const data = {
      重要程度: '高',
      情节状态: '进行中',
      语义信号: {
        事件类型: '冲突',
        冲突强度: 60,
        张力变化: 3,
        行动规模: '中',
        不可逆: true,
        影响范围: '关系圈',
        叙事语域: '生活', // 命运分支不能用生活语域
        语域理由: '测试',
        情节类型: '任务',
      },
      命运分支: true,
      分支标题: '选择',
      分支选项: ['选项1', '选项2'],
    }

    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('accepts optional fields', () => {
    const data = {
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
      状态变更: [
        {
          系统: '基础属性',
          说明: '测试',
          变更: { 体魄变化: -1 },
        },
      ],
      长期事件: ['事件1'],
      原创内容: [
        {
          名称: '技能',
          说明: '描述',
          类别: '技能',
        },
      ],
      新伏笔: [
        {
          类型: '预言',
          说明: '描述',
          优先级: 5,
        },
      ],
      关键事件: [
        {
          内容: '事件',
          重要度: 50,
        },
      ],
    }

    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('Edge Cases', () => {
  test('handles extremely long text', () => {
    const longValue = 'a'.repeat(10000)
    const input = `{"key": "${longValue}"}`
    const result = normalizeNarrativeAIJsonSyntax(input)
    const parsed = JSON.parse(result)
    expect(parsed.key.length).toBe(10000)
  })

  test('handles special characters in strings', () => {
    const input = '{"key": "value with \\n newlines and \\t tabs"}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    const parsed = JSON.parse(result)
    expect(parsed.key).toContain('\n')
    expect(parsed.key).toContain('\t')
  })

  test('handles unicode characters', () => {
    const input = '{"key": "值 with emoji 🎮"}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    const parsed = JSON.parse(result)
    expect(parsed.key).toBe('值 with emoji 🎮')
  })

  test('handles nested objects', () => {
    const input = '{"outer": {"inner": "value"}}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    const parsed = JSON.parse(result)
    expect(parsed.outer.inner).toBe('value')
  })

  test('handles arrays', () => {
    const input = '{"array": ["item1", "item2", "item3"]}'
    const result = normalizeNarrativeAIJsonSyntax(input)
    const parsed = JSON.parse(result)
    expect(parsed.array).toEqual(['item1', 'item2', 'item3'])
  })
})
