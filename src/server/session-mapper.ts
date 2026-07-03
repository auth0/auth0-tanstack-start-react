import type { SessionData as FoundationSessionData } from '@auth0/auth0-server-js'
import type {
  Auth0RouterContext,
  SessionData,
  TokenSet,
  User,
} from '../types/index.js'
import { DEFAULT_AUDIENCE_KEY } from './config.js'

/**
 * The foundation (`@auth0/auth0-server-js`) stores tokens as an array of
 * `tokenSets` keyed by audience. Our public {@link SessionData} surfaces the
 * access token flat, which is what TanStack apps consume. This module is the
 * single translation point between the two shapes.
 */

/**
 * Picks the token set for a given audience, matching how the foundation itself
 * resolves tokens: an unset audience maps to the `'default'` cache key. Picking
 * `tokenSets[0]` would be arbitrary and returns the wrong token for apps that
 * hold tokens for more than one audience.
 */
function selectTokenSet(session: FoundationSessionData, audience?: string) {
  const target = audience ?? DEFAULT_AUDIENCE_KEY
  return session.tokenSets.find((set) => set.audience === target)
}

/**
 * Maps a foundation session into the SDK's public {@link SessionData}, or
 * `null` when there is no authenticated user. `audience` selects which token
 * set to surface; when omitted, the `'default'` audience is used.
 */
export function toSessionData(
  session: FoundationSessionData | undefined,
  audience?: string,
): SessionData | null {
  if (!session || !session.user) return null
  const token = selectTokenSet(session, audience)
  return {
    user: session.user as User,
    idToken: session.idToken,
    accessToken: token?.accessToken ?? '',
    accessTokenScope: token?.scope,
    accessTokenExpiresAt: token?.expiresAt ?? 0,
    refreshToken: session.refreshToken,
    tokenType: 'Bearer',
    // Only surface createdAt when the store actually recorded it. Fabricating
    // Date.now() here would make the session look freshly created on every read.
    createdAt:
      typeof session.internal === 'object' &&
      session.internal &&
      'createdAt' in session.internal
        ? (session.internal as { createdAt: number }).createdAt
        : undefined,
  }
}

/**
 * Maps a foundation session into the router-facing {@link Auth0RouterContext}.
 *
 * Deliberately carries ONLY non-secret display claims (`user`,
 * `isAuthenticated`). No tokens or session body: this context is dehydrated into
 * the client HTML by TanStack Router, so putting tokens here would expose them
 * to the browser. Server code reads tokens via `getSession`/`getAccessToken`.
 */
export function toAuth0RouterContext(
  session: FoundationSessionData | undefined,
): Auth0RouterContext {
  // The router context carries no tokens, so the audience is irrelevant here.
  const data = toSessionData(session)
  return {
    user: data?.user,
    isAuthenticated: data !== null,
    // RWA/SSR: auth state is resolved server-side before any HTML is sent.
    status: 'resolved',
    isLoading: false,
  }
}

/** Maps a foundation token set into the SDK's public {@link TokenSet}. */
export function toTokenSet(
  session: FoundationSessionData | undefined,
  audience?: string,
): TokenSet | null {
  if (!session) return null
  const token = selectTokenSet(session, audience)
  if (!token) return null
  return {
    accessToken: token.accessToken,
    refreshToken: session.refreshToken,
    idToken: session.idToken,
    expiresAt: token.expiresAt,
    scope: token.scope,
    tokenType: 'Bearer',
  }
}
