import { describe, expect, it, vi } from 'vitest'

// redirect() throws a tagged object we can assert on without the router runtime.
vi.mock('@tanstack/react-router', () => ({
  redirect: (opts: { href: string; reloadDocument?: boolean }) => {
    const err = new Error('REDIRECT') as Error & {
      href: string
      reloadDocument?: boolean
    }
    err.href = opts.href
    err.reloadDocument = opts.reloadDocument
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
function catchRedirect(fn: () => never): { href: string; reloadDocument?: boolean } {
  try {
    fn()
  } catch (e) {
    return e as { href: string; reloadDocument?: boolean }
  }
  throw new Error('expected a redirect to be thrown')
}

describe('login', () => {
  it('redirects to the default login path', () => {
    expect(catchRedirect(() => login(ctx)).href).toBe('/auth/login')
  })

  it('appends an encoded returnTo', () => {
    const href = catchRedirect(() => login(ctx, { returnTo: '/a b' })).href
    expect(href).toBe('/auth/login?returnTo=%2Fa+b')
  })

  it('forwards authorizationParams (e.g. acr_values for a step-up)', () => {
    const href = catchRedirect(() =>
      login(ctx, { authorizationParams: { acr_values: 'urn:mfa', prompt: 'login' } }),
    ).href
    expect(href).toBe('/auth/login?acr_values=urn%3Amfa&prompt=login')
  })

  it('combines returnTo with authorizationParams', () => {
    const href = catchRedirect(() =>
      login(ctx, {
        returnTo: '/settings',
        authorizationParams: { screen_hint: 'signup' },
      }),
    ).href
    expect(href).toBe('/auth/login?returnTo=%2Fsettings&screen_hint=signup')
  })

  it('honors a custom loginPath', () => {
    expect(catchRedirect(() => login(ctx, { loginPath: '/signin' })).href).toBe(
      '/signin',
    )
  })

  it('forces a full-document navigation', () => {
    expect(catchRedirect(() => login(ctx)).reloadDocument).toBe(true)
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

  it('forces a full-document navigation', () => {
    expect(catchRedirect(() => logout(ctx)).reloadDocument).toBe(true)
  })
})
