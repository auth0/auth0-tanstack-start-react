import type { Auth0RouterContext } from '../types/index.js'

/**
 * Module-level snapshot of the resolved auth state on the client.
 *
 * Why this exists: TanStack Router's `beforeLoad` runs outside React and reads
 * route `context` synchronously. On the server (SSR) the auth context is set by
 * `auth0Middleware`; on the client, after hydration, subsequent client-side
 * navigations have no server round-trip — `auth0BeforeLoad()` reads this cache
 * instead. `Auth0Provider` keeps it in sync with the hydrated session.
 */
let clientAuthCache: Auth0RouterContext | undefined

/** Reads the current client-side auth snapshot (undefined before hydration). */
export function getClientAuthCache(): Auth0RouterContext | undefined {
  return clientAuthCache
}

/** Sets the client-side auth snapshot. Called by `Auth0Provider` after hydration. */
export function setClientAuthCache(value: Auth0RouterContext): void {
  clientAuthCache = value
}

/** Clears the client-side auth snapshot. Called on logout. */
export function clearClientAuthCache(): void {
  clientAuthCache = undefined
}
