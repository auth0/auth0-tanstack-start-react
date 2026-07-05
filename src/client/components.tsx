import type { ReactNode } from 'react'
import { useAuth0Context } from './provider.js'

/** Renders children only when the user is authenticated. */
export function SignedIn({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth0Context()
  return isAuthenticated ? <>{children}</> : null
}

/** Renders children only when the user is NOT authenticated. */
export function SignedOut({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth0Context()
  return !isAuthenticated && !isLoading ? <>{children}</> : null
}

/**
 * Renders children when the user belongs to organization `orgId`.
 * Matches on `org_id` only, consistent with `requireOrg` and the server
 * middleware (`org_name` is an optional claim, so it is not used here).
 */
export function HasOrg({
  orgId,
  fallback = null,
  children,
}: {
  orgId: string
  fallback?: ReactNode
  children: ReactNode
}) {
  const { user } = useAuth0Context()
  return user?.org_id === orgId ? <>{children}</> : <>{fallback}</>
}

/**
 * Renders children while auth state is still resolving (`isLoading: true`).
 * In RWA/SSR auth is resolved server-side, so `isLoading` is effectively always
 * `false` and this never renders — it is safe to include but a no-op.
 */
export function AuthLoading({ children }: { children: ReactNode }) {
  const { isLoading } = useAuth0Context()
  return isLoading ? <>{children}</> : null
}

/** Renders children once auth state is definitively known (`status: 'resolved'`). */
export function AuthReady({ children }: { children: ReactNode }) {
  const { status } = useAuth0Context()
  return status === 'resolved' ? <>{children}</> : null
}
