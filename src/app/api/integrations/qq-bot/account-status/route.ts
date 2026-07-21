import { accountErrorResponse, jsonNoStore } from '@/core/account/account-http'
import {
  QqBotAccountRequestSchema,
  readQqBotAccountStatus,
  readVerifiedQqBotJson,
} from '@/core/account/qq-bot-integration'

export async function POST(request: Request): Promise<Response> {
  try {
    const input = QqBotAccountRequestSchema.parse(await readVerifiedQqBotJson(request))
    const account = readQqBotAccountStatus(input.qq)
    return jsonNoStore(account ? { linked: true, account } : { linked: false })
  } catch (error) {
    return accountErrorResponse(error)
  }
}
