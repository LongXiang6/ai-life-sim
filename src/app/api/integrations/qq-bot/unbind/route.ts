import { accountErrorResponse, jsonNoStore } from '@/core/account/account-http'
import {
  QqBotAccountRequestSchema,
  readVerifiedQqBotJson,
  unlinkQqBotAccount,
} from '@/core/account/qq-bot-integration'

export async function POST(request: Request): Promise<Response> {
  try {
    const input = QqBotAccountRequestSchema.parse(await readVerifiedQqBotJson(request))
    return jsonNoStore({ unlinked: unlinkQqBotAccount(input.qq) })
  } catch (error) {
    return accountErrorResponse(error)
  }
}
