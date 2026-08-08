import { useAuth0Context, type Auth0ContextValue } from './provider.js'
import type { Auth0Status, Organization, User } from '../types/index.js'

/**
 * Returns the full auth state for the current user. Re-renders when auth state
 * changes between navigations.
 */
export function useAuth0(): {
  user: User | undefined
  isAuthenticated: boolean
  status: Auth0Status
  isLoading: boolean
} {
  const { user, isAuthenticated, status, isLoading } = useAuth0Context()
  return { user, isAuthenticated, status, isLoading }
}

/** Shorthand for `useAuth0().user`. */
export function useUser(): User | undefined {
  return useAuth0Context().user
}

/** Returns a function that redirects to the Auth0 login route. */
export function useLogin(): Auth0ContextValue['login'] {
  return useAuth0Context().login
}

/** Returns a function that clears the session and redirects to Auth0 logout. */
export function useLogout(): () => void {
  return useAuth0Context().logout
}

/** Returns the current organization from the session, or `undefined`. */
export function useOrg(): Organization | undefined {
  const { user } = useAuth0Context()
  if (!user?.org_id) return undefined
  // Only include `name` when the `org_name` claim is actually present. Emitting
  // an empty string would make a missing claim indistinguishable from an org
  // that genuinely has no name.
  return {
    id: user.org_id,
    ...(user.org_name ? { name: user.org_name } : {}),
  }
}
