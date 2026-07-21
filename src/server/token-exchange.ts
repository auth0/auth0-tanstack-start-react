import { InvalidConfigurationError } from '../errors/index.js'
import type {
  ConnectionTokenSet,
  CustomTokenExchangeOptions,
  CustomTokenExchangeResult,
  GetAccessTokenForConnectionOptions,
} from '../types/index.js'
import type { Auth0Instance } from './auth0-server.js'

/**
 * Token exchange and Token Vault server helpers.
 *
 * - {@link customTokenExchange} performs an RFC 8693 token exchange, swapping an
 *   external/legacy subject token for Auth0 tokens, and persists the resulting
 *   session. Requires a Token Exchange Profile configured in the tenant.
 * - {@link getAccessTokenForConnection} (Token Vault) exchanges the current
 *   session's refresh token for an access token issued by an upstream federated
 *   connection (e.g. Google), so the app can call that provider's APIs.
 *
 * Both run server-side (Mode C).
 */

/**
 * Exchanges an external subject token for Auth0 tokens (RFC 8693) and
 * **persists the session** — effectively logging the user in without an
 * interactive browser flow. Use to bridge a legacy/3rd-party token into an
 * Auth0 session.
 *
 * Wraps the foundation's session-persisting `loginWithCustomTokenExchange`.
 * (The foundation also has a non-session `customTokenExchange` for pure
 * delegation/impersonation; this SDK surfaces the session-persisting variant,
 * which is the common Mode C case.)
 *
 * @example
 * ```ts
 * await customTokenExchange(auth0, {
 *   subjectToken: legacyToken,
 *   subjectTokenType: 'urn:acme:legacy-token',
 *   audience: 'https://api.example.com',
 * })
 * // session is now established; read it via getSession(auth0)
 * ```
 */
export async function customTokenExchange(
  auth0: Auth0Instance,
  options: CustomTokenExchangeOptions,
): Promise<CustomTokenExchangeResult> {
  if (!options.subjectToken) {
    throw new InvalidConfigurationError('`subjectToken` is required.')
  }
  if (!options.subjectTokenType) {
    throw new InvalidConfigurationError('`subjectTokenType` is required.')
  }
  if (Boolean(options.actorToken) !== Boolean(options.actorTokenType)) {
    throw new InvalidConfigurationError(
      '`actorToken` and `actorTokenType` must both be provided or both omitted.',
    )
  }
  const result = await auth0.client.loginWithCustomTokenExchange(options)
  return { authorizationDetails: result.authorizationDetails }
}

/**
 * Token Vault: exchanges the current session's refresh token for an access
 * token from an upstream federated connection (e.g. to call Google APIs on the
 * user's behalf). Requires an active session with a refresh token.
 *
 * @example
 * ```ts
 * const { accessToken } = await getAccessTokenForConnection(auth0, {
 *   connection: 'google-oauth2',
 * })
 * ```
 */
export async function getAccessTokenForConnection(
  auth0: Auth0Instance,
  options: GetAccessTokenForConnectionOptions,
): Promise<ConnectionTokenSet> {
  if (!options.connection) {
    throw new InvalidConfigurationError('`connection` is required.')
  }
  const result = await auth0.client.getAccessTokenForConnection({
    connection: options.connection,
    loginHint: options.loginHint,
  })
  return {
    accessToken: result.accessToken,
    scope: result.scope,
    expiresAt: result.expiresAt,
    connection: result.connection,
    loginHint: result.loginHint,
  }
}
