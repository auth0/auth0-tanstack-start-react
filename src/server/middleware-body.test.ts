import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the server graph so we can assert routing purely by pathname, without
// constructing a real Auth0 instance or reading env config.
vi.mock('./auth0-server.js', () => ({
  auth0Server: vi.fn(() => ({
    client: { getSession: vi.fn(async () => null) },
    config: { routes: undefined },
  })),
}))

vi.mock('./handlers.js', () => ({
  auth0Handlers: vi.fn(() => ({
    GET: vi.fn(async () => new Response('auth-get')),
    POST: vi.fn(async () => new Response('auth-post')),
  })),
}))

vi.mock('./session-mapper.js', () => ({
  toAuth0RouterContext: vi.fn(() => ({
    user: undefined,
    isAuthenticated: false,
    status: 'resolved',
    isLoading: false,
  })),
}))

import { middlewareBody } from './middleware-body.js'
import { auth0Handlers } from './handlers.js'
import { auth0Server } from './auth0-server.js'

const getHandlers = auth0Handlers as unknown as ReturnType<typeof vi.fn>
const serverFactory = auth0Server as unknown as ReturnType<typeof vi.fn>

function run(pathname: string, method = 'GET') {
  const next = vi.fn((arg: unknown) => ({ __next: true, arg }))
  return middlewareBody(
    { request: new Request(`http://localhost${pathname}`, { method }), pathname, next },
    {},
  ).then((result) => ({ result, next }))
}

beforeEach(() => vi.clearAllMocks())

describe('middlewareBody auth base matching', () => {
  it('handles the exact base path', async () => {
    const { next } = await run('/auth')
    expect(getHandlers).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('handles a path under the base', async () => {
    const { next } = await run('/auth/login')
    expect(getHandlers).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('does NOT swallow sibling routes that merely start with the base string', async () => {
    for (const p of ['/authors', '/authentication', '/auth-help']) {
      vi.clearAllMocks()
      const { next } = await run(p)
      expect(getHandlers, `${p} should route normally`).not.toHaveBeenCalled()
      expect(next, `${p} should call next()`).toHaveBeenCalled()
    }
  })

  it('passes unrelated routes through to next()', async () => {
    const { next } = await run('/dashboard')
    expect(getHandlers).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})

describe('instance caching by options identity (SDK-10662)', () => {
  function call(options: Record<string, unknown>) {
    const next = vi.fn((arg: unknown) => arg)
    return middlewareBody(
      { request: new Request('http://localhost/dashboard'), pathname: '/dashboard', next },
      options,
    )
  }

  it('reuses one instance for repeated calls with the same options object', async () => {
    const before = serverFactory.mock.calls.length
    const options = { domain: () => 'brand-a.auth0.com' }
    await call(options)
    await call(options)
    await call(options)
    // Built once, reused for the same reference.
    expect(serverFactory.mock.calls.length - before).toBe(1)
  })

  it('builds separate instances for different resolver configs (does not collapse)', async () => {
    const before = serverFactory.mock.calls.length
    // Two distinct resolver configs. Under the old JSON.stringify key, both the
    // functions serialize to undefined and collapse to the same cache entry.
    await call({ domain: () => 'brand-a.auth0.com' })
    await call({ domain: () => 'brand-b.auth0.com' })
    expect(serverFactory.mock.calls.length - before).toBe(2)
  })

  it('does not collapse a resolver config onto a no-domain config', async () => {
    const before = serverFactory.mock.calls.length
    await call({ clientId: 'a' })
    await call({ domain: () => 'brand-a.auth0.com' })
    expect(serverFactory.mock.calls.length - before).toBe(2)
  })
})
