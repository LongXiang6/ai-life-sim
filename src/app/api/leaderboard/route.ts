import { getAccountDatabase } from '@/core/account/account-database'
import { jsonNoStore } from '@/core/account/account-http'
import { playerContentErrorResponse } from '@/core/player-content/player-content-http'
import { readLeaderboardEntries } from '@/core/player-content/player-content-service'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const accounts = getAccountDatabase().prepare('SELECT id, username FROM accounts').all() as Array<{
      id: string
      username: string
    }>
    const usernames = new Map(accounts.map((account) => [account.id, account.username]))
    return jsonNoStore({ entries: readLeaderboardEntries(usernames) })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
