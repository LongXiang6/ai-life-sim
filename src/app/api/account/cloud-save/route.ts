import { gunzipSync } from 'node:zlib'

import { AccountServiceError, requireSessionAccountId } from '@/core/account/account-service'
import { assertSameOrigin, jsonNoStore, readSessionToken } from '@/core/account/account-http'
import {
  CLOUD_MANUAL_SAVE_MAX_COMPRESSED_BYTES,
  CLOUD_MANUAL_SAVE_MAX_UNCOMPRESSED_BYTES,
  CloudManualSaveWriteSchema,
} from '@/core/player-content/player-content-contract'
import { playerContentErrorResponse, readBoundedRequestBody } from '@/core/player-content/player-content-http'
import {
  decodeCloudManualSave,
  deleteCloudManualSave,
  readCloudManualSaveSummary,
  saveCloudManualSave,
} from '@/core/player-content/player-content-service'

export const runtime = 'nodejs'

function requireAccountId(request: Request): string {
  return requireSessionAccountId(readSessionToken(request))
}

export async function GET(request: Request): Promise<Response> {
  try {
    const accountId = requireAccountId(request)
    const includePayload = new URL(request.url).searchParams.get('payload') === '1'
    if (!includePayload) return jsonNoStore({ save: readCloudManualSaveSummary(accountId) })
    const save = decodeCloudManualSave(accountId)
    return jsonNoStore(save ? { save: save.summary, payload: save.payload } : { save: null })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const accountId = requireAccountId(request)
    if (!request.headers.get('content-type')?.toLocaleLowerCase('en-US').startsWith('application/gzip')) {
      throw new AccountServiceError('云端存档请求格式无效', 415, 'invalid_cloud_save_content_type')
    }
    const compressed = await readBoundedRequestBody(request, CLOUD_MANUAL_SAVE_MAX_COMPRESSED_BYTES)
    if (compressed.byteLength === 0 || compressed.byteLength > CLOUD_MANUAL_SAVE_MAX_COMPRESSED_BYTES) {
      throw new AccountServiceError('云端存档请求大小无效', 413, 'cloud_save_too_large')
    }
    let raw: Buffer
    try {
      raw = gunzipSync(compressed, { maxOutputLength: CLOUD_MANUAL_SAVE_MAX_UNCOMPRESSED_BYTES })
    } catch {
      throw new AccountServiceError('云端存档压缩内容无效', 400, 'invalid_cloud_save')
    }
    let input: unknown
    try {
      input = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new AccountServiceError('云端存档内容不是有效 JSON', 400, 'invalid_cloud_save')
    }
    return jsonNoStore({ save: saveCloudManualSave(accountId, CloudManualSaveWriteSchema.parse(input)) })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    return jsonNoStore({ deleted: deleteCloudManualSave(requireAccountId(request)) })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
