/**
 * @module subsystem-field-contract-parser.mjs
 * @description 以 TypeScript AST 读取 SUBSYSTEM_FIELD_CONTRACTS，供 codegen 与结构漂移检查共用。
 */

import ts from 'typescript'

const CONTRACT_NAME = 'SUBSYSTEM_FIELD_CONTRACTS'

/** @param {ts.Expression} expression */
function unwrapExpression(expression) {
  let current = expression
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return current
}

/** @param {ts.PropertyName} name */
function readPropertyName(name) {
  if (
    ts.isIdentifier(name)
    || ts.isStringLiteral(name)
    || ts.isNumericLiteral(name)
    || ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text
  }
  return null
}

/**
 * @param {ts.ObjectLiteralExpression} objectLiteral
 * @param {string} ownerLabel
 * @returns {Map<string, ts.PropertyAssignment>}
 */
function readPropertyAssignments(objectLiteral, ownerLabel) {
  /** @type {Map<string, ts.PropertyAssignment>} */
  const properties = new Map()

  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`${ownerLabel} 含不支持的展开、简写或方法属性`)
    }
    const name = readPropertyName(property.name)
    if (!name) {
      throw new Error(`${ownerLabel} 含无法静态解析的计算属性名`)
    }
    if (properties.has(name)) {
      throw new Error(`${ownerLabel} 含重复属性: ${name}`)
    }
    properties.set(name, property)
  }

  return properties
}

/**
 * @param {string} content
 * @param {string} [fileName]
 * @returns {Record<string, string[]>}
 */
export function parseSubsystemFieldContracts(
  content,
  fileName = 'subsystem-field-registry.ts',
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  if (sourceFile.parseDiagnostics.length > 0) {
    const detail = sourceFile.parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('; ')
    throw new Error(`${fileName} TypeScript 解析失败: ${detail}`)
  }

  /** @type {ts.VariableDeclaration | undefined} */
  let declaration
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    declaration = statement.declarationList.declarations.find((candidate) =>
      ts.isIdentifier(candidate.name) && candidate.name.text === CONTRACT_NAME,
    )
    if (declaration) break
  }

  if (!declaration?.initializer) return {}
  const contractInitializer = unwrapExpression(declaration.initializer)
  if (!ts.isObjectLiteralExpression(contractInitializer)) {
    throw new Error(`${CONTRACT_NAME} 必须使用可静态解析的对象字面量`)
  }

  const contractProperties = readPropertyAssignments(contractInitializer, CONTRACT_NAME)
  /** @type {Record<string, string[]>} */
  const contracts = {}

  for (const [subsystemId, contractProperty] of contractProperties) {
    const contractObject = unwrapExpression(contractProperty.initializer)
    if (!ts.isObjectLiteralExpression(contractObject)) {
      throw new Error(`${CONTRACT_NAME}.${subsystemId} 必须是对象字面量`)
    }

    const contractMembers = readPropertyAssignments(contractObject, `${CONTRACT_NAME}.${subsystemId}`)
    const fieldsProperty = contractMembers.get('fields')
    if (!fieldsProperty) {
      throw new Error(`${CONTRACT_NAME}.${subsystemId} 缺少 fields`)
    }

    const fieldsObject = unwrapExpression(fieldsProperty.initializer)
    if (!ts.isObjectLiteralExpression(fieldsObject)) {
      throw new Error(`${CONTRACT_NAME}.${subsystemId}.fields 必须是对象字面量`)
    }

    contracts[subsystemId] = [...readPropertyAssignments(
      fieldsObject,
      `${CONTRACT_NAME}.${subsystemId}.fields`,
    ).keys()]
  }

  return contracts
}
