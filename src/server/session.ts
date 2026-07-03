import type { Auth0Instance } from './auth0-server.js'
import { toSessionData, toTokenSet } from './session-mapper.js'
import { AccessTokenError } from '../errors/index.js'
import type {
  AccessTokenResponse,
  SessionData,
  TokenSet,
} from '../types/index.js'

/**
 * Options for {@link getAccessToken}.
 */
export interface GetAccessTokenOptions {
  /** Request a token for a specific API audience. */
  audience?: string
  /** Request specific scopes. */
  scope?: string
}

/**
 * Returns the current session on the server, or `null` when there is no valid
 * session. The session holds the authenticated state for the request, including
 * the user identity claims (`session.user`) alongside token data. Use it in a
 * server function, loader, or route handler that needs the signed-in user or
 * their session. Reads and decrypts the session cookie; the request is resolved
 * implicitly from the ambient TanStack Start server context.
 *
 * @example
 * ```ts
 * const session = await getSession(auth0)
 * if (!session) throw redirect({ to: '/auth/login' })
 * const user = session.user
 * ```
 */
export async function getSession(
  auth0: Auth0Instance,
): Promise<SessionData | null> {
  const session = await auth0.client.getSession()
  return toSessionData(session, auth0.config.audience)
}

/**
 * Resolves a fresh access token for the current session, silently refreshing
 * if the cached token has expired. Throws {@link AccessTokenError} when no
 * valid token can be obtained.
 */
export async function getAccessToken(
  auth0: Auth0Instance,
  options: GetAccessTokenOptions = {},
): Promise<AccessTokenResponse> {
  try {
    const tokenSet = await auth0.client.getAccessToken({
      audience: options.audience,
      scope: options.scope,
    })
    return {
      token: tokenSet.accessToken,
      expiresAt: tokenSet.expiresAt,
      scope: tokenSet.scope,
    }
  } catch (error) {
    throw new AccessTokenError(
      error instanceof Error ? error.message : 'Unable to obtain an access token.',
      { cause: error },
    )
  }
}

/**
 * Returns the full token set stored in the current session, or `null` when
 * there is no session. Does not trigger a refresh.
 */
export async function getTokenSet(
  auth0: Auth0Instance,
): Promise<TokenSet | null> {
  const session = await auth0.client.getSession()
  return toTokenSet(session, auth0.config.audience)
}

/**
 * Returns a `fetch`-compatible function that automatically attaches the
 * current session's access token as a Bearer `Authorization` header on every
 * outbound request.
 *
 * @example
 * ```ts
 * const fetcher = createFetcher(auth0, { audience: 'https://api.example.com' })
 * const res = await fetcher('https://api.example.com/items')
 * ```
 */
export function createFetcher(
  auth0: Auth0Instance,
  options: GetAccessTokenOptions = {},
): (url: string | URL, init?: RequestInit) => Promise<Response> {
  return async (url, init = {}) => {
    const { token } = await getAccessToken(auth0, options)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...init, headers })
  }
}
