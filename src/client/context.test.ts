import { describe, expect, it } from 'vitest'
import { auth0BeforeLoad, auth0RouterContext } from './context.js'

/**
 * C1 guard: the client route context is dehydrated into the SSR HTML by
 * TanStack Router, so it must never carry tokens or the session body.
 */
const TOKEN_KEYS = ['session', 'accessToken', 'refreshToken', 'idToken']

describe('auth0RouterContext sentinel', () => {
  it('carries only non-secret display fields and is unresolved', () => {
    expect(auth0RouterContext).toEqual({
      user: undefined,
      isAuthenticated: false,
      status: 'unresolved',
      isLoading: false,
    })
    for (const key of TOKEN_KEYS) {
      expect(auth0RouterContext).not.toHaveProperty(key)
    }
  })
})

describe('auth0BeforeLoad', () => {
  it('returns the server context as-is without adding token fields', () => {
    const serverAuth0 = {
      user: { sub: 'auth0|1', name: 'Alice' },
      isAuthenticated: true,
      status: 'resolved' as const,
      isLoading: false,
    }
    const result = auth0BeforeLoad()({ serverContext: { auth0: serverAuth0 } })
    expect(result.auth0).toBe(serverAuth0)
    for (const key of TOKEN_KEYS) {
      expect(result.auth0).not.toHaveProperty(key)
    }
  })

  it('falls back to the sentinel (no tokens) when nothing is resolved', () => {
    const result = auth0BeforeLoad()()
    expect(result.auth0).toBe(auth0RouterContext)
    expect(JSON.stringify(result.auth0)).not.toMatch(/token/i)
  })
})
