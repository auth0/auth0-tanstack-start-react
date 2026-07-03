import { describe, expect, it } from 'vitest'
import {
  toSessionData,
  toAuth0RouterContext,
  toTokenSet,
} from './session-mapper.js'
import type { SessionData as FoundationSessionData } from '@auth0/auth0-server-js'

function foundationSession(
  overrides: Partial<FoundationSessionData> = {},
): FoundationSessionData {
  return {
    user: { sub: 'auth0|123', email: 'a@example.com' },
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    tokenSets: [
      {
        audience: 'default',
        accessToken: 'access-token',
        scope: 'openid profile',
        expiresAt: 1735689600,
      },
    ],
    internal: { sid: 'sid-1', createdAt: 1735686000 },
    ...overrides,
  } as FoundationSessionData
}

/** A session holding token sets for two different audiences. */
function multiAudienceSession(): FoundationSessionData {
  return foundationSession({
    tokenSets: [
      {
        audience: 'https://billing.example.com',
        accessToken: 'billing-token',
        scope: 'read:invoices',
        expiresAt: 1735689600,
      },
      {
        audience: 'default',
        accessToken: 'default-token',
        scope: 'openid profile',
        expiresAt: 1735689600,
      },
    ],
  } as Partial<FoundationSessionData>)
}

describe('toSessionData', () => {
  it('flattens the default token set onto the session', () => {
    const data = toSessionData(foundationSession())
    expect(data).not.toBeNull()
    expect(data!.user.sub).toBe('auth0|123')
    expect(data!.accessToken).toBe('access-token')
    expect(data!.accessTokenExpiresAt).toBe(1735689600)
    expect(data!.refreshToken).toBe('refresh-token')
    expect(data!.createdAt).toBe(1735686000)
  })

  it('selects the token set that matches the requested audience', () => {
    const data = toSessionData(
      multiAudienceSession(),
      'https://billing.example.com',
    )
    expect(data!.accessToken).toBe('billing-token')
    expect(data!.accessTokenScope).toBe('read:invoices')
  })

  it('falls back to the default audience when none is requested', () => {
    const data = toSessionData(multiAudienceSession())
    expect(data!.accessToken).toBe('default-token')
  })

  it('leaves the access token empty when no set matches the audience', () => {
    const data = toSessionData(multiAudienceSession(), 'https://unknown.example.com')
    expect(data!.accessToken).toBe('')
    expect(data!.accessTokenScope).toBeUndefined()
  })

  it('leaves createdAt undefined when the store did not record it', () => {
    const session = foundationSession({
      internal: { sid: 'sid-1' },
    } as Partial<FoundationSessionData>)
    expect(toSessionData(session)!.createdAt).toBeUndefined()
  })

  it('returns null when there is no session', () => {
    expect(toSessionData(undefined)).toBeNull()
  })

  it('returns null when the session has no user', () => {
    expect(
      toSessionData(foundationSession({ user: undefined })),
    ).toBeNull()
  })
})

describe('toAuth0RouterContext', () => {
  it('marks an authenticated context with isLoading false', () => {
    const ctx = toAuth0RouterContext(foundationSession())
    expect(ctx.isAuthenticated).toBe(true)
    expect(ctx.isLoading).toBe(false)
    expect(ctx.user?.sub).toBe('auth0|123')
  })

  it('marks an unauthenticated context', () => {
    const ctx = toAuth0RouterContext(undefined)
    expect(ctx.isAuthenticated).toBe(false)
    expect(ctx.user).toBeUndefined()
  })

  it('never exposes tokens or the session body (C1)', () => {
    // The router context is dehydrated into client HTML, so it must carry no
    // secrets even when the foundation session is full of tokens.
    const ctx = toAuth0RouterContext(foundationSession())
    expect(ctx).toEqual({
      user: { sub: 'auth0|123', email: 'a@example.com' },
      isAuthenticated: true,
      status: 'resolved',
      isLoading: false,
    })
    const serialized = JSON.stringify(ctx)
    expect(serialized).not.toContain('access-token')
    expect(serialized).not.toContain('refresh-token')
    expect(serialized).not.toContain('id-token')
    expect(ctx).not.toHaveProperty('session')
  })
})

describe('toTokenSet', () => {
  it('maps the default token set', () => {
    const ts = toTokenSet(foundationSession())
    expect(ts).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      idToken: 'id-token',
      expiresAt: 1735689600,
      scope: 'openid profile',
      tokenType: 'Bearer',
    })
  })

  it('maps the token set for the requested audience', () => {
    const ts = toTokenSet(multiAudienceSession(), 'https://billing.example.com')
    expect(ts!.accessToken).toBe('billing-token')
    expect(ts!.scope).toBe('read:invoices')
  })

  it('returns null when no set matches the audience', () => {
    expect(
      toTokenSet(multiAudienceSession(), 'https://unknown.example.com'),
    ).toBeNull()
  })

  it('returns null without a session', () => {
    expect(toTokenSet(undefined)).toBeNull()
  })
})
