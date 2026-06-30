/**
 * @module remote-api-filter.ts
 * @description Remote API 导出名过滤 —— 与 codegen isLikelyRemoteFunction 同源
 * @mod core
 */

/**
 * 判断 index.ts 导出名是否应注册为 Remote API（可调用业务函数）
 *
 * 排除：Hook、React 组件、子系统类、PromptTemplate 对象、引擎单例等。
 *
 * @param name - 导出名称
 * @returns 是否应注册为 Remote API
 */
export function isLikelyRemoteApiExport(name: string): boolean {
  if (!name || name.startsWith('use') || name.startsWith('_')) return false
  if (name === 'default' || name === 'lifecycle') return false
  if (name.endsWith('System')) return false
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return false
  // React 组件多为 PascalCase
  if (/^[A-Z]/.test(name) && !name.endsWith('Prompt')) return false
  // PromptTemplate 对象（narrativePrompt 等）；buildXxxPrompt 函数保留
  if (name.endsWith('Prompt') && !name.startsWith('build')) return false
  if (name.endsWith('Schema')) return false
  if ([
    'orchestrator',
    'narrativeParser',
    'summaryCompressor',
    'timeSystem',
    'memoryEngine',
    'subsystemRelevance',
    'memoryLifecycle',
    'memoryForgetting',
    'causalDelay',
    'plotStructure',
    'foreshadowing',
    'coreMemory',
    'simulationBridge',
  ].includes(name)) {
    return false
  }
  return true
}
