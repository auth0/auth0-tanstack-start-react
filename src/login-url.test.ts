import { describe, expect, it } from 'vitest'
import { buildLoginHref } from './login-url.js'

describe('buildLoginHref', () => {
  it('returns the bare path when there are no params', () => {
    expect(buildLoginHref('/auth/login')).toBe('/auth/login')
  })

  it('encodes returnTo', () => {
    expect(buildLoginHref('/auth/login', { returnTo: '/a b' })).toBe(
      '/auth/login?returnTo=%2Fa+b',
    )
  })

  it('emits returnTo before authorizationParams', () => {
    expect(
      buildLoginHref('/auth/login', {
        returnTo: '/x',
        authorizationParams: { prompt: 'login' },
      }),
    ).toBe('/auth/login?returnTo=%2Fx&prompt=login')
  })

  it('skips null and undefined authorization values', () => {
    expect(
      buildLoginHref('/auth/login', {
        authorizationParams: { a: undefined, b: null, c: 'x' },
      }),
    ).toBe('/auth/login?c=x')
  })

  it('coerces numbers such as max_age', () => {
    expect(
      buildLoginHref('/auth/login', { authorizationParams: { max_age: 90 } }),
    ).toBe('/auth/login?max_age=90')
  })

  it('honors a custom login path', () => {
    expect(
      buildLoginHref('/signin', { authorizationParams: { screen_hint: 'signup' } }),
    ).toBe('/signin?screen_hint=signup')
  })
})
