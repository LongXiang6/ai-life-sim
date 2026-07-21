import { accountErrorResponse, jsonNoStore } from '@/core/account/account-http'
import {
  bindQqAccount,
  QqBotBindRequestSchema,
  readVerifiedQqBotJson,
} from '@/core/account/qq-bot-integration'

export async function POST(request: Request): Promise<Response> {
  try {
    const input = QqBotBindRequestSchema.parse(await readVerifiedQqBotJson(request))
    return jsonNoStore({ linked: true, account: bindQqAccount(input.qq, input.code) })
  } catch (error) {
    return accountErrorResponse(error)
  }
}
