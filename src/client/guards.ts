import { redirect } from '@tanstack/react-router'
import type { Auth0RouterContext } from '../types/index.js'

/**
 * The slice of TanStack Router's `beforeLoad` context the guards read. Kept
 * minimal so the guards work in any route's `beforeLoad`.
 */
export interface GuardContext {
  context: { auth0: Auth0RouterContext }
}

const DEFAULT_LOGIN_PATH = '/auth/login'

/** Common options shared by the route guards. */
export interface GuardOptions {
  /** Where to send unauthenticated users. Default: `/auth/login`. */
  loginPath?: string
  /** Where to send the user back to after login. */
  returnTo?: string
  /** Where to send authenticated-but-unauthorized users. Default: `/403`. */
  unauthorizedPath?: string
}

/**
 * Decides whether a guard should stop early because auth is genuinely still
 * loading. Returns `true` only for the `loading` status. For `unresolved` it
 * warns (in development) and returns `false` so the guard keeps going and
 * redirects, which means an unwired context fails closed instead of open.
 */
function shouldWaitForAuth(context: Auth0RouterContext): boolean {
  if (context.status === 'loading') return true
  if (context.status === 'unresolved' && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[auth0] Route context is unresolved. This usually means auth0Middleware ' +
        'or Auth0Provider is not wired up. Treating the request as ' +
        'unauthenticated and redirecting.',
    )
  }
  return false
}

/**
 * `beforeLoad` guard. Redirects unauthenticated users to the login route,
 * preserving the intended destination as `returnTo`.
 *
 * @example
 * ```ts
 * export const Route = createFileRoute('/_authenticated')({
 *   beforeLoad: requireAuth(),
 * })
 * ```
 */
export function requireAuth(options: GuardOptions = {}) {
  const loginPath = options.loginPath ?? DEFAULT_LOGIN_PATH
  return ({ context }: GuardContext) => {
    if (shouldWaitForAuth(context.auth0)) return
    if (!context.auth0.isAuthenticated) {
      const returnTo = options.returnTo
      throw redirect({
        href: returnTo
          ? `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`
          : loginPath,
        // The auth routes are handled at the HTTP middleware layer, not in the
        // router tree. Without this, a client-side navigation makes the router
        // try to match `/auth/login` internally and 404. Forcing a full-document
        // navigation lets the server middleware handle the redirect.
        reloadDocument: true,
      })
    }
  }
}

/**
 * `beforeLoad` guard. Redirects users not in organization `orgId`.
 *
 * Matches on `org_id` only, the same as the server middleware
 * (`requireOrgMiddleware`, `withApiOrg`). `org_id` is always present on the
 * session; `org_name` is an optional custom claim, so matching on it would let
 * a value pass the client guard but fail the server check.
 */
export function requireOrg(orgId: string, options: GuardOptions = {}) {
  const loginPath = options.loginPath ?? DEFAULT_LOGIN_PATH
  return ({ context }: GuardContext) => {
    if (shouldWaitForAuth(context.auth0)) return
    if (!context.auth0.isAuthenticated || context.auth0.user?.org_id !== orgId) {
      throw redirect({
        href: `${loginPath}?organization=${encodeURIComponent(orgId)}`,
        reloadDocument: true,
      })
    }
  }
}
