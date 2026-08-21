/**
 * Purpose: Expose player-content feature availability and provider configuration.
 * Owner: core:player-content
 * Responsibility: Feature and configuration projection only; generation remains with its owning service.
 */

import 'server-only'

export function isPortraitImageEnabled(): boolean {
  return false
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
