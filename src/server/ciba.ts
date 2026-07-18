import { InvalidConfigurationError } from '../errors/index.js'
import type {
  AuthorizationDetails,
  AuthorizationParameters,
} from '../types/index.js'
import type { Auth0Instance } from './auth0-server.js'

/**
 * CIBA (Client-Initiated Backchannel Authentication) server helper.
 *
 * CIBA authenticates a user on a separate device (push / SMS / email) with no
 * browser redirect. The user approves on their enrolled device; on approval the
 * session is established.
 *
 * **Single-call API.** The foundation's `loginBackchannel` runs the *entire*
 * flow internally — it initiates the request AND polls Auth0 until the user
 * approves (or it times out), then persists the session. There is therefore no
 * separate `poll` step to call from application code (the SDK consumes the
 * foundation rather than re-implementing the polling loop).
 * {@link backchannelAuthentication} resolves once authentication completes.
 *
 * **Serverless considerations.** Because the foundation blocks the call while
 * polling, the operation can run for as long as the tenant's CIBA request
 * lifetime (often 300+ seconds). On serverless runtimes (AWS Lambda, Vercel,
 * etc.) the function timeout MUST exceed the maximum polling duration; otherwise
 * the handler is killed mid-poll and the session may not be persisted. Prefer a
 * long-lived (non-serverless) process, or raise the function timeout, for CIBA.
 *
 * **Errors.** Failures (tenant lacks CIBA, user denial, request expiry) surface
 * as errors thrown by the foundation. `@auth0/auth0-server-js` does not export a
 * dedicated CIBA error class, so catch generically and inspect the message/cause.
 *
 * Applies to: Mode C (server-to-device; no browser interaction).
 */

/** Options for {@link backchannelAuthentication}. */
export interface BackchannelAuthenticationOptions {
  /** Message shown on the user's device to describe what they are approving. */
  bindingMessage: string
  /** Identifies the user to authenticate, by their Auth0 `sub`. */
  loginHint: { sub: string }
  /** Extra authorization parameters (e.g. `audience`, `scope`). */
  authorizationParams?: AuthorizationParameters
}

/** Result of a completed CIBA flow. */
export interface BackchannelAuthenticationResult {
  /** Rich Authorization Request (RFC 9396) details, when RAR was used. */
  authorizationDetails?: AuthorizationDetails[]
}

/**
 * Authenticates a user via CIBA. Resolves once the user approves on their
 * device and the session has been established (the foundation polls internally).
 * Throws if the tenant lacks CIBA, the user denies, or the request expires.
 *
 * @example
 * ```ts
 * await backchannelAuthentication(auth0, {
 *   loginHint: { sub: 'auth0|123' },
 *   bindingMessage: 'Approve payment of $42 to Acme',
 * })
 * // session is now established; read it via getSession(auth0)
 * ```
 */
export async function backchannelAuthentication(
  auth0: Auth0Instance,
  options: BackchannelAuthenticationOptions,
): Promise<BackchannelAuthenticationResult> {
  if (!options.bindingMessage) {
    throw new InvalidConfigurationError('`bindingMessage` is required for CIBA.')
  }
  if (!options.loginHint?.sub) {
    throw new InvalidConfigurationError(
      '`loginHint.sub` is required to identify the user for CIBA.',
    )
  }
  const result = await auth0.client.loginBackchannel({
    bindingMessage: options.bindingMessage,
    loginHint: options.loginHint,
    authorizationParams: options.authorizationParams,
  })
  return { authorizationDetails: result.authorizationDetails }
}
