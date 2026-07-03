import { describe, expect, it, vi, beforeEach } from 'vitest'

let currentRequest: Request
let ambientResponseHeaders: Headers

vi.mock('@tanstack/start-server-core', () => ({
  getRequest: () => currentRequest,
  getResponseHeaders: () => ambientResponseHeaders,
}))

import { auth0Handlers } from './handlers.js'
import type { Auth0Instance } from './auth0-server.js'

function mockAuth0(over: Partial<Record<string, unknown>> = {}): Auth0Instance {
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
    config: { appBaseUrl: 'http://localhost:3000', routes: undefined },
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

  it('logout → 302 to Auth0 logout', async () => {
    const auth0 = mockAuth0()
    setRequest('/auth/logout')
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('t.auth0.com/v2/logout')
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
  function mockAuth0Mcd(startInteractiveLogin: ReturnType<typeof vi.fn>): Auth0Instance {
    return {
      client: { startInteractiveLogin },
      // Resolver domain + no appBaseUrl => per-request redirect_uri mode.
      config: { domain: () => 'brand-a.auth0.com', appBaseUrl: undefined, routes: undefined },
    } as unknown as Auth0Instance
  }

  it('login → derives redirect_uri from the request host', async () => {
    const start = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-a.auth0.com/authorize'))
    const auth0 = mockAuth0Mcd(start)
    currentRequest = new Request('https://brand-a.example.com/auth/login', {
      headers: { host: 'brand-a.example.com', 'x-forwarded-proto': 'https' },
    })
    const res = await auth0Handlers(auth0).GET()
    expect(res.status).toBe(302)
    const arg = start.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://brand-a.example.com/auth/callback',
    )
  })

  it('login → uses X-Forwarded-Host to build redirect_uri', async () => {
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
