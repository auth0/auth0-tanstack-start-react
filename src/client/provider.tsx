import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useRouteContext, useRouter } from '@tanstack/react-router'
import type {
  Auth0RouterContext,
  AuthorizationParameters,
} from '../types/index.js'
import { setClientAuthCache, clearClientAuthCache } from './auth-cache.js'

/** Extra options accepted by the client `login` redirect. */
export interface LoginRedirectOptions {
  /**
   * Extra OIDC authorization parameters (e.g. `screen_hint`, `connection`,
   * `login_hint`, `prompt`). Forwarded as query params to the login route,
   * where the server handler filters and applies them.
   */
  authorizationParams?: AuthorizationParameters
}

/**
 * Internal React context carrying the live auth state plus the imperative
 * actions. Consumed by the SDK hooks; not exported directly.
 */
export interface Auth0ContextValue extends Auth0RouterContext {
  /** Redirects the browser to the Auth0 login route. */
  login: (returnTo?: string, options?: LoginRedirectOptions) => void
  /** Clears the client cache and redirects to the Auth0 logout route. */
  logout: () => void
  /** Login / logout route paths (for imperative navigation). */
  routes: { login: string; logout: string }
}

const Auth0Context = createContext<Auth0ContextValue | null>(null)

/**
 * The raw React context, exported for test utilities that need to inject a
 * mocked value directly (see `/testing`'s `Auth0TestProvider`).
 * @internal
 */
export const Auth0ContextForTesting = Auth0Context

/** @internal */
export function useAuth0Context(): Auth0ContextValue {
  const ctx = useContext(Auth0Context)
  if (!ctx) {
    throw new Error(
      'Auth0 hooks must be used within <Auth0Provider>. ' +
        'Wrap your app (in __root.tsx) with <Auth0Provider>.',
    )
  }
  return ctx
}

/**
 * Props for {@link Auth0Provider}. In RWA/SSR mode the provider reads the
 * server-hydrated auth state from route context, so configuration props are
 * optional — only route-path overrides are accepted.
 */
export interface Auth0ProviderProps {
  children: ReactNode
  /** Override the login route path. Default: `/auth/login`. */
  loginPath?: string
  /** Override the logout route path. Default: `/auth/logout`. */
  logoutPath?: string
}

/**
 * Root provider. Place in `__root.tsx`. In RWA/SSR mode it reads the auth state
 * resolved server-side (via `auth0BeforeLoad()` → `context.auth0`), keeps the
 * client-side cache in sync for zero-round-trip client navigation, and exposes
 * reactive auth state + login/logout actions to the hooks and components.
 */
export function Auth0Provider({
  children,
  loginPath = '/auth/login',
  logoutPath = '/auth/logout',
}: Auth0ProviderProps) {
  // Read the auth state hydrated into the root route context.
  const routeContext = useRouteContext({
    from: '__root__',
    select: (ctx: { auth0?: Auth0RouterContext }) => ctx.auth0,
  }) as Auth0RouterContext | undefined

  const [authState] = useState<Auth0RouterContext>(
    () =>
      routeContext ?? {
        user: undefined,
        isAuthenticated: false,
        status: 'unresolved',
        isLoading: false,
      },
  )

  // Keep the module-level cache in sync so client-side navigations
  // (auth0BeforeLoad) read the resolved state without a server round-trip.
  useEffect(() => {
    if (routeContext) setClientAuthCache(routeContext)
  }, [routeContext])

  const router = useRouter()
  const current = routeContext ?? authState

  const value = useMemo<Auth0ContextValue>(() => {
    const navigate = (href: string) => {
      window.location.assign(href)
    }
    return {
      ...current,
      routes: { login: loginPath, logout: logoutPath },
      login: (returnTo?: string, options?: LoginRedirectOptions) => {
        const params = new URLSearchParams()
        if (returnTo) params.set('returnTo', returnTo)
        // Forward extra authorization params (e.g. screen_hint, connection,
        // prompt) as query params; the server login handler reads and filters
        // them before starting the interactive login.
        for (const [key, value] of Object.entries(
          options?.authorizationParams ?? {},
        )) {
          if (value != null) params.set(key, String(value))
        }
        const query = params.toString()
        navigate(query ? `${loginPath}?${query}` : loginPath)
      },
      logout: () => {
        clearClientAuthCache()
        // Allow query-cache invalidation listeners to react before navigating.
        void router.invalidate()
        navigate(logoutPath)
      },
    }
  }, [current, loginPath, logoutPath, router])

  return <Auth0Context.Provider value={value}>{children}</Auth0Context.Provider>
}
