/**
 * Purpose: Define the stable account-service error contract.
 * Owner: core:account
 * Responsibility: Carry HTTP status and machine error code without owning account operations.
 */

export class AccountServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'AccountServiceError'
  }
}
