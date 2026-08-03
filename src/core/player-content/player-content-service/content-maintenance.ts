/**
 * Purpose: Remove all player-content state for an account and expose aggregate operations counts.
 * Owner: core:player-content
 * Responsibility: Cross-table maintenance and read-only aggregate counts only.
 */

import { getPlayerContentDatabase } from '../player-content-database'
import { removePortraitAssets } from '../portrait-asset-store'

export function deletePlayerContentForAccount(accountId: string): void {
  const database = getPlayerContentDatabase()
  const assets = database.prepare('SELECT storage_key FROM portrait_assets WHERE account_id = ?')
    .all(accountId) as Array<{ storage_key: string }>
  database.transaction(() => {
    database.prepare('DELETE FROM cloud_manual_saves WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM leaderboard_best_runs WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM portrait_mail_jobs WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM portrait_assets WHERE account_id = ?').run(accountId)
    database.prepare(
      'DELETE FROM legendary_run_decisions WHERE source_account_id = ? OR target_key = ?',
    ).run(accountId, `account:${accountId}`)
    database.prepare('DELETE FROM legendary_target_states WHERE target_key = ?')
      .run(`account:${accountId}`)
  })()
  removePortraitAssets(assets.map((asset) => asset.storage_key))
}

export function getPlayerContentAggregateCounts(): {
  cloudSaves: number
  eligibleLeaderboardAccounts: number
  queuedPortraitJobs: number
  readyPortraitMail: number
} {
  const database = getPlayerContentDatabase()
  const cloudSaves = database.prepare('SELECT COUNT(*) AS count FROM cloud_manual_saves')
    .get() as { count: number }
  const leaderboard = database.prepare('SELECT COUNT(*) AS count FROM leaderboard_best_runs')
    .get() as { count: number }
  const portraitJobs = database.prepare(`
    SELECT COUNT(*) AS count FROM portrait_mail_jobs
    WHERE status IN ('awaiting_brief', 'processing')
  `).get() as { count: number }
  const mail = database.prepare(
    "SELECT COUNT(*) AS count FROM player_mail_messages WHERE kind = 'portrait'",
  ).get() as { count: number }
  return {
    cloudSaves: cloudSaves.count,
    eligibleLeaderboardAccounts: leaderboard.count,
    queuedPortraitJobs: portraitJobs.count,
    readyPortraitMail: mail.count,
  }
}
