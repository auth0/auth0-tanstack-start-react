import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import type { Auth0RouterContext } from '../types/index.js'

// The real Auth0Provider (used by the useLogin/useLogout tests) reads router
// context and the router instance. Mock both. Auth0TestProvider (used by the
// other tests) does not touch these hooks, so it is unaffected.
let routeContextValue: Auth0RouterContext | undefined
const invalidate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useRouteContext: (opts: { select: (c: { auth0?: unknown }) => unknown }) =>
    opts.select({ auth0: routeContextValue }),
  useRouter: () => ({ invalidate }),
}))

import { useAuth0, useUser, useOrg, useLogin, useLogout } from './hooks.js'
import { Auth0TestProvider } from '../testing/index.js'
import { Auth0Provider } from './provider.js'
import { getClientAuthCache } from './auth-cache.js'

function wrapper(props: { user?: Record<string, unknown> }) {
  return ({ children }: { children: ReactNode }) =>
    createElement(Auth0TestProvider, { user: props.user, children })
}

function providerWrapper({ children }: { children: ReactNode }) {
  return createElement(Auth0Provider, { children })
}

describe('useAuth0', () => {
  it('exposes user, isAuthenticated, status and isLoading when signed in', () => {
    const { result } = renderHook(() => useAuth0(), {
      wrapper: wrapper({ user: { sub: 'auth0|1', name: 'Alice' } }),
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.sub).toBe('auth0|1')
    expect(result.current.status).toBe('resolved')
    expect(result.current.isLoading).toBe(false)
  })

  it('reports unauthenticated when no user', () => {
    const { result } = renderHook(() => useAuth0(), { wrapper: wrapper({}) })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeUndefined()
  })
})

describe('useUser', () => {
  it('returns the user object', () => {
    const { result } = renderHook(() => useUser(), {
      wrapper: wrapper({ user: { sub: 'auth0|1' } }),
    })
    expect(result.current?.sub).toBe('auth0|1')
  })
})

describe('useOrg', () => {
  it('returns undefined without an org_id', () => {
    const { result } = renderHook(() => useOrg(), {
      wrapper: wrapper({ user: { sub: 'auth0|1' } }),
    })
    expect(result.current).toBeUndefined()
  })

  it('maps org_id/org_name to an Organization', () => {
    const { result } = renderHook(() => useOrg(), {
      wrapper: wrapper({ user: { sub: 'x', org_id: 'org_1', org_name: 'acme' } }),
    })
    expect(result.current).toEqual({ id: 'org_1', name: 'acme' })
  })
})

describe('useLogin / useLogout', () => {
  let assign: ReturnType<typeof vi.fn>

  beforeEach(() => {
    routeContextValue = {
      user: { sub: 'auth0|1' },
      isAuthenticated: true,
      status: 'resolved',
      isLoading: false,
    }
    invalidate.mockClear()
    assign = vi.fn()
    // jsdom does not implement navigation; stub assign so the redirect is
    // observable without a "Not implemented" warning.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    })
  })

  it('useLogin navigates to the login route with an encoded returnTo', () => {
    const { result } = renderHook(() => useLogin(), { wrapper: providerWrapper })
    result.current('/dashboard')
    expect(assign).toHaveBeenCalledWith('/auth/login?returnTo=%2Fdashboard')
  })

  it('useLogin forwards authorizationParams as query params', () => {
    const { result } = renderHook(() => useLogin(), { wrapper: providerWrapper })
    result.current(undefined, { authorizationParams: { screen_hint: 'signup' } })
    expect(assign).toHaveBeenCalledWith('/auth/login?screen_hint=signup')
  })

  it('useLogout clears the client cache, invalidates the router, and navigates', () => {
    const { result } = renderHook(() => useLogout(), { wrapper: providerWrapper })
    result.current()
    expect(getClientAuthCache()).toBeUndefined()
    expect(invalidate).toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith('/auth/logout')
  })
})
