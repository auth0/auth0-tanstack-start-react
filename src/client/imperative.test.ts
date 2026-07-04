import { describe, expect, it, vi } from 'vitest'

// redirect() throws a tagged object we can assert on without the router runtime.
vi.mock('@tanstack/react-router', () => ({
  redirect: (opts: { href: string }) => {
    const err = new Error('REDIRECT') as Error & { href: string }
    err.href = opts.href
    return err
  },
}))

import { login, logout } from './imperative.js'
import type { ImperativeContext } from './imperative.js'

const ctx: ImperativeContext = {
  auth0: {
    user: undefined,
    isAuthenticated: false,
    status: 'resolved',
    isLoading: false,
  },
}

/** Captures the redirect error thrown by an imperative helper. */
function catchRedirect(fn: () => never): { href: string } {
  try {
    fn()
  } catch (e) {
    return e as { href: string }
  }
  throw new Error('expected a redirect to be thrown')
}

describe('login', () => {
  it('redirects to the default login path', () => {
    expect(catchRedirect(() => login(ctx)).href).toBe('/auth/login')
  })

  it('appends an encoded returnTo', () => {
    const href = catchRedirect(() => login(ctx, { returnTo: '/a b' })).href
    expect(href).toBe('/auth/login?returnTo=%2Fa%20b')
  })

  it('honors a custom loginPath', () => {
    expect(catchRedirect(() => login(ctx, { loginPath: '/signin' })).href).toBe(
      '/signin',
    )
  })
})

describe('logout', () => {
  it('redirects to the default logout path', () => {
    expect(catchRedirect(() => logout(ctx)).href).toBe('/auth/logout')
  })

  it('honors a custom logoutPath', () => {
    expect(
      catchRedirect(() => logout(ctx, { logoutPath: '/signout' })).href,
    ).toBe('/signout')
  })
})
