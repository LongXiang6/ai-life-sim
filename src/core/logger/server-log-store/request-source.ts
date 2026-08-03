/**
 * Purpose: Enrich the network-derived server request source with a trusted account session identity.
 * Owner: core:logger
 * Responsibility: Server-side source projection only; account authentication remains owned by account service.
 */

import { ACCOUNT_SESSION_COOKIE } from '@/core/account/account-contract'
import { getSessionAccountIdentity } from '@/core/account/account-service'

import {
  getServerRequestSource as getBaseServerRequestSource,
  type ServerRequestSource,
} from '../server-log-safety'

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

export function getServerRequestSource(request: Request): ServerRequestSource {
  const source = getBaseServerRequestSource(request)
  const token = readCookie(request, ACCOUNT_SESSION_COOKIE)
  if (!token) return source
  try {
    const identity = getSessionAccountIdentity(token)
    if (!identity) return source
    return {
      ...source,
      isRegistered: true,
      accountId: identity.accountId,
      username: identity.username,
    }
  } catch {
    return source
  }
}
