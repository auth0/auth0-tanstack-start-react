import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getConfig,
  publicRequestOrigin,
  resolveAppBaseUrl,
  resolveRoutePaths,
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
    'AUTH0_TRUST_PROXY',
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

  it('defaults excludedClaims to the internal OIDC claims', () => {
    const cfg = getConfig(VALID)
    expect(cfg.excludedClaims).toEqual(['iss', 'aud', 'iat', 'exp', 'sid'])
  })

  it('honors an explicit excludedClaims override, including an empty array', () => {
    expect(getConfig({ ...VALID, excludedClaims: ['sub'] }).excludedClaims).toEqual([
      'sub',
    ])
    expect(getConfig({ ...VALID, excludedClaims: [] }).excludedClaims).toEqual([])
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

  it('accepts an array of secrets for rotation', () => {
    const cfg = getConfig({
      ...VALID,
      secret: ['x'.repeat(32), 'y'.repeat(40)],
    })
    expect(cfg.secret).toEqual(['x'.repeat(32), 'y'.repeat(40)])
  })

  it('rejects a secret array when any entry is too short', () => {
    expect(() =>
      getConfig({ ...VALID, secret: ['x'.repeat(32), 'too-short'] }),
    ).toThrow(/at least 32 bytes/)
  })

  it('treats an empty secret array as missing', () => {
    expect(() => getConfig({ ...VALID, secret: [] })).toThrow(
      /secret \(AUTH0_SECRET\)/,
    )
  })

  it('treats an empty appBaseUrl allow-list as missing, since it can never match', () => {
    expect(() => getConfig({ ...VALID, appBaseUrl: [] })).toThrow(
      /appBaseUrl \(APP_BASE_URL\)/,
    )
  })

  it('rejects an appBaseUrl that is not an absolute URL', () => {
    expect(() => getConfig({ ...VALID, appBaseUrl: 'app.example.com' })).toThrow(
      /is not an absolute URL/,
    )
  })

  it('rejects an appBaseUrl that does not use http or https', () => {
    expect(() =>
      getConfig({ ...VALID, appBaseUrl: 'ftp://app.example.com' }),
    ).toThrow(/must use http or https/)
  })

  it('validates every entry of an appBaseUrl allow-list, not just the first', () => {
    expect(() =>
      getConfig({
        ...VALID,
        appBaseUrl: ['https://app.example.com', 'not-a-url'],
      }),
    ).toThrow(/is not an absolute URL/)
  })

  it('leaves trustProxy off by default, so forwarded headers are never trusted silently', () => {
    expect(getConfig(VALID).trustProxy).toBe(false)
  })

  it('enables trustProxy from an explicit option', () => {
    expect(getConfig({ ...VALID, trustProxy: true }).trustProxy).toBe(true)
  })

  it('enables trustProxy from AUTH0_TRUST_PROXY', () => {
    process.env.AUTH0_TRUST_PROXY = 'true'
    expect(getConfig(VALID).trustProxy).toBe(true)
  })

  it('accepts the usual spellings of a boolean in AUTH0_TRUST_PROXY', () => {
    for (const value of ['true', '1', 'yes', 'on', 'TRUE', ' True ']) {
      process.env.AUTH0_TRUST_PROXY = value
      expect(getConfig(VALID).trustProxy).toBe(true)
    }
    for (const value of ['false', '0', 'no', 'off', 'FALSE']) {
      process.env.AUTH0_TRUST_PROXY = value
      expect(getConfig(VALID).trustProxy).toBe(false)
    }
  })

  it('throws on an AUTH0_TRUST_PROXY value it cannot read as a boolean', () => {
    // Silently reading an unknown value as "off" would leave a proxied app
    // broken with nothing to point at.
    process.env.AUTH0_TRUST_PROXY = 'maybe'
    expect(() => getConfig(VALID)).toThrow(/AUTH0_TRUST_PROXY must be one of/)
  })

  it('lets an explicit trustProxy option override AUTH0_TRUST_PROXY', () => {
    process.env.AUTH0_TRUST_PROXY = 'true'
    expect(getConfig({ ...VALID, trustProxy: false }).trustProxy).toBe(false)
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

describe('getConfig warning about untrusted forwarded headers', () => {
  // With a domain resolver there is no configured base URL to fall back on, so
  // every request URL is derived from the request itself. That is the one
  // configuration where leaving trustProxy off is likely to be a mistake.
  const MCD = {
    domain: () => 'brand-a.custom-domain.com',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    secret: 'x'.repeat(32),
  }
  let warnSpy: ReturnType<typeof vi.spyOn>
  let savedTrustProxy: string | undefined

  beforeEach(() => {
    savedTrustProxy = process.env.AUTH0_TRUST_PROXY
    delete process.env.AUTH0_TRUST_PROXY
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    if (savedTrustProxy === undefined) delete process.env.AUTH0_TRUST_PROXY
    else process.env.AUTH0_TRUST_PROXY = savedTrustProxy
  })

  it('warns when a domain resolver is used and trustProxy was never set', () => {
    getConfig(MCD)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('`trustProxy` is disabled'),
    )
  })

  it('stays quiet when trustProxy is enabled', () => {
    getConfig({ ...MCD, trustProxy: true })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('stays quiet when trustProxy is turned off deliberately', () => {
    getConfig({ ...MCD, trustProxy: false })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('stays quiet when AUTH0_TRUST_PROXY answers the question', () => {
    process.env.AUTH0_TRUST_PROXY = 'false'
    getConfig(MCD)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('stays quiet for a static appBaseUrl, which never needs the headers', () => {
    getConfig(VALID)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('publicRequestOrigin', () => {
  // A request as a TLS-terminating proxy would forward it: plain HTTP to an
  // internal hostname, with the browser-facing origin in the forwarded headers.
  const proxiedRequest = () =>
    new Request('http://10.0.0.7:3000/auth/callback?code=abc', {
      headers: {
        host: '10.0.0.7:3000',
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'https',
      },
    })

  it('ignores the forwarded headers by default, describing the request as received', () => {
    expect(publicRequestOrigin(proxiedRequest())).toBe('http://10.0.0.7:3000')
  })

  it('uses the forwarded headers once the proxy is trusted', () => {
    expect(publicRequestOrigin(proxiedRequest(), true)).toBe(
      'https://app.example.com',
    )
  })

  it('reads the Host header when there is no trusted forwarded host', () => {
    const req = new Request('http://internal/auth/login', {
      headers: { host: 'app.example.com' },
    })
    expect(publicRequestOrigin(req)).toBe('http://app.example.com')
  })

  it('falls back to the request URL when the request carries no Host header', () => {
    const req = new Request('https://app.example.com/auth/login')
    req.headers.delete('host')
    expect(publicRequestOrigin(req)).toBe('https://app.example.com')
  })

  it('takes the left-most entry when a proxy chain appends to the headers', () => {
    // Each hop appends, so the left-most value is the one the browser used.
    const req = new Request('http://internal/auth/login', {
      headers: {
        host: 'internal',
        'x-forwarded-host': 'app.example.com, internal.lb',
        'x-forwarded-proto': 'https, http',
      },
    })
    expect(publicRequestOrigin(req, true)).toBe('https://app.example.com')
  })

  it('keeps a non-default port from the forwarded host', () => {
    const req = new Request('http://internal/auth/login', {
      headers: { 'x-forwarded-host': 'app.example.com:8443', 'x-forwarded-proto': 'https' },
    })
    expect(publicRequestOrigin(req, true)).toBe('https://app.example.com:8443')
  })

  it('drops a path smuggled into the forwarded host, keeping only the origin', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        'x-forwarded-host': 'app.example.com/evil',
        'x-forwarded-proto': 'https',
      },
    })
    expect(publicRequestOrigin(req, true)).toBe('https://app.example.com')
  })

  it('drops credentials smuggled into the forwarded host', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        'x-forwarded-host': 'user:pass@app.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    expect(publicRequestOrigin(req, true)).toBe('https://app.example.com')
  })

  it('rejects a forwarded protocol that is not http or https', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'javascript',
      },
    })
    expect(() => publicRequestOrigin(req, true)).toThrow(
      /not http or https/,
    )
  })

  it('rejects a forwarded protocol that tries to smuggle a host of its own', () => {
    // "https://evil.com" would otherwise be read as the scheme "https" followed
    // by the host "evil.com", throwing away the forwarded host below it.
    const req = new Request('http://internal/auth/login', {
      headers: {
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'https://evil.com',
      },
    })
    expect(() => publicRequestOrigin(req, true)).toThrow(/not http or https/)
  })

  it('accepts a forwarded protocol in any letter case', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'HTTPS',
      },
    })
    expect(publicRequestOrigin(req, true)).toBe('https://app.example.com')
  })

  it('rejects a forwarded host that cannot form a URL at all', () => {
    const req = new Request('http://internal/auth/login', {
      headers: { 'x-forwarded-host': ' ][ ', 'x-forwarded-proto': 'https' },
    })
    expect(() => publicRequestOrigin(req, true)).toThrow(
      InvalidConfigurationError,
    )
  })
})

describe('resolveAppBaseUrl', () => {
  it('returns a single configured URL as-is, without looking at the request', () => {
    // This is why an app with a static appBaseUrl needs no trustProxy: the
    // configured value is already the public origin.
    const proxied = new Request('http://10.0.0.7:3000/auth/callback', {
      headers: { 'x-forwarded-host': 'evil.example.com' },
    })
    expect(
      resolveAppBaseUrl({ appBaseUrl: 'https://app.example.com' }, proxied),
    ).toBe('https://app.example.com')
  })

  it('matches the request origin against an allow-list', () => {
    const req = new Request('https://preview.example.com/page')
    expect(
      resolveAppBaseUrl(
        {
          appBaseUrl: ['https://app.example.com', 'https://preview.example.com'],
        },
        req,
      ),
    ).toBe('https://preview.example.com')
  })

  it('throws when the request origin is not in the allow-list', () => {
    const req = new Request('https://evil.example.com/page')
    expect(() =>
      resolveAppBaseUrl({ appBaseUrl: ['https://app.example.com'] }, req),
    ).toThrow(InvalidConfigurationError)
  })

  it('names the allowed origins and suggests trustProxy when nothing matches', () => {
    const req = new Request('http://10.0.0.7:3000/page')
    expect(() =>
      resolveAppBaseUrl({ appBaseUrl: ['https://app.example.com'] }, req),
    ).toThrow(/https:\/\/app\.example\.com.*trustProxy: true/s)
  })

  it('does not suggest trustProxy when it is already enabled', () => {
    const req = new Request('https://evil.example.com/page')
    let message = ''
    try {
      resolveAppBaseUrl(
        { appBaseUrl: ['https://app.example.com'], trustProxy: true },
        req,
      )
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('is not in the appBaseUrl allow-list')
    expect(message).not.toContain('trustProxy')
  })

  it('cannot match an allow-list behind a TLS-terminating proxy until trustProxy is on', () => {
    // The proxy forwards plain HTTP to an internal host, so the origin the app
    // sees is not the origin the browser used.
    const req = new Request('http://10.0.0.7:3000/auth/callback', {
      headers: {
        host: '10.0.0.7:3000',
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    expect(() =>
      resolveAppBaseUrl({ appBaseUrl: ['https://app.example.com'] }, req),
    ).toThrow(InvalidConfigurationError)
    expect(
      resolveAppBaseUrl(
        { appBaseUrl: ['https://app.example.com'], trustProxy: true },
        req,
      ),
    ).toBe('https://app.example.com')
  })

  it('throws for an allow-list when no request is given, rather than guessing an entry', () => {
    // Silently picking the first entry would produce a redirect_uri for the
    // wrong deployment, which fails at Auth0 with nothing to point at.
    expect(() =>
      resolveAppBaseUrl({
        appBaseUrl: ['https://a.example.com', 'https://b.example.com'],
      }),
    ).toThrow(/allow-list/)
  })

  it('throws for an empty allow-list, which can never match a request', () => {
    expect(() => resolveAppBaseUrl({ appBaseUrl: [] })).toThrow(
      /allow-list is empty/,
    )
  })

  it('infers the base URL from the request when appBaseUrl is undefined (MCD)', () => {
    const req = new Request('https://brand-a.example.com/auth/login', {
      headers: { host: 'brand-a.example.com' },
    })
    expect(resolveAppBaseUrl({ appBaseUrl: undefined }, req)).toBe(
      'https://brand-a.example.com',
    )
  })

  it('infers from the forwarded headers in MCD mode once the proxy is trusted', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        host: 'internal',
        'x-forwarded-host': 'brand-b.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    expect(
      resolveAppBaseUrl({ appBaseUrl: undefined, trustProxy: true }, req),
    ).toBe('https://brand-b.example.com')
  })

  it('throws when appBaseUrl is undefined and no request is available', () => {
    expect(() => resolveAppBaseUrl({ appBaseUrl: undefined })).toThrow(
      InvalidConfigurationError,
    )
  })

  it('explains the migration when called with the old appBaseUrl-first arguments', () => {
    // The signature changed so that trustProxy always travels with appBaseUrl.
    // Without this guard, an old call would silently infer the base URL from the
    // request instead of using the configured value.
    expect(() =>
      // @ts-expect-error deliberately calling the pre-1.0 signature
      resolveAppBaseUrl('https://app.example.com'),
    ).toThrow(/takes the resolved config object/)
    expect(() =>
      // @ts-expect-error deliberately calling the pre-1.0 signature
      resolveAppBaseUrl(['https://app.example.com']),
    ).toThrow(/takes the resolved config object/)
    // In Multiple Custom Domains mode the old first argument was `appBaseUrl`,
    // which is `undefined`. That must hit the same guard, not crash while
    // destructuring the config.
    expect(() =>
      // @ts-expect-error deliberately calling the pre-1.0 signature
      resolveAppBaseUrl(undefined, new Request('https://app.example.com')),
    ).toThrow(/takes the resolved config object/)
  })
})

describe('inferAppBaseUrlFromRequest', () => {
  it('builds the base URL from the Host header and the request protocol', () => {
    const req = new Request('https://internal/auth/login', {
      headers: { host: 'brand-a.example.com' },
    })
    expect(inferAppBaseUrlFromRequest(req)).toBe('https://brand-a.example.com')
  })

  it('ignores X-Forwarded-Proto until the proxy is trusted', () => {
    const req = new Request('http://internal/auth/login', {
      headers: { host: 'brand-a.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(inferAppBaseUrlFromRequest(req)).toBe('http://brand-a.example.com')
    expect(inferAppBaseUrlFromRequest(req, { trustProxy: true })).toBe(
      'https://brand-a.example.com',
    )
  })

  it('prefers X-Forwarded-Host over Host when the proxy is trusted', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        host: 'internal.local',
        'x-forwarded-host': 'public.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    expect(inferAppBaseUrlFromRequest(req, { trustProxy: true })).toBe(
      'https://public.example.com',
    )
  })

  it('takes the first value of a comma-separated X-Forwarded-Proto', () => {
    const req = new Request('http://internal/auth/login', {
      headers: {
        host: 'brand-a.example.com',
        'x-forwarded-proto': 'https, http',
      },
    })
    expect(inferAppBaseUrlFromRequest(req, { trustProxy: true })).toBe(
      'https://brand-a.example.com',
    )
  })

  it('falls back to the request URL protocol when no forwarded proto', () => {
    const req = new Request('https://brand-a.example.com/auth/login', {
      headers: { host: 'brand-a.example.com' },
    })
    expect(inferAppBaseUrlFromRequest(req, { trustProxy: true })).toBe(
      'https://brand-a.example.com',
    )
  })

  it('throws when there is no Host header', () => {
    // A Request with no host header at all: construct from a URL then strip it.
    // Nothing is configured to fall back on here, so guessing would produce a
    // redirect_uri that Auth0 rejects.
    const req = new Request('https://placeholder.example/auth/login')
    req.headers.delete('host')
    expect(() => inferAppBaseUrlFromRequest(req)).toThrow(InvalidConfigurationError)
  })

  it('accepts a trusted X-Forwarded-Host as the host when Host is absent', () => {
    const req = new Request('https://placeholder.example/auth/login', {
      headers: { 'x-forwarded-host': 'brand-a.example.com' },
    })
    req.headers.delete('host')
    expect(inferAppBaseUrlFromRequest(req, { trustProxy: true })).toBe(
      'https://brand-a.example.com',
    )
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
  const config = { appBaseUrl: base }

  it('returns undefined when returnTo is absent', () => {
    expect(toSafeAppState(config)).toBeUndefined()
    expect(toSafeAppState(config, '')).toBeUndefined()
  })

  it('keeps a same-origin returnTo as an absolute URL', () => {
    expect(toSafeAppState(config, '/settings')).toEqual({
      returnTo: 'https://app.example.com/settings',
    })
  })

  it('drops an off-origin returnTo', () => {
    expect(toSafeAppState(config, 'https://evil.com')).toBeUndefined()
    expect(toSafeAppState(config, '//evil.com')).toBeUndefined()
  })

  it('resolves against the allow-list entry the request came in on', () => {
    const req = new Request('https://staging.example.com/page')
    expect(
      toSafeAppState(
        { appBaseUrl: [base, 'https://staging.example.com'] },
        '/x',
        req,
      ),
    ).toEqual({ returnTo: 'https://staging.example.com/x' })
  })

  it('treats a returnTo for a different allowed origin as off-origin', () => {
    // Each deployment validates returnTo against its own origin, so a value
    // pointing at a sibling deployment is dropped rather than followed.
    const req = new Request('https://staging.example.com/page')
    expect(
      toSafeAppState(
        { appBaseUrl: [base, 'https://staging.example.com'] },
        'https://app.example.com/x',
        req,
      ),
    ).toBeUndefined()
  })

  it('resolves the allow-list entry from the forwarded headers when trusted', () => {
    const req = new Request('http://10.0.0.7:3000/page', {
      headers: {
        'x-forwarded-host': 'staging.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    expect(
      toSafeAppState(
        { appBaseUrl: [base, 'https://staging.example.com'], trustProxy: true },
        '/x',
        req,
      ),
    ).toEqual({ returnTo: 'https://staging.example.com/x' })
  })
})

describe('resolveRoutePaths', () => {
  it('defaults every endpoint to a segment under /auth', () => {
    expect(resolveRoutePaths({})).toEqual({
      base: '/auth',
      login: '/auth/login',
      callback: '/auth/callback',
      logout: '/auth/logout',
      profile: '/auth/profile',
      backchannelLogout: '/auth/backchannel-logout',
    })
  })

  it('moves every endpoint when only the base is changed', () => {
    // The callback path in particular is used to build the redirect_uri sent to
    // Auth0, so a custom base has to reach it or the login cannot complete.
    expect(resolveRoutePaths({ routes: { base: '/authentication' } })).toEqual({
      base: '/authentication',
      login: '/authentication/login',
      callback: '/authentication/callback',
      logout: '/authentication/logout',
      profile: '/authentication/profile',
      backchannelLogout: '/authentication/backchannel-logout',
    })
  })

  it('lets an individual path override the base-derived default', () => {
    const paths = resolveRoutePaths({
      routes: { base: '/authentication', callback: '/authentication/oidc-callback' },
    })
    expect(paths.callback).toBe('/authentication/oidc-callback')
    expect(paths.login).toBe('/authentication/login')
  })
})
