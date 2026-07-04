import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import type { Auth0RouterContext } from '../types/index.js'

// The provider reads router context and the router instance. Mock both so we
// can drive the hydrated auth state and observe navigation without a real router.
let routeContextValue: Auth0RouterContext | undefined
const invalidate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: (opts: { select: (c: { auth0?: unknown }) => unknown }) =>
    opts.select({ auth0: routeContextValue }),
  useRouter: () => ({ invalidate }),
}))

import { Auth0Provider, useAuth0Context } from './provider.js'
import { getClientAuthCache } from './auth-cache.js'

const RESOLVED: Auth0RouterContext = {
  user: { sub: 'auth0|1' },
  isAuthenticated: true,
  status: 'resolved',
  isLoading: false,
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(Auth0Provider, { children })
}

beforeEach(() => {
  routeContextValue = undefined
  invalidate.mockClear()
  // jsdom does not implement navigation; stub assign so logout() is observable
  // without a noisy "Not implemented" warning.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign: vi.fn() },
  })
})

describe('Auth0Provider', () => {
  it('exposes the hydrated route context to consumers', () => {
    routeContextValue = RESOLVED
    const { result } = renderHook(() => useAuth0Context(), { wrapper })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.sub).toBe('auth0|1')
  })

  it('syncs the module cache after hydration', () => {
    routeContextValue = RESOLVED
    renderHook(() => useAuth0Context(), { wrapper })
    expect(getClientAuthCache()).toEqual(RESOLVED)
  })

  it('falls back to an unresolved state when no route context', () => {
    routeContextValue = undefined
    const { result } = renderHook(() => useAuth0Context(), { wrapper })
    expect(result.current.status).toBe('unresolved')
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('logout invalidates the router', () => {
    routeContextValue = RESOLVED
    const { result } = renderHook(() => useAuth0Context(), { wrapper })
    result.current.logout()
    expect(invalidate).toHaveBeenCalled()
  })
})

describe('useAuth0Context outside a provider', () => {
  it('throws a helpful error', () => {
    expect(() => renderHook(() => useAuth0Context())).toThrow(
      /must be used within <Auth0Provider>/,
    )
  })
})
