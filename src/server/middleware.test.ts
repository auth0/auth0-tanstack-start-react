import { describe, expect, it, vi, beforeEach } from 'vitest'

// redirect() from the router throws a special object; mock it to a tagged error
// we can assert on without pulling the full router runtime.
vi.mock('@tanstack/react-router', () => ({
  redirect: (opts: unknown) => {
    const err = new Error('REDIRECT') as Error & { redirectOpts: unknown }
    err.redirectOpts = opts
    return err
  },
}))

import {
  auth0FunctionMiddleware,
  requireAuthMiddleware,
  withApiAuth,
  withApiScopes,
  withApiOrg,
  withApiClaimEquals,
  withApiClaimIncludes,
} from './middleware.js'
import { UnauthorizedError, ForbiddenError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'
import type { Auth0RouterContext } from '../types/index.js'

/**
 * Builds an Auth0Instance whose getSession returns a foundation-shaped session
 * (or undefined). The middleware maps it via toAuth0RouterContext internally.
 */
function mockAuth0(session: unknown, audience?: string): Auth0Instance {
  return {
    client: { getSession: vi.fn().mockResolvedValue(session) },
    config: { routes: { login: '/auth/login' }, audience },
  } as unknown as Auth0Instance
}

function authedSession(extra: Record<string, unknown> = {}) {
  return {
    user: { sub: 'auth0|1', ...extra },
    idToken: 'id',
    refreshToken: 'r',
    tokenSets: [
      { audience: 'default', accessToken: 'a', scope: 'read:x', expiresAt: 9999999999 },
    ],
    internal: { sid: 's', createdAt: 1 },
  }
}

/** Invokes a middleware's server handler with a spy `next`, returns { next, result, thrown }. */
async function runServer(middleware: unknown) {
  const server = (
    middleware as { options: { server: (o: unknown) => unknown } }
  ).options.server
  const next = vi.fn((arg?: unknown) => ({ __next: true, arg }))
  let thrown: unknown
  let result: unknown
  try {
    result = await server({ next })
  } catch (e) {
    thrown = e
  }
  return { next, result, thrown }
}

beforeEach(() => vi.clearAllMocks())

describe('auth0FunctionMiddleware', () => {
  it('attaches context.auth0 and never blocks (authenticated)', async () => {
    const { next } = await runServer(auth0FunctionMiddleware(mockAuth0(authedSession())))
    const ctx = (next.mock.calls[0]![0] as { context: { auth0: Auth0RouterContext } })
      .context.auth0
    expect(ctx.isAuthenticated).toBe(true)
    expect(ctx.user?.sub).toBe('auth0|1')
  })

  it('never blocks when unauthenticated', async () => {
    const { next, thrown } = await runServer(auth0FunctionMiddleware(mockAuth0(undefined)))
    expect(thrown).toBeUndefined()
    const ctx = (next.mock.calls[0]![0] as { context: { auth0: Auth0RouterContext } })
      .context.auth0
    expect(ctx.isAuthenticated).toBe(false)
  })
})

describe('requireAuthMiddleware', () => {
  it('passes through when authenticated', async () => {
    const { next, thrown } = await runServer(requireAuthMiddleware(mockAuth0(authedSession())))
    expect(thrown).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  it('redirects when unauthenticated', async () => {
    const { thrown } = await runServer(requireAuthMiddleware(mockAuth0(undefined)))
    expect((thrown as Error).message).toBe('REDIRECT')
  })
})

describe('withApiAuth', () => {
  it('throws UnauthorizedError without a session', async () => {
    const { thrown } = await runServer(withApiAuth(mockAuth0(undefined)))
    expect(thrown).toBeInstanceOf(UnauthorizedError)
  })

  it('passes when authenticated', async () => {
    const { thrown, next } = await runServer(withApiAuth(mockAuth0(authedSession())))
    expect(thrown).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })
})

describe('withApiScopes', () => {
  it('throws ForbiddenError when a scope is missing', async () => {
    const { thrown } = await runServer(
      withApiScopes(mockAuth0(authedSession()), ['read:x', 'write:y']),
    )
    expect(thrown).toBeInstanceOf(ForbiddenError)
  })

  it('passes when all scopes are present', async () => {
    const { thrown } = await runServer(
      withApiScopes(mockAuth0(authedSession()), ['read:x']),
    )
    expect(thrown).toBeUndefined()
  })

  it('enforces the scope of the configured audience, not tokenSets[0]', async () => {
    // Two audiences: the first entry grants write:y, the configured one does not.
    const session = {
      user: { sub: 'auth0|1' },
      idToken: 'id',
      refreshToken: 'r',
      tokenSets: [
        { audience: 'https://other.example.com', accessToken: 'a', scope: 'write:y', expiresAt: 9999999999 },
        { audience: 'https://api.example.com', accessToken: 'b', scope: 'read:x', expiresAt: 9999999999 },
      ],
      internal: { sid: 's', createdAt: 1 },
    }
    const auth0 = mockAuth0(session, 'https://api.example.com')
    // write:y exists only on the non-configured audience, so it must be missing.
    const missing = await runServer(withApiScopes(auth0, ['write:y']))
    expect(missing.thrown).toBeInstanceOf(ForbiddenError)
    // read:x is on the configured audience, so it must pass.
    const ok = await runServer(withApiScopes(auth0, ['read:x']))
    expect(ok.thrown).toBeUndefined()
  })
})

describe('withApiOrg', () => {
  it('throws ForbiddenError on org mismatch', async () => {
    const { thrown } = await runServer(
      withApiOrg(mockAuth0(authedSession({ org_id: 'org_2' })), 'org_1'),
    )
    expect(thrown).toBeInstanceOf(ForbiddenError)
  })

  it('passes on org match', async () => {
    const { thrown } = await runServer(
      withApiOrg(mockAuth0(authedSession({ org_id: 'org_1' })), 'org_1'),
    )
    expect(thrown).toBeUndefined()
  })
})

describe('withApiClaimEquals', () => {
  it('throws when the claim does not match', async () => {
    const { thrown } = await runServer(
      withApiClaimEquals(mockAuth0(authedSession({ email_verified: false })), 'email_verified', true),
    )
    expect(thrown).toBeInstanceOf(ForbiddenError)
  })

  it('passes when the claim matches', async () => {
    const { thrown } = await runServer(
      withApiClaimEquals(mockAuth0(authedSession({ email_verified: true })), 'email_verified', true),
    )
    expect(thrown).toBeUndefined()
  })
})

describe('withApiClaimIncludes', () => {
  it('throws when no value is present', async () => {
    const { thrown } = await runServer(
      withApiClaimIncludes(mockAuth0(authedSession({ roles: ['member'] })), 'roles', 'admin'),
    )
    expect(thrown).toBeInstanceOf(ForbiddenError)
  })

  it('passes when at least one value is present', async () => {
    const { thrown } = await runServer(
      withApiClaimIncludes(
        mockAuth0(authedSession({ roles: ['member', 'admin'] })),
        'roles',
        'admin',
      ),
    )
    expect(thrown).toBeUndefined()
  })
})
