import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useAuth0, useUser, useOrg } from './hooks.js'
import { Auth0TestProvider } from '../testing/index.js'

function wrapper(props: { user?: Record<string, unknown> }) {
  return ({ children }: { children: ReactNode }) =>
    createElement(Auth0TestProvider, { user: props.user, children })
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
