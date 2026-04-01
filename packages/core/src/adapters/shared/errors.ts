/**
 * Shared adapter errors.
 *
 * @module lib/einvoice/src/adapters/shared/errors
 */

/**
 * Error thrown when an adapter method is not supported by the platform.
 * Includes an explanation of the alternative approach.
 */
export class NotSupportedError extends Error {
  constructor(adapter: string, method: string, alternative: string) {
    super(`[${adapter}] ${method} is not supported. ${alternative}`);
    this.name = "NotSupportedError";
  }
}

/**
 * Error thrown when an API request fails.
 * Used by all HTTP clients (Iopole, Storecove, SuperPDP, AFNOR).
 */
export class AdapterAPIError extends Error {
  constructor(
    adapter: string,
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = `${adapter}APIError`;
  }
}
