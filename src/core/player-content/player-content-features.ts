import 'server-only'

function enabled(name: string, defaultValue = false): boolean {
  const configured = process.env[name]?.trim()
  if (configured === undefined || configured === '') return defaultValue
  return configured === '1'
}

export function isPlayerLeaderboardEnabled(): boolean {
  return enabled('PLAYER_LEADERBOARD_ENABLED', true)
}

export function isPlayerMailboxEnabled(): boolean {
  return enabled('PLAYER_MAILBOX_ENABLED', true)
}

export function isPortraitImageEnabled(): boolean {
  return enabled('PORTRAIT_IMAGE_ENABLED')
}

export function getPortraitImageConfiguration(): {
  baseUrl: string
  model: string
  apiKey: string
} {
  return {
    baseUrl: process.env.PORTRAIT_IMAGE_BASE_URL?.trim() || 'https://dasuapi.com',
    model: process.env.PORTRAIT_IMAGE_MODEL?.trim() || 'gpt-image-2',
    apiKey: process.env.PORTRAIT_IMAGE_API_KEY?.trim() || '',
  }
}
