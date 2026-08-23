/**
 * Purpose: Expose authenticated mailbox reads and commands through the account API.
 * Owner: app:api
 * Responsibility: Request validation, trusted identity projection, and mailbox service dispatch only.
 */

import { assertSameOrigin, jsonNoStore } from '@/core/account/account-http'
import { getServerRequestSource } from '@/core/logger/server-log-store'
import {
  PlayerMailCommandSchema,
  PlayerMailFolderSchema,
} from '@/core/player-content/player-content-contract'
import { playerContentErrorResponse } from '@/core/player-content/player-content-http'
import {
  acceptPlayerMailboxTalent,
  claimPlayerMailboxReward,
  deletePlayerMailboxMessage,
  markPlayerMailboxMessageRead,
  readPlayerMailboxPage,
  sendPlayerMail,
  type PlayerMailboxIdentity,
} from '@/core/player-content/player-mail-service'

export const runtime = 'nodejs'

function mailboxIdentity(request: Request): PlayerMailboxIdentity {
  const source = getServerRequestSource(request)
  return {
    ...(source.accountId ? { accountId: source.accountId } : {}),
    ...(source.username ? { username: source.username } : {}),
    ...(source.diagnosticCode ? { diagnosticCode: source.diagnosticCode } : {}),
    ...(source.deviceProvenanceId ? { deviceProvenanceId: source.deviceProvenanceId } : {}),
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const folder = PlayerMailFolderSchema.parse(url.searchParams.get('folder') ?? 'inbox')
    return jsonNoStore(readPlayerMailboxPage({
      identity: mailboxIdentity(request),
      folder,
      cursor: url.searchParams.get('cursor'),
    }))
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const input = PlayerMailCommandSchema.parse(JSON.parse(await request.text()))
    const identity = mailboxIdentity(request)
    switch (input.action) {
      case 'send':
        return jsonNoStore(sendPlayerMail({ identity, ...input }), { status: 201 })
      case 'read':
        return jsonNoStore(markPlayerMailboxMessageRead({ identity, ...input }))
      case 'delete':
        return jsonNoStore(deletePlayerMailboxMessage({ identity, ...input }))
      case 'accept-talent':
        return jsonNoStore(acceptPlayerMailboxTalent({ identity, ...input }))
      case 'claim-reward':
        return jsonNoStore(claimPlayerMailboxReward({ identity, ...input }))
    }
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
