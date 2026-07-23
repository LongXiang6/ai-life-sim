import 'server-only'

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { getPortraitImageConfiguration } from './player-content-features'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024
const IMAGE_REQUEST_TIMEOUT_MS = 180_000
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export class PortraitImageProviderError extends Error {
  constructor(readonly code: string) {
    super('画像生成服务暂时不可用')
    this.name = 'PortraitImageProviderError'
  }
}

type FetchImplementation = typeof fetch
export type HostLookupImplementation = (hostname: string) => Promise<readonly string[]>

export type ParsedImageReference =
  | { kind: 'base64'; value: string }
  | { kind: 'url'; value: string }

function normalizedHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/gu, '').toLowerCase()
}

function isUnsafeIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [first, second, third] = octets
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
    || (first === 203 && second === 0 && third === 113)
}

function isUnsafeIpAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/gu, '').toLowerCase()
  const family = isIP(normalized)
  if (family === 4) return isUnsafeIpv4(normalized)
  if (family !== 6) return true
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('ff')) return true
  if (/^f[cd]/u.test(normalized) || /^fe[89ab]/u.test(normalized) || normalized.startsWith('2001:db8:')) return true
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1]
  return mappedIpv4 ? isUnsafeIpv4(mappedIpv4) : false
}

function parsePublicHttpsUrl(value: string, errorCode: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new PortraitImageProviderError(errorCode)
  }
  const hostname = normalizedHostname(url)
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || !hostname
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.lan')
    || (!hostname.includes('.') && isIP(hostname) === 0)
    || (isIP(hostname) !== 0 && isUnsafeIpAddress(hostname))
  ) {
    throw new PortraitImageProviderError(errorCode)
  }
  return url
}

async function lookupPublicAddresses(hostname: string): Promise<readonly string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  return addresses.map((entry) => entry.address)
}

export async function assertPublicHttpsUrl(
  value: string | URL,
  lookupImplementation: HostLookupImplementation = lookupPublicAddresses,
): Promise<URL> {
  const url = parsePublicHttpsUrl(String(value), 'unsafe_image_url')
  let addresses: readonly string[]
  try {
    addresses = await lookupImplementation(normalizedHostname(url))
  } catch {
    throw new PortraitImageProviderError('image_host_resolution_failed')
  }
  if (addresses.length === 0 || addresses.some(isUnsafeIpAddress)) {
    throw new PortraitImageProviderError('unsafe_image_url')
  }
  return url
}

function imageEndpoint(baseUrl: string): URL {
  const endpoint = parsePublicHttpsUrl(baseUrl, 'unsafe_base_url')
  const basePath = endpoint.pathname.replace(/\/+$/u, '')
  endpoint.pathname = basePath.endsWith('/v1')
    ? `${basePath}/images/generations`
    : `${basePath}/v1/images/generations`
  endpoint.search = ''
  endpoint.hash = ''
  return endpoint
}

export function parsePortraitImageResponse(value: unknown): ParsedImageReference {
  if (!value || typeof value !== 'object') throw new PortraitImageProviderError('invalid_response')
  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== 'object') {
    throw new PortraitImageProviderError('invalid_response')
  }
  const first = data[0] as { b64_json?: unknown; url?: unknown }
  if (typeof first.b64_json === 'string' && first.b64_json.length > 0) {
    return { kind: 'base64', value: first.b64_json }
  }
  if (typeof first.url === 'string' && first.url.length > 0) {
    const url = parsePublicHttpsUrl(first.url, 'unsafe_image_url')
    return { kind: 'url', value: url.toString() }
  }
  throw new PortraitImageProviderError('missing_image')
}

function decodeBase64(value: string): Buffer {
  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) {
    throw new PortraitImageProviderError('invalid_base64')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new PortraitImageProviderError('invalid_image_size')
  }
  return bytes
}

function detectImageMimeType(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  throw new PortraitImageProviderError('invalid_image_type')
}

async function readBoundedResponseBody(response: Response, maxBytes: number, errorCode: string): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PortraitImageProviderError(errorCode)
  }
  if (!response.body) throw new PortraitImageProviderError(errorCode)
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new PortraitImageProviderError(errorCode)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  if (total === 0) throw new PortraitImageProviderError(errorCode)
  return Buffer.concat(chunks, total)
}

export async function generatePortraitImage(
  prompt: string,
  fetchImplementation: FetchImplementation = fetch,
  lookupImplementation: HostLookupImplementation = lookupPublicAddresses,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const configuration = getPortraitImageConfiguration()
  if (!configuration.apiKey) throw new PortraitImageProviderError('missing_api_key')
  const endpoint = imageEndpoint(configuration.baseUrl)
  await assertPublicHttpsUrl(endpoint, lookupImplementation)

  let response: Response
  try {
    response = await fetchImplementation(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: configuration.model,
        prompt,
        size: '1024x1024',
        output_format: 'png',
      }),
      signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new PortraitImageProviderError('request_failed')
  }
  if (!response.ok) throw new PortraitImageProviderError(`provider_http_${response.status}`)

  let reference: ParsedImageReference
  try {
    const responseBytes = await readBoundedResponseBody(response, MAX_PROVIDER_RESPONSE_BYTES, 'invalid_response')
    reference = parsePortraitImageResponse(JSON.parse(responseBytes.toString('utf8')))
  } catch (error) {
    if (error instanceof PortraitImageProviderError) throw error
    throw new PortraitImageProviderError('invalid_response')
  }
  if (reference.kind === 'base64') {
    const bytes = decodeBase64(reference.value)
    return { bytes, mimeType: detectImageMimeType(bytes) }
  }
  const assetUrl = await assertPublicHttpsUrl(reference.value, lookupImplementation)

  let assetResponse: Response
  try {
    assetResponse = await fetchImplementation(assetUrl, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new PortraitImageProviderError('asset_download_failed')
  }
  if (!assetResponse.ok) throw new PortraitImageProviderError(`asset_http_${assetResponse.status}`)
  const mimeType = assetResponse.headers.get('content-type')?.split(';')[0]?.trim()
  if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) throw new PortraitImageProviderError('invalid_image_type')
  const bytes = await readBoundedResponseBody(assetResponse, MAX_IMAGE_BYTES, 'invalid_image_size')
  if (detectImageMimeType(bytes) !== mimeType) throw new PortraitImageProviderError('image_type_mismatch')
  return { bytes, mimeType }
}
