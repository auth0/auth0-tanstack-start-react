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

const getHandlers = auth0Handlers as unknown as ReturnType<typeof vi.fn>

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
