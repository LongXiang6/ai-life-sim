import { accountErrorResponse, jsonNoStore } from '@/core/account/account-http'
import { readVerifiedQqBotJson } from '@/core/account/qq-bot-integration'
import { executeQqPointRequest, QqPointRequestSchema } from '@/core/account/qq-points-service'

export async function POST(request: Request): Promise<Response> {
  try {
    const input = QqPointRequestSchema.parse(await readVerifiedQqBotJson(request))
    return jsonNoStore(executeQqPointRequest(input))
  } catch (error) {
    return accountErrorResponse(error)
  }
}
