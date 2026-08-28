import { describe, expect, it, vi, beforeEach } from 'vitest'

let currentRequest: Request
let ambientResponseHeaders: Headers

vi.mock('@tanstack/start-server-core', () => ({
  getRequest: () => currentRequest,
  getResponseHeaders: () => ambientResponseHeaders,
}))

import { auth0Handlers } from './handlers.js'
import type { Auth0Instance } from './auth0-server.js'

function mockAuth0(
  over: Partial<Record<string, unknown>> = {},
  config: Partial<Record<string, unknown>> = {},
): Auth0Instance {
  return {
    client: {
      startInteractiveLogin: vi
        .fn()
        .mockResolvedValue(new URL('https://t.auth0.com/authorize?x=1')),
      completeInteractiveLogin: vi.fn().mockResolvedValue({ appState: {} }),
      logout: vi.fn().mockResolvedValue(new URL('https://t.auth0.com/v2/logout')),
      getUser: vi.fn().mockResolvedValue({ sub: 'auth0|1' }),
      handleBackchannelLogout: vi.fn().mockResolvedValue(undefined),
      ...over,
    },
    config: {
      appBaseUrl: 'http://localhost:3000',
      routes: undefined,
      trustProxy: false,
      ...config,
    },
  } as unknown as Auth0Instance
}

function setRequest(path: string, method = 'GET', form?: Record<string, string>) {
  const init: RequestInit = { method }
  if (form) {
    init.body = new URLSearchParams(form).toString()
    init.headers = { 'content-type': 'application/x-www-form-urlencoded' }
  }
  currentRequest = new Request(`http://localhost:3000${path}`, init)
}

/** The URL the handler handed to the token exchange. */
function exchangedUrl(auth0: Auth0Instance): string {
  const complete = auth0.client.completeInteractiveLogin as ReturnType<
    typeof vi.fn
  >
  return (complete.mock.calls[0]![0] as URL).toString()
}

beforeEach(() => {
  vi.clearAllMocks()
  ambientResponseHeaders = new Headers()
})

describe('auth0Handlers GET dispatch', () => {
  it('login → 302 to Auth0 authorize', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/login')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('t.auth0.com/authorize')
    expect(auth0.client.startInteractiveLogin).toHaveBeenCalled()
  })

  it('login → forwards safe authorization params from the query', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/login?returnTo=/x&screen_hint=signup&connection=google-oauth2&prompt=login')
    await auth0Handlers(auth0).GET()
    const arg = (auth0.client.startInteractiveLogin as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(arg.authorizationParams).toEqual({
      screen_hint: 'signup',
      connection: 'google-oauth2',
      prompt: 'login',
    })
    // returnTo is handled via appState, not passed through as an auth param.
    expect(arg.authorizationParams).not.toHaveProperty('returnTo')
    expect(arg.appState.returnTo).toBe('http://localhost:3000/x')
  })

  it('login → drops reserved OAuth params that the SDK controls', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/login?client_id=evil&redirect_uri=https://evil.test&scope=admin&screen_hint=signup')
    await auth0Handlers(auth0).GET()
    const arg = (auth0.client.startInteractiveLogin as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(arg.authorizationParams).toEqual({ screen_hint: 'signup' })
  })

  it('login → drops OIDC Request-Object params so they cannot be smuggled to /authorize', async () => {
    const auth0 = mockAuth0()
    setRequest(
      '/auth/login?request=jwt&request_uri=https://attacker.test/obj&claims=x&id_token_hint=y&response_mode=fragment&screen_hint=signup',
    )
    await auth0Handlers(auth0).GET()
    const arg = (auth0.client.startInteractiveLogin as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    // Only the benign param survives; every Request-Object param is stripped.
    expect(arg.authorizationParams).toEqual({ screen_hint: 'signup' })
  })

  it('login → drops reserved params even when their case is mixed', async () => {
    const auth0 = mockAuth0()
    // A crafted link may vary the case to dodge a case-sensitive filter.
    setRequest('/auth/login?SCOPE=admin&Request_Uri=https://attacker.test/obj&screen_hint=signup')
    await auth0Handlers(auth0).GET()
    const arg = (auth0.client.startInteractiveLogin as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(arg.authorizationParams).toEqual({ screen_hint: 'signup' })
  })

  it('login → still forwards prompt and login_hint (intentionally not reserved)', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/login?prompt=login&login_hint=jane@example.com')
    await auth0Handlers(auth0).GET()
    const arg = (auth0.client.startInteractiveLogin as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(arg.authorizationParams).toEqual({
      prompt: 'login',
      login_hint: 'jane@example.com',
    })
  })

  it('login → no authorizationParams when only returnTo is present', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/login?returnTo=/x')
    await auth0Handlers(auth0).GET()
    const arg = (auth0.client.startInteractiveLogin as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    expect(arg.authorizationParams).toBeUndefined()
  })

  it('callback → 302 to returnTo', async () => {
    const auth0 = mockAuth0({
      completeInteractiveLogin: vi
        .fn()
        .mockResolvedValue({ appState: { returnTo: '/dashboard' } }),
    })
    setRequest('/auth/callback?code=abc&state=xyz')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('http://localhost:3000/dashboard')
  })

  it('callback → throws CallbackError with error_description when Auth0 returns ?error=', async () => {
    const auth0 = mockAuth0()
    setRequest(
      '/auth/callback?error=invalid_request&error_description=Organization%20not%20found',
    )
    await expect(auth0Handlers(auth0).GET()).rejects.toMatchObject({
      name: 'CallbackError',
      message: 'Organization not found',
    })
    // The failed authorization must not be handed to the foundation, which would
    // throw a bare HTTPError surfaced as a 500.
    expect(auth0.client.completeInteractiveLogin).not.toHaveBeenCalled()
  })

  it('callback → falls back to the error code when no error_description is present', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/callback?error=access_denied')
    await expect(auth0Handlers(auth0).GET()).rejects.toMatchObject({
      name: 'CallbackError',
      message: 'access_denied',
    })
  })

  it('callback → wraps an Error from the exchange, keeping its message', async () => {
    const auth0 = mockAuth0({
      completeInteractiveLogin: vi
        .fn()
        .mockRejectedValue(new Error('state mismatch')),
    })
    setRequest('/auth/callback?code=abc&state=xyz')
    await expect(auth0Handlers(auth0).GET()).rejects.toMatchObject({
      name: 'CallbackError',
      message: 'state mismatch',
    })
  })

  it('callback → wraps a non-Error from the exchange with a default message', async () => {
    // The foundation should reject with an Error, but guard the odd case where it
    // throws something else so the callback still surfaces a CallbackError rather
    // than leaking the raw value.
    const auth0 = mockAuth0({
      completeInteractiveLogin: vi.fn().mockRejectedValue('kaboom'),
    })
    setRequest('/auth/callback?code=abc&state=xyz')
    await expect(auth0Handlers(auth0).GET()).rejects.toMatchObject({
      name: 'CallbackError',
      message: 'Login callback failed.',
    })
  })

  it('logout → 302 to Auth0 logout', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/logout')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('t.auth0.com/v2/logout')
  })

  it('logout → returnTo defaults to appBaseUrl when not provided', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/logout')
    await auth0Handlers(auth0).GET()
    expect(auth0.client.logout).toHaveBeenCalledWith({
      returnTo: 'http://localhost:3000',
    })
  })

  it('logout → honors a same-origin returnTo query param', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/logout?returnTo=/goodbye')
    await auth0Handlers(auth0).GET()
    expect(auth0.client.logout).toHaveBeenCalledWith({
      returnTo: 'http://localhost:3000/goodbye',
    })
  })

  it('logout → drops an off-origin returnTo and falls back to appBaseUrl', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/logout?returnTo=https://evil.example.com/phish')
    await auth0Handlers(auth0).GET()
    expect(auth0.client.logout).toHaveBeenCalledWith({
      returnTo: 'http://localhost:3000',
    })
  })

  it('profile → user JSON, marked no-store so the PII is never cached', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/profile')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sub: 'auth0|1' })
    expect(res.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0',
    )
  })

  it('profile → 204 when no session, still marked no-store', async () => {
    const auth0 = mockAuth0({ getUser: vi.fn().mockResolvedValue(undefined) })
    setRequest('/auth/profile')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(204)
    expect(res.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0',
    )
  })

  it('unknown path → 404', async () => {
    setRequest('/auth/unknown')
    const res = await auth0Handlers(mockAuth0()).GET()
    expect(res.status).toBe(404)
  })
})

describe('Multiple Custom Domains (resolver mode)', () => {
  function mockAuth0Mcd(
    startInteractiveLogin: ReturnType<typeof vi.fn>,
    config: Partial<Record<string, unknown>> = {},
  ): Auth0Instance {
    return {
      client: { startInteractiveLogin },
      // Resolver domain + no appBaseUrl => per-request redirect_uri mode.
      config: {
        domain: () => 'brand-a.auth0.com',
        appBaseUrl: undefined,
        routes: undefined,
        trustProxy: false,
        ...config,
      },
    } as unknown as Auth0Instance
  }

  it('login → derives redirect_uri from the request host', async () => {
    const start = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-a.auth0.com/authorize'))
    const auth0 = mockAuth0Mcd(start)
    currentRequest = new Request('https://brand-a.example.com/auth/login', {
      headers: { host: 'brand-a.example.com' },
    })
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    const arg = start.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://brand-a.example.com/auth/callback',
    )
  })

  it('login → ignores X-Forwarded-Host until trustProxy is enabled', async () => {
    const start = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-b.auth0.com/authorize'))
    const auth0 = mockAuth0Mcd(start)
    currentRequest = new Request('https://internal.local/auth/login', {
      headers: {
        host: 'internal.local',
        'x-forwarded-host': 'brand-b.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    await auth0Handlers(auth0).GET()
    const arg = start.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://internal.local/auth/callback',
    )
  })

  it('login → uses X-Forwarded-Host to build redirect_uri when trustProxy is enabled', async () => {
    const start = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-b.auth0.com/authorize'))
    const auth0 = mockAuth0Mcd(start, { trustProxy: true })
    currentRequest = new Request('http://internal.local/auth/login', {
      headers: {
        host: 'internal.local',
        'x-forwarded-host': 'brand-b.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    await auth0Handlers(auth0).GET()
    const arg = start.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://brand-b.example.com/auth/callback',
    )
  })

  it('static mode → does not add a per-request redirect_uri', async () => {
    // The default mockAuth0 uses a static string appBaseUrl.
    const auth0 = mockAuth0()
    setRequest('/auth/login')
    await auth0Handlers(auth0).GET()
    const arg = (auth0.client.startInteractiveLogin as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]
    // No authorizationParams at all when only the default login is requested.
    expect(arg.authorizationParams).toBeUndefined()
  })
})

describe('callback behind a proxy that terminates TLS', () => {
  // What a reverse proxy or load balancer forwards to the app: plain HTTP to an
  // internal address, with the browser-facing origin only in the headers. The
  // token exchange re-sends redirect_uri, and Auth0 rejects the login unless it
  // matches the value that started it, so the handler must rebuild the callback
  // URL from appBaseUrl rather than from the request it received.
  function setProxiedRequest(
    path: string,
    forwarded: Record<string, string> = {
      'x-forwarded-host': 'app.example.com',
      'x-forwarded-proto': 'https',
    },
  ) {
    currentRequest = new Request(`http://10.0.0.7:3000${path}`, {
      headers: { host: '10.0.0.7:3000', ...forwarded },
    })
  }

  it('exchanges the code against appBaseUrl, not the internal address the app saw', async () => {
    const auth0 = mockAuth0({}, { appBaseUrl: 'https://app.example.com' })
    setProxiedRequest('/auth/callback?code=abc&state=xyz')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    expect(exchangedUrl(auth0)).toBe(
      'https://app.example.com/auth/callback?code=abc&state=xyz',
    )
  })

  it('needs no trustProxy for a single configured appBaseUrl', async () => {
    // The configured value is already the public origin, so no forwarded header
    // is read and nothing has to be opted into.
    const auth0 = mockAuth0(
      {},
      { appBaseUrl: 'https://app.example.com', trustProxy: false },
    )
    setProxiedRequest('/auth/callback?code=abc&state=xyz', {})
    await auth0Handlers(auth0).GET()
    expect(exchangedUrl(auth0)).toBe(
      'https://app.example.com/auth/callback?code=abc&state=xyz',
    )
  })

  it('keeps the whole query string, including params Auth0 adds', async () => {
    const auth0 = mockAuth0({}, { appBaseUrl: 'https://app.example.com' })
    setProxiedRequest('/auth/callback?code=abc&state=xyz&iss=https%3A%2F%2Ft.auth0.com')
    await auth0Handlers(auth0).GET()
    expect(exchangedUrl(auth0)).toBe(
      'https://app.example.com/auth/callback?code=abc&state=xyz&iss=https%3A%2F%2Ft.auth0.com',
    )
  })

  it('uses the configured callback path when routes.base is customised', async () => {
    // The same path has to reach the redirect_uri sent to /authorize and the one
    // re-sent during the exchange.
    const auth0 = mockAuth0(
      {},
      {
        appBaseUrl: 'https://app.example.com',
        routes: { base: '/authentication' },
      },
    )
    currentRequest = new Request(
      'http://10.0.0.7:3000/authentication/callback?code=abc&state=xyz',
      { headers: { host: '10.0.0.7:3000' } },
    )
    await auth0Handlers(auth0).GET()
    expect(exchangedUrl(auth0)).toBe(
      'https://app.example.com/authentication/callback?code=abc&state=xyz',
    )
  })

  it('uses an individually overridden callback path', async () => {
    const auth0 = mockAuth0(
      {},
      {
        appBaseUrl: 'https://app.example.com',
        routes: { callback: '/auth/oidc-callback' },
      },
    )
    currentRequest = new Request(
      'http://10.0.0.7:3000/auth/oidc-callback?code=abc&state=xyz',
      { headers: { host: '10.0.0.7:3000' } },
    )
    await auth0Handlers(auth0).GET()
    expect(exchangedUrl(auth0)).toBe(
      'https://app.example.com/auth/oidc-callback?code=abc&state=xyz',
    )
  })

  it('redirects to returnTo on the public origin, not the internal one', async () => {
    const auth0 = mockAuth0(
      {
        completeInteractiveLogin: vi
          .fn()
          .mockResolvedValue({ appState: { returnTo: '/dashboard' } }),
      },
      { appBaseUrl: 'https://app.example.com' },
    )
    setProxiedRequest('/auth/callback?code=abc&state=xyz')
    const res = await auth0Handlers(auth0).GET()
    expect(res.headers.get('Location')).toBe('https://app.example.com/dashboard')
  })

  it('picks the matching allow-list entry once the proxy is trusted', async () => {
    const auth0 = mockAuth0(
      {},
      {
        appBaseUrl: ['https://app.example.com', 'https://preview.example.com'],
        trustProxy: true,
      },
    )
    setProxiedRequest('/auth/callback?code=abc&state=xyz', {
      'x-forwarded-host': 'preview.example.com',
      'x-forwarded-proto': 'https',
    })
    await auth0Handlers(auth0).GET()
    expect(exchangedUrl(auth0)).toBe(
      'https://preview.example.com/auth/callback?code=abc&state=xyz',
    )
  })

  it('fails with an actionable error when an allow-list is used without trustProxy', async () => {
    const auth0 = mockAuth0({}, { appBaseUrl: ['https://app.example.com'] })
    setProxiedRequest('/auth/callback?code=abc&state=xyz')
    await expect(auth0Handlers(auth0).GET()).rejects.toThrow(/trustProxy/)
  })

  it('builds the callback URL from the forwarded host in resolver mode', async () => {
    const auth0 = mockAuth0(
      {},
      {
        domain: () => 'brand-a.auth0.com',
        appBaseUrl: undefined,
        trustProxy: true,
      },
    )
    setProxiedRequest('/auth/callback?code=abc&state=xyz', {
      'x-forwarded-host': 'brand-a.example.com',
      'x-forwarded-proto': 'https',
    })
    await auth0Handlers(auth0).GET()
    expect(exchangedUrl(auth0)).toBe(
      'https://brand-a.example.com/auth/callback?code=abc&state=xyz',
    )
  })

  it('leaves a direct request unchanged, so local development is unaffected', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/callback?code=abc&state=xyz')
    await auth0Handlers(auth0).GET()
    expect(exchangedUrl(auth0)).toBe(
      'http://localhost:3000/auth/callback?code=abc&state=xyz',
    )
  })

  it('reports an Auth0 error before rebuilding anything', async () => {
    const auth0 = mockAuth0({}, { appBaseUrl: ['https://app.example.com'] })
    setProxiedRequest('/auth/callback?error=access_denied')
    await expect(auth0Handlers(auth0).GET()).rejects.toMatchObject({
      name: 'CallbackError',
      message: 'access_denied',
    })
  })

  it('sends logout back to the public origin, which Auth0 has to have on file', async () => {
    // The post-logout returnTo has to be a registered Allowed Logout URL, so the
    // internal address the app saw would be rejected.
    const auth0 = mockAuth0(
      {},
      { appBaseUrl: ['https://app.example.com'], trustProxy: true },
    )
    setProxiedRequest('/auth/logout')
    await auth0Handlers(auth0).GET()
    expect(auth0.client.logout).toHaveBeenCalledWith({
      returnTo: 'https://app.example.com',
    })
  })

  it('keeps a same-origin logout returnTo relative to the public origin', async () => {
    const auth0 = mockAuth0(
      {},
      { appBaseUrl: ['https://app.example.com'], trustProxy: true },
    )
    setProxiedRequest('/auth/logout?returnTo=/goodbye')
    await auth0Handlers(auth0).GET()
    expect(auth0.client.logout).toHaveBeenCalledWith({
      returnTo: 'https://app.example.com/goodbye',
    })
  })

  it('logout in per-request mode without trustProxy uses the origin the app received', async () => {
    // A domain resolver with no configured appBaseUrl puts logout on the same
    // per-request path as the callback. With trustProxy off the SDK trusts what
    // it received, so returnTo is the internal origin, not the forwarded one.
    // This documents the untrusted behaviour that the callback path already has.
    const auth0 = mockAuth0(
      {},
      { domain: () => 'brand-a.auth0.com', appBaseUrl: undefined },
    )
    setProxiedRequest('/auth/logout')
    await auth0Handlers(auth0).GET()
    expect(auth0.client.logout).toHaveBeenCalledWith({
      returnTo: 'http://10.0.0.7:3000',
    })
  })

  it('logout in per-request mode sends returnTo to the forwarded origin once trustProxy is on', async () => {
    const auth0 = mockAuth0(
      {},
      {
        domain: () => 'brand-a.auth0.com',
        appBaseUrl: undefined,
        trustProxy: true,
      },
    )
    setProxiedRequest('/auth/logout')
    await auth0Handlers(auth0).GET()
    expect(auth0.client.logout).toHaveBeenCalledWith({
      returnTo: 'https://app.example.com',
    })
  })
})

describe('redirect carries staged Set-Cookie headers (M6)', () => {
  // The underlying client stages the login/session cookies on the ambient
  // response headers. Our handlers build a brand-new redirect Response, so it
  // must copy those Set-Cookie entries across or the session cookie is lost.
  it('carries the transaction cookie staged during login', async () => {
    ambientResponseHeaders.append('Set-Cookie', '__a0_tx=abc; Path=/; HttpOnly')
    const auth0 = mockAuth0()
    setRequest('/auth/login')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    expect(res.headers.getSetCookie()).toContain('__a0_tx=abc; Path=/; HttpOnly')
  })

  it('carries the session cookie staged during callback', async () => {
    ambientResponseHeaders.append(
      'Set-Cookie',
      '__a0_session=xyz; Path=/; HttpOnly; Secure',
    )
    const auth0 = mockAuth0({
      completeInteractiveLogin: vi
        .fn()
        .mockResolvedValue({ appState: { returnTo: '/dashboard' } }),
    })
    setRequest('/auth/callback?code=abc&state=xyz')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    expect(res.headers.getSetCookie()).toContain(
      '__a0_session=xyz; Path=/; HttpOnly; Secure',
    )
  })

  it('carries multiple staged cookies (e.g. session + cleared transaction)', async () => {
    ambientResponseHeaders.append('Set-Cookie', '__a0_session=xyz; Path=/')
    ambientResponseHeaders.append('Set-Cookie', '__a0_tx=; Path=/; Max-Age=0')
    const auth0 = mockAuth0()
    setRequest('/auth/callback?code=abc&state=xyz')
    const res = await auth0Handlers(auth0).GET()
    expect(res.headers.getSetCookie()).toHaveLength(2)
  })
})

describe('auth0Handlers POST dispatch', () => {
  it('backchannel-logout with token → 204', async () => {
    const auth0 = mockAuth0()
        setRequest('/auth/backchannel-logout', 'POST', { logout_token: 'jwt' })
    const res = await auth0Handlers(auth0).POST()
    expect(res.status).toBe(204)
    expect(auth0.client.handleBackchannelLogout).toHaveBeenCalledWith('jwt')
  })

  it('backchannel-logout without token → 400', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/backchannel-logout', 'POST', {})
    const res = await auth0Handlers(auth0).POST()
    expect(res.status).toBe(400)
  })

  it('backchannel-logout on a stateless store → 501 with a config message', async () => {
    const auth0 = mockAuth0({
      handleBackchannelLogout: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Backchannel logout is not available when using Stateless Storage. Use Stateful Storage by providing a `sessionStore`',
          ),
        ),
    })
    setRequest('/auth/backchannel-logout', 'POST', { logout_token: 'jwt' })
    const res = await auth0Handlers(auth0).POST()
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.error).toBe('backchannel_logout_unsupported')
    expect(body.message).toMatch(/sessionStore/)
  })

  it('backchannel-logout with a genuinely bad token → 400', async () => {
    const auth0 = mockAuth0({
      handleBackchannelLogout: vi.fn().mockRejectedValue(new Error('bad jwt')),
    })
    setRequest('/auth/backchannel-logout', 'POST', { logout_token: 'jwt' })
    const res = await auth0Handlers(auth0).POST()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid logout_token')
  })

  it('unknown POST path → 404', async () => {
    setRequest('/auth/nope', 'POST', {})
    const res = await auth0Handlers(mockAuth0()).POST()
    expect(res.status).toBe(404)
  })
})
