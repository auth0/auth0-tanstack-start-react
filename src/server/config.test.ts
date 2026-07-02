import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getConfig,
  resolveAppBaseUrl,
  inferAppBaseUrlFromRequest,
  toSafeRedirect,
  toSafeAppState,
  usesPerRequestRedirectUri,
} from './config.js'
import { InvalidConfigurationError } from '../errors/index.js'

const VALID = {
  domain: 'tenant.auth0.com',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  secret: 'x'.repeat(32),
  appBaseUrl: 'https://app.example.com',
}

describe('getConfig', () => {
  const ENV_KEYS = [
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'AUTH0_SECRET',
    'APP_BASE_URL',
    'AUTH0_AUDIENCE',
  ]
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = {}
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('resolves from explicit options', () => {
    const cfg = getConfig(VALID)
    expect(cfg.domain).toBe('tenant.auth0.com')
    expect(cfg.clientId).toBe('client-id')
  })

  it('reads from environment variables when options omitted', () => {
    process.env.AUTH0_DOMAIN = 'env.auth0.com'
    process.env.AUTH0_CLIENT_ID = 'env-client'
    process.env.AUTH0_CLIENT_SECRET = 'env-secret'
    process.env.AUTH0_SECRET = 'y'.repeat(32)
    process.env.APP_BASE_URL = 'https://env.example.com'
    process.env.AUTH0_AUDIENCE = 'https://api.example.com'

    const cfg = getConfig()
    expect(cfg.domain).toBe('env.auth0.com')
    expect(cfg.audience).toBe('https://api.example.com')
  })

  it('explicit options take precedence over env vars', () => {
    process.env.AUTH0_DOMAIN = 'env.auth0.com'
    const cfg = getConfig(VALID)
    expect(cfg.domain).toBe('tenant.auth0.com')
  })

  it('throws when required fields are missing', () => {
    expect(() => getConfig({ domain: 'only.auth0.com' })).toThrow(
      InvalidConfigurationError,
    )
  })

  it('makes appBaseUrl optional when domain is a resolver (MCD)', () => {
    const resolver = () => 'brand-a.custom-domain.com'
    const cfg = getConfig({
      domain: resolver,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      secret: 'x'.repeat(32),
      // no appBaseUrl
    })
    expect(cfg.domain).toBe(resolver)
    expect(cfg.appBaseUrl).toBeUndefined()
  })

  it('still requires appBaseUrl with a static string domain', () => {
    expect(() =>
      getConfig({
        domain: 'tenant.auth0.com',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        secret: 'x'.repeat(32),
        // no appBaseUrl
      }),
    ).toThrow(/appBaseUrl/)
  })

  it('throws when secret is shorter than 32 bytes', () => {
    expect(() => getConfig({ ...VALID, secret: 'too-short' })).toThrow(
      /at least 32 bytes/,
    )
  })

  it('counts bytes, not characters, for the secret length', () => {
    // 16 multi-byte chars = 16 UTF-16 code units but 48 UTF-8 bytes. The old
    // char-count check would have wrongly rejected this valid 48-byte secret.
    const multiByteSecret = 'é'.repeat(24) // 24 chars, 48 bytes
    expect(() => getConfig({ ...VALID, secret: multiByteSecret })).not.toThrow()
    // 20 two-byte chars = 40 bytes but only 20 code units: passes on bytes,
    // would have failed on the old char check.
    const twentyChars = 'é'.repeat(20)
    expect(() => getConfig({ ...VALID, secret: twentyChars })).not.toThrow()
    // A genuinely short secret (10 bytes) still throws.
    expect(() => getConfig({ ...VALID, secret: 'é'.repeat(5) })).toThrow(
      /at least 32 bytes/,
    )
  })
})

describe('getConfig insecure cookie warning', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let savedNodeEnv: string | undefined

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = savedNodeEnv
  })

  it('warns when secure:false in production', () => {
    process.env.NODE_ENV = 'production'
    getConfig({ ...VALID, sessionConfiguration: { cookie: { secure: false } } })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`secure` is set to false'))
  })

  it("warns when sameSite:'none' without secure in production", () => {
    process.env.NODE_ENV = 'production'
    getConfig({ ...VALID, sessionConfiguration: { cookie: { sameSite: 'none' } } })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("`sameSite` is 'none'"))
  })

  it('does not warn outside production', () => {
    process.env.NODE_ENV = 'development'
    getConfig({ ...VALID, sessionConfiguration: { cookie: { secure: false } } })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not warn for a secure cookie in production', () => {
    process.env.NODE_ENV = 'production'
    getConfig({
      ...VALID,
      sessionConfiguration: { cookie: { secure: true, sameSite: 'none' } },
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('resolveAppBaseUrl', () => {
  it('returns a static string as-is', () => {
    expect(resolveAppBaseUrl('https://app.example.com')).toBe(
      'https://app.example.com',
    )
  })

  it('matches the request origin against an allow-list', () => {
    const req = new Request('https://preview.example.com/page')
    expect(
      resolveAppBaseUrl(
        ['https://app.example.com', 'https://preview.example.com'],
        req,
      ),
    ).toBe('https://preview.example.com')
  })

  it('throws when the request origin is not in the allow-list', () => {
    const req = new Request('https://evil.example.com/page')
    expect(() =>
      resolveAppBaseUrl(['https://app.example.com'], req),
    ).toThrow(InvalidConfigurationError)
  })

  it('falls back to the first allowed origin when no request is given', () => {
    expect(resolveAppBaseUrl(['https://a.example.com', 'https://b.example.com'])).toBe(
      'https://a.example.com',
    )
  })

  it('infers from the request when appBaseUrl is undefined (MCD)', () => {
    const req = new Request('https://brand-a.example.com/auth/login', {
      headers: { host: 'brand-a.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(resolveAppBaseUrl(undefined, req)).toBe('https://brand-a.example.com')
  })

  it('throws when appBaseUrl is undefined and no request is available', () => {
    expect(() => resolveAppBaseUrl(undefined)).toThrow(InvalidConfigurationError)
  })
})

describe('inferAppBaseUrlFromRequest', () => {
  it('builds the base URL from Host and X-Forwarded-Proto', () => {
    const req = new Request('http://internal/auth/login', {
      headers: { host: 'brand-a.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(inferAppBaseUrlFromRequest(req)).toBe('https://brand-a.example.com')
  })

  it('prefers X-Forwarded-Host over Host', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        host: 'internal.local',
        'x-forwarded-host': 'public.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    expect(inferAppBaseUrlFromRequest(req)).toBe('https://public.example.com')
  })

  it('takes the first value of a comma-separated X-Forwarded-Proto', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        host: 'brand-a.example.com',
        'x-forwarded-proto': 'https, http',
      },
    })
    expect(inferAppBaseUrlFromRequest(req)).toBe('https://brand-a.example.com')
  })

  it('falls back to the request URL protocol when no forwarded proto', () => {
    const req = new Request('https://brand-a.example.com/auth/login', {
      headers: { host: 'brand-a.example.com' },
    })
    expect(inferAppBaseUrlFromRequest(req)).toBe('https://brand-a.example.com')
  })

  it('throws when there is no Host header', () => {
    // A Request with no host header at all: construct from a URL then strip it.
    const req = new Request('https://placeholder.example/auth/login')
    req.headers.delete('host')
    expect(() => inferAppBaseUrlFromRequest(req)).toThrow(InvalidConfigurationError)
  })
})

describe('usesPerRequestRedirectUri', () => {
  it('is true when domain is a resolver', () => {
    expect(
      usesPerRequestRedirectUri({
        domain: () => 'brand-a.example.com',
        appBaseUrl: undefined,
      }),
    ).toBe(true)
  })

  it('is true when appBaseUrl is an allow-list', () => {
    expect(
      usesPerRequestRedirectUri({
        domain: 'tenant.auth0.com',
        appBaseUrl: ['https://a.example.com', 'https://b.example.com'],
      }),
    ).toBe(true)
  })

  it('is false for a static string domain and appBaseUrl', () => {
    expect(
      usesPerRequestRedirectUri({
        domain: 'tenant.auth0.com',
        appBaseUrl: 'https://app.example.com',
      }),
    ).toBe(false)
  })
})

describe('toSafeRedirect', () => {
  const base = 'https://app.example.com'

  it('allows a same-origin absolute URL', () => {
    expect(toSafeRedirect('https://app.example.com/dashboard', base)).toBe(
      'https://app.example.com/dashboard',
    )
  })

  it('resolves a relative path against the base', () => {
    expect(toSafeRedirect('/dashboard', base)).toBe(
      'https://app.example.com/dashboard',
    )
  })

  it('rejects a cross-origin redirect', () => {
    expect(toSafeRedirect('https://evil.example.com/phish', base)).toBeUndefined()
  })
})

describe('toSafeAppState', () => {
  const base = 'https://app.example.com'

  it('returns undefined when returnTo is absent', () => {
    expect(toSafeAppState(base)).toBeUndefined()
    expect(toSafeAppState(base, '')).toBeUndefined()
  })

  it('keeps a same-origin returnTo as an absolute URL', () => {
    expect(toSafeAppState(base, '/settings')).toEqual({
      returnTo: 'https://app.example.com/settings',
    })
  })

  it('drops an off-origin returnTo', () => {
    expect(toSafeAppState(base, 'https://evil.com')).toBeUndefined()
    expect(toSafeAppState(base, '//evil.com')).toBeUndefined()
  })

  it('resolves against the first entry of an allow-list', () => {
    expect(toSafeAppState([base, 'https://staging.example.com'], '/x')).toEqual({
      returnTo: 'https://app.example.com/x',
    })
  })
})
