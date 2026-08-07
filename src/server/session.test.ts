import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getSession,
  getAccessToken,
  getTokenSet,
  createFetcher,
} from './session.js'
import { AccessTokenError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'

// The session helpers delegate to auth0.client and the session-mapper. Mock the
// mapper so we assert the helpers' own behavior (delegation, shaping, errors)
// rather than re-testing mapping logic covered by session-mapper.test.ts.
vi.mock('./session-mapper.js', () => ({
  toSessionData: vi.fn((session: unknown) => (session ? { mapped: 'session' } : null)),
  toTokenSet: vi.fn((session: unknown) => (session ? { mapped: 'tokenSet' } : null)),
}))

function mockAuth0(over: Record<string, unknown> = {}): Auth0Instance {
  return {
    client: {
      getSession: vi.fn(async () => ({ user: { sub: 'auth0|1' } })),
      getAccessToken: vi.fn(async () => ({
        accessToken: 'at',
        expiresAt: 123,
        scope: 'read:x',
      })),
      ...over,
    },
    config: { audience: 'https://api.example.com' },
  } as unknown as Auth0Instance
}

beforeEach(() => vi.clearAllMocks())

describe('getSession', () => {
  it('maps the foundation session through toSessionData with the configured audience', async () => {
    const auth0 = mockAuth0()
    const result = await getSession(auth0)
    expect(auth0.client.getSession).toHaveBeenCalled()
    expect(result).toEqual({ mapped: 'session' })
  })

  it('returns null when there is no session', async () => {
    const auth0 = mockAuth0({ getSession: vi.fn(async () => null) })
    expect(await getSession(auth0)).toBeNull()
  })
})

describe('getTokenSet', () => {
  it('maps the session through toTokenSet', async () => {
    const auth0 = mockAuth0()
    expect(await getTokenSet(auth0)).toEqual({ mapped: 'tokenSet' })
  })

  it('returns null when there is no session', async () => {
    const auth0 = mockAuth0({ getSession: vi.fn(async () => null) })
    expect(await getTokenSet(auth0)).toBeNull()
  })
})

describe('getAccessToken', () => {
  it('returns the token, expiry, and scope from the foundation', async () => {
    const auth0 = mockAuth0()
    const res = await getAccessToken(auth0)
    expect(res).toEqual({ token: 'at', expiresAt: 123, scope: 'read:x' })
  })

  it('forwards audience and scope options to the foundation', async () => {
    const auth0 = mockAuth0()
    await getAccessToken(auth0, { audience: 'https://other', scope: 'write:y' })
    expect(auth0.client.getAccessToken).toHaveBeenCalledWith({
      audience: 'https://other',
      scope: 'write:y',
    })
  })

  it('wraps a foundation failure in AccessTokenError with the cause', async () => {
    const cause = new Error('no refresh token')
    const auth0 = mockAuth0({
      getAccessToken: vi.fn(async () => {
        throw cause
      }),
    })
    await expect(getAccessToken(auth0)).rejects.toBeInstanceOf(AccessTokenError)
    await expect(getAccessToken(auth0)).rejects.toMatchObject({ cause })
  })
})

describe('createFetcher', () => {
  it('attaches the access token as a Bearer header on the request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'))
    const auth0 = mockAuth0()

    const fetcher = createFetcher(auth0, { audience: 'https://api.example.com' })
    await fetcher('https://api.example.com/items')

    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer at')
    fetchSpy.mockRestore()
  })

  it('propagates AccessTokenError and never calls fetch when the token cannot be obtained', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const auth0 = mockAuth0({
      getAccessToken: vi.fn(async () => {
        throw new Error('expired')
      }),
    })

    const fetcher = createFetcher(auth0)
    await expect(fetcher('https://api.example.com/items')).rejects.toBeInstanceOf(
      AccessTokenError,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
