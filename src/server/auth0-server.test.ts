import { describe, expect, it, vi, beforeEach } from 'vitest'

// Capture the options passed to the foundation's store + client so we can assert
// that our sessionConfiguration is forwarded (H3: it used to be silently dropped).
const statelessArgs: unknown[] = []
const statefulArgs: unknown[] = []
const serverClientArgs: unknown[] = []

// The domain-resolver wrapper reads the ambient request via `getRequest()`. Mock
// it so a test can drive what the wrapper sees on each call.
let currentRequest: Request
vi.mock('@tanstack/start-server-core', () => ({
  getRequest: () => currentRequest,
}))

// These classes are instantiated with `new` in auth0-server.ts, so the mocks
// use `function` (not arrow) implementations. vitest 4 rejects arrow-function
// mocks used as constructors.
vi.mock('@auth0/auth0-server-js', () => ({
  ServerClient: vi.fn(function (opts: unknown) {
    serverClientArgs.push(opts)
    return { __client: true }
  }),
  CookieTransactionStore: vi.fn(function () {
    return { __txn: true }
  }),
  StatelessStateStore: vi.fn(function (opts: unknown) {
    statelessArgs.push(opts)
    return { __stateless: true }
  }),
  StatefulStateStore: vi.fn(function (opts: unknown) {
    statefulArgs.push(opts)
    return { __stateful: true }
  }),
}))

vi.mock('./cookie-handler.js', () => ({
  TanStackStartCookieHandler: vi.fn(function () {
    return { __cookie: true }
  }),
}))

import { auth0Server } from './auth0-server.js'

const BASE = {
  domain: 'tenant.auth0.com',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  secret: 'x'.repeat(32),
  appBaseUrl: 'https://app.example.com',
}

beforeEach(() => {
  statelessArgs.length = 0
  statefulArgs.length = 0
  serverClientArgs.length = 0
  vi.clearAllMocks()
})

describe('auth0Server sessionConfiguration', () => {
  it('forwards sessionConfiguration fields to the stateless store', () => {
    auth0Server({
      ...BASE,
      sessionConfiguration: {
        rolling: false,
        absoluteDuration: 111,
        inactivityDuration: 222,
        cookie: { name: 'my_session', sameSite: 'strict' },
      },
    })

    const storeOpts = statelessArgs[0] as Record<string, unknown>
    expect(storeOpts.rolling).toBe(false)
    expect(storeOpts.absoluteDuration).toBe(111)
    expect(storeOpts.inactivityDuration).toBe(222)
    expect(storeOpts.cookie).toEqual({ name: 'my_session', sameSite: 'strict' })
    // secret is still merged in
    expect(storeOpts.secret).toBe('x'.repeat(32))
  })

  it('uses cookie.name as the state identifier', () => {
    auth0Server({
      ...BASE,
      sessionConfiguration: { cookie: { name: 'my_session' } },
    })
    const clientOpts = serverClientArgs[0] as Record<string, unknown>
    expect(clientOpts.stateIdentifier).toBe('my_session')
  })

  it('works with no sessionConfiguration (defaults left to the foundation)', () => {
    auth0Server(BASE)
    const clientOpts = serverClientArgs[0] as Record<string, unknown>
    expect(clientOpts.stateIdentifier).toBeUndefined()
    expect(statelessArgs[0]).toMatchObject({ secret: 'x'.repeat(32) })
  })
})

describe('auth0Server domain resolver (Multiple Custom Domains)', () => {
  it('bakes a redirect_uri into the client with a static string appBaseUrl', () => {
    auth0Server(BASE)
    const clientOpts = serverClientArgs[0] as {
      domain: unknown
      authorizationParams: { redirect_uri?: string }
    }
    expect(typeof clientOpts.domain).toBe('string')
    expect(clientOpts.authorizationParams.redirect_uri).toBe(
      'https://app.example.com/auth/callback',
    )
  })

  it('passes a function domain and omits a baked redirect_uri in resolver mode', () => {
    auth0Server({
      domain: () => 'brand-a.auth0.com',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      secret: 'x'.repeat(32),
      // no appBaseUrl
    })
    const clientOpts = serverClientArgs[0] as {
      domain: unknown
      authorizationParams: { redirect_uri?: string }
    }
    expect(typeof clientOpts.domain).toBe('function')
    expect(clientOpts.authorizationParams.redirect_uri).toBeUndefined()
  })

  it('invokes the resolver with the ambient request, resolving per call', async () => {
    // The wrapper baked into the client has to read `getRequest()` at request
    // time and hand it to the developer's resolver, so different hosts resolve to
    // different tenants. This exercises the wrapper itself, not just that a
    // function was forwarded.
    const resolver = vi.fn(
      (request: Request) =>
        `${new URL(request.url).hostname.split('.')[0]}.auth0.com`,
    )
    auth0Server({
      domain: resolver,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      secret: 'x'.repeat(32),
    })
    const clientOpts = serverClientArgs[0] as {
      domain: () => string | Promise<string>
    }

    currentRequest = new Request('https://brand-a.example.com/auth/login')
    expect(await clientOpts.domain()).toBe('brand-a.auth0.com')
    expect(resolver).toHaveBeenCalledWith(currentRequest)

    currentRequest = new Request('https://brand-b.example.com/auth/login')
    expect(await clientOpts.domain()).toBe('brand-b.auth0.com')
  })

  it('moves the baked redirect_uri when routes.base is customised', () => {
    // The handler serving the callback derives its path from routes.base, so the
    // baked redirect_uri has to follow it. When the two disagreed, Auth0 sent the
    // browser to a path the SDK does not serve and login could never complete.
    auth0Server({ ...BASE, routes: { base: '/authentication' } })
    const clientOpts = serverClientArgs[0] as {
      authorizationParams: { redirect_uri?: string }
    }
    expect(clientOpts.authorizationParams.redirect_uri).toBe(
      'https://app.example.com/authentication/callback',
    )
  })

  it('honours an individually overridden callback path', () => {
    auth0Server({ ...BASE, routes: { callback: '/auth/oidc-callback' } })
    const clientOpts = serverClientArgs[0] as {
      authorizationParams: { redirect_uri?: string }
    }
    expect(clientOpts.authorizationParams.redirect_uri).toBe(
      'https://app.example.com/auth/oidc-callback',
    )
  })

  it('omits a baked redirect_uri when appBaseUrl is an allow-list', () => {
    auth0Server({
      ...BASE,
      appBaseUrl: ['https://a.example.com', 'https://b.example.com'],
    })
    const clientOpts = serverClientArgs[0] as {
      authorizationParams: { redirect_uri?: string }
    }
    expect(clientOpts.authorizationParams.redirect_uri).toBeUndefined()
  })
})

describe('auth0Server session store selection', () => {
  it('uses the stateless store by default (no sessionStore)', () => {
    auth0Server(BASE)
    expect(statelessArgs).toHaveLength(1)
    expect(statefulArgs).toHaveLength(0)
  })

  it('uses the stateful store and forwards the store + secret when sessionStore is provided', () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      deleteByLogoutToken: vi.fn(),
    }
    auth0Server({ ...BASE, sessionStore: store })

    expect(statelessArgs).toHaveLength(0)
    expect(statefulArgs).toHaveLength(1)
    const opts = statefulArgs[0] as Record<string, unknown>
    expect(opts.store).toBe(store)
    expect(opts.secret).toBe('x'.repeat(32))
  })

  it('forwards sessionConfiguration to the stateful store', () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      deleteByLogoutToken: vi.fn(),
    }
    auth0Server({
      ...BASE,
      sessionStore: store,
      sessionConfiguration: { absoluteDuration: 999 },
    })
    const opts = statefulArgs[0] as Record<string, unknown>
    expect(opts.absoluteDuration).toBe(999)
  })
})
