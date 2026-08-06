import { InvalidConfigurationError } from '../errors/index.js'
import type { AuthorizationParameters } from '../types/index.js'
import type { Auth0Instance } from './auth0-server.js'
import { toSafeAppState } from './config.js'
import {
  perRequestAuthorizationParams,
  resolvePerRequestRedirect,
} from './redirect-uri.js'

/**
 * Account-linking server helpers.
 *
 * Linking a secondary identity (e.g. a Google login) to the current primary
 * account is a redirect-based flow, like login: `connectAccount` returns the
 * Auth0 authorization URL, the user authenticates with the secondary provider,
 * and `completeConnectAccount` finishes the link at the callback. Unlinking
 * follows the same start/complete shape.
 *
 * These wrap the foundation's `startLinkUser`/`completeLinkUser` and
 * `startUnlinkUser`/`completeUnlinkUser`. The caller issues the redirect for the
 * `start` calls and runs the `complete` call from the callback route.
 *
 * **Callback wiring (important):** account-link callbacks are NOT the same as
 * login callbacks. The SDK's default `/auth/callback` handler completes an
 * *interactive login* (`completeInteractiveLogin`). Linking/unlinking complete
 * via `completeConnectAccount`/`completeDisconnectAccount`, so the app must wire
 * a dedicated callback route for them and pass a distinct `redirect_uri`.
 *
 * **`returnTo` safety:** `returnTo` is validated against the app's own origin
 * when it is stored (see {@link connectAccount}), so an off-origin value is
 * dropped before it can reach the callback. As defense in depth, validate it
 * again at the callback with {@link toSafeRedirect} before using it as a
 * redirect target, so a hand-rolled callback cannot become an open redirect.
 *
 * @example
 * ```ts
 * // src/routes/auth/link-callback.ts
 * import { toSafeRedirect, resolveAppBaseUrl } from '@auth0/auth0-tanstack-start-react/server'
 *
 * export const Route = createFileRoute('/auth/link-callback')({
 *   server: { handlers: { GET: async () => {
 *     const request = getRequest()
 *     const appBaseUrl = resolveAppBaseUrl(auth0.config.appBaseUrl, request)
 *     const { appState } = await completeConnectAccount(auth0, new URL(request.url))
 *     const returnTo = toSafeRedirect(appState?.returnTo ?? '/', appBaseUrl) ?? appBaseUrl
 *     return new Response(null, { status: 302, headers: { Location: returnTo } })
 *   } } },
 * })
 * ```
 */

/** Options for {@link connectAccount}. */
export interface ConnectAccountOptions {
  /** Auth0 connection to link, e.g. `'google-oauth2'`. */
  connection: string
  /**
   * Scopes to request on the secondary connection. Space-separated, e.g.
   * `'email profile'`. Required (matches the foundation contract); pass an
   * empty string only if you intentionally want no additional scopes. Consult
   * the secondary provider's scope requirements.
   */
  connectionScope: string
  /**
   * Where to return after linking completes. Validated against the app's own
   * origin before being stored; an off-origin value is ignored (open-redirect
   * protection).
   */
  returnTo?: string
  /** Extra authorization parameters (e.g. `{ login_hint: 'user@gmail.com' }`). */
  authorizationParams?: AuthorizationParameters
}

function assertConnection(connection: string): void {
  if (typeof connection !== 'string' || connection.length === 0) {
    throw new InvalidConfigurationError('`connection` must be a non-empty string.')
  }
}

/**
 * Starts linking a secondary identity to the current primary account. Returns
 * the Auth0 authorization URL; the caller issues the redirect. Requires an
 * active session.
 *
 * @example
 * ```ts
 * const url = await connectAccount(auth0, {
 *   connection: 'google-oauth2',
 *   connectionScope: 'email profile',
 * })
 * throw redirect({ href: url.toString() })
 * ```
 */
export async function connectAccount(
  auth0: Auth0Instance,
  options: ConnectAccountOptions,
): Promise<URL> {
  assertConnection(options.connection)
  const { request, redirectUri } = resolvePerRequestRedirect(auth0)
  return auth0.client.startLinkUser({
    connection: options.connection,
    connectionScope: options.connectionScope,
    appState: toSafeAppState(auth0.config.appBaseUrl, options.returnTo, request),
    authorizationParams: perRequestAuthorizationParams(
      options.authorizationParams,
      redirectUri,
    ),
  })
}

/**
 * Completes the account-linking flow at the callback. Reads the callback URL,
 * links the secondary identity into the session, and returns the stored
 * `appState` (e.g. `returnTo`).
 */
export async function completeConnectAccount<TAppState = { returnTo?: string }>(
  auth0: Auth0Instance,
  url: URL,
): Promise<{ appState?: TAppState }> {
  return auth0.client.completeLinkUser<TAppState>(url)
}

/**
 * Options for {@link disconnectAccount}.
 *
 * Note: unlike {@link ConnectAccountOptions} there is no `connectionScope` —
 * unlinking does not re-authorize scopes on the secondary provider.
 */
export interface DisconnectAccountOptions {
  /** Auth0 connection of the identity to unlink, e.g. `'google-oauth2'`. */
  connection: string
  /**
   * Where to return after unlinking completes. Validated against the app's own
   * origin before being stored; an off-origin value is ignored (open-redirect
   * protection).
   */
  returnTo?: string
  /** Extra authorization parameters. */
  authorizationParams?: AuthorizationParameters
}

/**
 * Starts unlinking a secondary identity from the current primary account.
 * Returns the Auth0 authorization URL; the caller issues the redirect.
 *
 * @example
 * ```ts
 * const url = await disconnectAccount(auth0, { connection: 'google-oauth2' })
 * throw redirect({ href: url.toString() })
 * ```
 */
export async function disconnectAccount(
  auth0: Auth0Instance,
  options: DisconnectAccountOptions,
): Promise<URL> {
  assertConnection(options.connection)
  const { request, redirectUri } = resolvePerRequestRedirect(auth0)
  return auth0.client.startUnlinkUser({
    connection: options.connection,
    appState: toSafeAppState(auth0.config.appBaseUrl, options.returnTo, request),
    authorizationParams: perRequestAuthorizationParams(
      options.authorizationParams,
      redirectUri,
    ),
  })
}

/**
 * Completes the account-unlinking flow at the callback. Returns the stored
 * `appState` (e.g. `returnTo`).
 */
export async function completeDisconnectAccount<
  TAppState = { returnTo?: string },
>(auth0: Auth0Instance, url: URL): Promise<{ appState?: TAppState }> {
  return auth0.client.completeUnlinkUser<TAppState>(url)
}
