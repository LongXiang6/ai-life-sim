/**
 * Purpose: Validate and compare operator-authored mailbox reward campaign inputs.
 * Owner: operations
 * Responsibility: Reward timestamps, custom talent normalization, account targets, and idempotency projections.
 */

import fs from 'node:fs'
import path from 'node:path'

export const RETENTION_MS = 3 * 24 * 60 * 60 * 1000

export function parseTimestamp(value, name) {
  const numeric = Number(value)
  if (Number.isSafeInteger(numeric) && numeric >= 0) return numeric
  const parsed = Date.parse(value)
  if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed
  throw new Error(`${name} 时间格式无效`)
}

export function parseRewardTalent(raw, rewardId, startsAt) {
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('礼包天赋 JSON 无效') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('礼包天赋必须是 JSON 对象')
  const source = value.source && typeof value.source === 'object' && !Array.isArray(value.source) ? value.source : {}
  const attrBonus = value.attrBonus && typeof value.attrBonus === 'object' && !Array.isArray(value.attrBonus)
    ? { ...value.attrBonus }
    : {}
  const allowedAttributes = new Set(['mind', 'physique', 'charisma', 'familyBackground', 'luck'])
  for (const [key, bonus] of Object.entries(attrBonus)) {
    if (!allowedAttributes.has(key) || typeof bonus !== 'number' || !Number.isFinite(bonus)) {
      throw new Error(`礼包天赋属性点无效：${key}`)
    }
  }
  const categoryMigration = {
    battle: 'enhancement', exploration: 'perception', social: 'control', production: 'creation',
  }
  const category = categoryMigration[String(value.category || '').trim().toLowerCase()] || value.category || 'creation'
  const rarity = value.rarity || 'common'
  const talent = {
    id: String(value.id || `mail-reward:${rewardId}`),
    lineageId: String(value.lineageId || `mail-reward:${rewardId}`),
    version: Number.isInteger(value.version) ? value.version : 1,
    name: String(value.name || '开发者赠礼'),
    description: String(value.description || '一份来自开发者的特别礼物。'),
    category,
    rarity,
    effect: String(value.effect || '将这份天赋带入后续轮回。'),
    attrBonus,
    strengthenLevel: Number.isInteger(value.strengthenLevel) ? value.strengthenLevel : 0,
    acquiredAt: Number.isInteger(value.acquiredAt) ? value.acquiredAt : startsAt,
    source: {
      worldName: String(source.worldName || '开发者礼包'),
      characterName: String(source.characterName || '礼包领取者'),
      ...(Number.isFinite(source.finalAge) ? { finalAge: source.finalAge } : {}),
      ...(source.runId ? { runId: String(source.runId) } : {}),
    },
  }
  if (!['enhancement', 'control', 'perception', 'summoning', 'creation'].includes(talent.category)) {
    throw new Error('礼包天赋类别无效')
  }
  if (!['common', 'fine', 'rare', 'epic', 'legendary', 'mythic'].includes(talent.rarity)) {
    throw new Error('礼包天赋稀有度无效')
  }
  if (talent.rarity !== 'mythic' && talent.strengthenLevel !== 0) {
    throw new Error('非神话礼包天赋的强化等级必须为 0')
  }
  if (!Number.isInteger(talent.version) || talent.version < 1
    || !Number.isInteger(talent.acquiredAt) || talent.acquiredAt < 0
    || !Number.isInteger(talent.strengthenLevel) || talent.strengthenLevel < 0) {
    throw new Error('礼包天赋版本、取得时间或强化等级无效')
  }
  if (!talent.id || talent.id.length > 128 || !talent.lineageId || talent.lineageId.length > 200) {
    throw new Error('礼包天赋 ID 无效')
  }
  if (!talent.name || talent.name.length > 100 || !talent.description || talent.description.length > 200_000
    || !talent.effect || talent.effect.length > 200_000) {
    throw new Error('礼包天赋名称、描述和效果不能为空')
  }
  if (!talent.source.worldName || talent.source.worldName.length > 200
    || !talent.source.characterName || talent.source.characterName.length > 100) {
    throw new Error('礼包天赋来源信息无效')
  }
  if (talent.source.finalAge !== undefined && (!Number.isFinite(talent.source.finalAge) || talent.source.finalAge < 0)) {
    throw new Error('礼包天赋来源年龄无效')
  }
  if (talent.source.runId !== undefined && talent.source.runId.length > 200) {
    throw new Error('礼包天赋来源运行 ID 无效')
  }
  return talent
}

export function readRewardTalent(options, startsAt) {
  const raw = options.talentFile
    ? fs.readFileSync(path.resolve(options.talentFile), 'utf8')
    : options.talentJson
  return parseRewardTalent(raw, options.rewardId.trim(), startsAt)
}

export function resolveAccounts(accountDatabase, usernames) {
  const seen = new Set()
  return usernames.map((username) => {
    const canonical = username.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
    const account = accountDatabase.prepare(`
      SELECT id, username FROM accounts WHERE username_canonical = ?
    `).get(canonical)
    if (!account) throw new Error(`收件账号不存在：${username}`)
    if (seen.has(account.id)) throw new Error(`收件账号重复：${username}`)
    seen.add(account.id)
    return { key: `account:${account.id}`, id: account.id, label: account.username }
  })
}

function rewardTargetSignature(targets) {
  return targets
    .map((target) => `${target.recipientKind}:${target.recipientKey ?? '*'}`)
    .sort()
    .join('|')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]),
    )
  }
  return value
}

export function existingRewardCampaign(playerDatabase, options, talent, startsAt, endsAt, targets) {
  const campaign = playerDatabase.prepare(`
    SELECT reward_id, talent_id, talent_json, target_signature, title, body,
      eligibility_mode, starts_at, ends_at
    FROM player_mail_reward_campaigns WHERE reward_id = ?
  `).get(options.rewardId)
  if (!campaign) return null
  const existingTargets = playerDatabase.prepare(`
    SELECT recipient_kind AS recipientKind, recipient_key AS recipientKey
    FROM player_mail_reward_targets WHERE reward_id = ?
  `).all(options.rewardId)
  const requestedTargetSignature = rewardTargetSignature(targets)
  const storedTargetSignature = campaign.target_signature || ''
  if (existingTargets.length === 0 && !storedTargetSignature) {
    throw new Error('rewardId 已存在，但原活动目标记录已失效，不能静默重发')
  }
  const sameTalent = JSON.stringify(canonicalJson(JSON.parse(campaign.talent_json)))
    === JSON.stringify(canonicalJson(talent))
  const sameCampaign = campaign.talent_id === talent.id
    && sameTalent
    && storedTargetSignature === requestedTargetSignature
    && campaign.title === options.title
    && campaign.body === options.body
    && campaign.eligibility_mode === (options.eligibility || 'login-window')
    && campaign.starts_at === startsAt
    && campaign.ends_at === endsAt
    && rewardTargetSignature(existingTargets) === rewardTargetSignature(targets)
  if (!sameCampaign) throw new Error('rewardId 已存在，但奖励内容、时间、资格或目标不同')
  const message = playerDatabase.prepare(`
    SELECT id AS messageId, title, body, created_at AS createdAt, expires_at AS expiresAt
    FROM player_mail_messages
    WHERE id IN (SELECT message_id FROM player_mail_reward_targets WHERE reward_id = ?)
    ORDER BY created_at ASC, id ASC LIMIT 1
  `).get(options.rewardId)
  return { campaign, message }
}

export function readExistingRewardWindow(playerDatabase, rewardId) {
  if (!rewardId) return null
  return playerDatabase.prepare(`
    SELECT starts_at AS startsAt, ends_at AS endsAt
    FROM player_mail_reward_campaigns WHERE reward_id = ?
  `).get(rewardId.trim()) ?? null
}

export function ensureRewardCampaignColumns(playerDatabase) {
  const columns = () => new Set(
    playerDatabase.pragma('table_info(player_mail_reward_campaigns)').map((column) => column.name),
  )
  let current = columns()
  if (!current.has('target_signature')) {
    playerDatabase.exec("ALTER TABLE player_mail_reward_campaigns ADD COLUMN target_signature TEXT NOT NULL DEFAULT ''")
    current = columns()
  }
  if (!current.has('title')) {
    playerDatabase.exec("ALTER TABLE player_mail_reward_campaigns ADD COLUMN title TEXT NOT NULL DEFAULT ''")
    current = columns()
  }
  if (!current.has('body')) {
    playerDatabase.exec("ALTER TABLE player_mail_reward_campaigns ADD COLUMN body TEXT NOT NULL DEFAULT ''")
  }
}
