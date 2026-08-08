import { redirect } from '@tanstack/react-router'
import type { Auth0RouterContext, LoginOptions, LogoutOptions } from '../types/index.js'

/** Router context shape these imperative helpers read. */
export interface ImperativeContext {
  auth0: Auth0RouterContext
}

/**
 * Imperative login redirect for use in a `loader` or `beforeLoad`. Throws a
 * TanStack Router `redirect()` to the login route.
 */
export function login(
  _context: ImperativeContext,
  options: LoginOptions & { loginPath?: string } = {},
): never {
  const loginPath = options.loginPath ?? '/auth/login'
  const href = options.returnTo
    ? `${loginPath}?returnTo=${encodeURIComponent(options.returnTo)}`
    : loginPath
  // The auth routes live at the HTTP middleware layer, not in the router tree,
  // so a relative redirect must force a full-document navigation or the router
  // 404s trying to match it internally.
  throw redirect({ href, reloadDocument: true })
}

/**
 * Imperative logout redirect for use in a `loader` or `beforeLoad`. Throws a
 * TanStack Router `redirect()` to the logout route.
 */
export function logout(
  _context: ImperativeContext,
  options: LogoutOptions & { logoutPath?: string } = {},
): never {
  const logoutPath = options.logoutPath ?? '/auth/logout'
  throw redirect({ href: logoutPath, reloadDocument: true })
}
