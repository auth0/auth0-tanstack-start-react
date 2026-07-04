import type { Auth0RouterContext } from '../types/index.js'
import { getClientAuthCache } from './auth-cache.js'

/**
 * The initial sentinel value for `context.auth0`. Passed to the router as the
 * starting context for TypeScript inference; replaced at runtime by real auth
 * state. Its status is `unresolved`, so if a guard ever reads it (because
 * neither the server middleware nor the client cache populated the context),
 * the guard redirects rather than silently passing.
 */
export const auth0RouterContext: Auth0RouterContext = {
  user: undefined,
  isAuthenticated: false,
  status: 'unresolved',
  isLoading: false,
}

/**
 * SDK-provided `beforeLoad` factory. Set once on the root route; populates
 * `context.auth0` for the entire route tree.
 *
 * - On the server (SSR): reads `serverContext.auth0` already set by
 *   `auth0Middleware` — synchronous, no extra session read, no network call.
 * - On the client (after hydration): reads the module-level cache that
 *   `Auth0Provider` maintains — zero server round-trips on client navigation.
 * - Fallback: the {@link auth0RouterContext} sentinel.
 *
 * @example
 * ```ts
 * // src/routes/__root.tsx
 * export const Route = createRootRouteWithContext<{ auth0: Auth0RouterContext }>()({
 *   beforeLoad: auth0BeforeLoad(),
 *   component: Root,
 * })
 * ```
 */
export function auth0BeforeLoad() {
  return ({
    serverContext,
  }: {
    serverContext?: { auth0?: Auth0RouterContext }
  } = {}): { auth0: Auth0RouterContext } => ({
    auth0:
      serverContext?.auth0 ?? getClientAuthCache() ?? auth0RouterContext,
  })
}
