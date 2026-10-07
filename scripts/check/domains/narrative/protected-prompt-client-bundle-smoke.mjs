#!/usr/bin/env node
/**
 * Purpose: Verify fixed narrative rules are absent from browser bundles.
 * Owner: quality:narrative
 * Responsibility: Inspect existing client chunks without rebuilding the active server.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
const staticRoot = path.join(root, '.next', 'static', 'chunks')
if (!fs.existsSync(staticRoot)) {
  console.error('FAIL: .next/static/chunks 不存在，请先运行 npm run build')
  process.exit(1)
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (entry.isFile() && /\.(?:js|map)$/u.test(entry.name)) out.push(full)
  }
  return out
}

const bundleText = collectFiles(staticRoot)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')

for (const forbidden of [
  '文字游戏式人生重开模拟器的世界演化与事件裁决系统',
  '受世界事实与模拟规则约束的世界叙事演算者',
  '获得新能力、资源或地位不会自动触发官方或机构审查',
  '你撞开仓房木门，把林舟的铜扣递给阿禾',
  '世界观提供事件的可能范围；玩家、天赋、属性、历史、命运分支和时间节点用于判断事件是否适用。',
  '历史输出记录已经成立的事实，只用于判断候选事件的前提和结果是否与之相容',
  '落笔前比较起点与终点的整体处境',
  '每轮根据当前条件随机形成一则新的、完整的人生记录',
  '世界提供可发生的故事可能性，历史输出提供已经成立并封存的背景状态',
  '每轮以当前条件重新形成新的叙事焦点',
  '当前状态窗口内多项已经发生并产生结果的变化',
  '不沿用它的叙事结构、措辞或焦点',
  '提示词预览',
]) {
  if (bundleText.includes(forbidden)) {
    console.error(`FAIL: 客户端生产 bundle 泄露受保护内容: ${forbidden}`)
    process.exit(1)
  }
}

console.log('PASS: protected-prompt-client-bundle-smoke')
