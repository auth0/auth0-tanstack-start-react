// @vitest-environment node
// `generateSessionCookie` uses `jose` for JWE encryption, which requires the
// real Node Uint8Array realm; jsdom's realm mismatch breaks jose's instanceof
// checks. The other testing utilities are realm-agnostic.
import { describe, expect, it } from 'vitest'
import {
  createMockAuth0Context,
  createMockAuth0Client,
  generateSessionCookie,
} from './index.js'
import type { Auth0Instance } from '../server/auth0-server.js'
import { customTokenExchange } from '../server/token-exchange.js'
import { passkeyChallenge, passkeyRegister } from '../server/passkey.js'
import { mfaChallenge } from '../server/mfa.js'

describe('createMockAuth0Context', () => {
  it('derives an authenticated context from a user', () => {
    const ctx = createMockAuth0Context({ user: { sub: 'auth0|1', name: 'Alice' } })
    expect(ctx.isAuthenticated).toBe(true)
    expect(ctx.user?.name).toBe('Alice')
    // The context carries only display claims — no tokens/session body.
    expect(ctx).not.toHaveProperty('session')
  })

  it('is unauthenticated without a user', () => {
    const ctx = createMockAuth0Context()
    expect(ctx.isAuthenticated).toBe(false)
    expect(ctx.user).toBeUndefined()
  })
})

describe('createMockAuth0Client', () => {
  it('returns the configured session from getSession', async () => {
    const mock = createMockAuth0Client({
      session: { user: { sub: 'auth0|1' }, accessToken: 'tok' },
    })
    const session = await mock.client.getSession()
    expect(session?.user?.sub).toBe('auth0|1')
    const token = await mock.client.getAccessToken()
    expect(token.accessToken).toBe('tok')
  })

  it('returns null session by default', async () => {
    const mock = createMockAuth0Client()
    expect(await mock.client.getSession()).toBeNull()
  })

  // Drive the mock through the REAL server wrappers. This is what catches a
  // stub whose method name does not match what the SDK actually calls on the
  // foundation client (custom token exchange and passkey challenge/register).
  it('supports the enterprise server wrappers without hitting undefined', async () => {
    const auth0 = createMockAuth0Client() as unknown as Auth0Instance

    await expect(
      customTokenExchange(auth0, {
        subjectToken: 't',
        subjectTokenType: 'urn:example:token',
      }),
    ).resolves.toBeDefined()

    await expect(passkeyChallenge(auth0)).resolves.toBeDefined()

    await expect(
      passkeyRegister(auth0, { email: 'user@example.com' } as never),
    ).resolves.toBeDefined()

    await expect(
      mfaChallenge(auth0, { mfaToken: 'm', challengeType: 'otp' }),
    ).resolves.toBeDefined()
  })
})

describe('generateSessionCookie', () => {
  it('produces a non-empty encrypted cookie value', async () => {
    const value = await generateSessionCookie({
      secret: 'x'.repeat(32),
      user: { sub: 'auth0|test', email: 'test@example.com' },
    })
    expect(typeof value).toBe('string')
    expect(value.length).toBeGreaterThan(0)
  })
})
