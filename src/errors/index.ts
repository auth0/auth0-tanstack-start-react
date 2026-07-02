/**
 * Typed error classes for `@auth0/auth0-tanstack-start-react`.
 *
 * Each error extends the built-in `Error` and carries a stable, machine-readable
 * `code` (suffixed with `_error`), matching the convention used by
 * `@auth0/auth0-server-js` and the other Auth0 SDKs. Configuration and session
 * errors are re-exported from the foundation so an `instanceof` check works
 * across both layers.
 *
 * @packageDocumentation
 */

// Re-exported from the foundation so there is a single class identity for each,
// rather than a same-named duplicate that would break `instanceof`.
export {
  InvalidConfigurationError,
  MissingSessionError,
} from '@auth0/auth0-server-js'

/** An access token could not be obtained (expired, no refresh token, refresh failed). */
export class AccessTokenError extends Error {
  public readonly code = 'access_token_error'

  constructor(
    message = 'Unable to obtain an access token.',
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'AccessTokenError'
  }
}

/** A request lacks a valid session or token (HTTP 401 equivalent). */
export class UnauthorizedError extends Error {
  public readonly code = 'unauthorized_error'

  constructor(message = 'Unauthorized.', options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UnauthorizedError'
  }
}

/** A session/token exists but lacks required scopes/roles/claims (HTTP 403 equivalent). */
export class ForbiddenError extends Error {
  public readonly code = 'forbidden_error'

  constructor(message = 'Forbidden.', options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ForbiddenError'
  }
}

/** Auth0 returned an error during the authorization-code / callback flow. */
export class CallbackError extends Error {
  public readonly code = 'callback_error'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CallbackError'
  }
}
