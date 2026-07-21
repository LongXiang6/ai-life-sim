import { accountErrorResponse, jsonNoStore } from '@/core/account/account-http'
import {
  readQqBotProjectStatus,
  verifyQqBotRequest,
} from '@/core/account/qq-bot-integration'

export function GET(request: Request): Response {
  try {
    verifyQqBotRequest(request, '')
    return jsonNoStore(readQqBotProjectStatus())
  } catch (error) {
    return accountErrorResponse(error)
  }
}
