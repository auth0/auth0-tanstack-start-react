import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth0Server } from './auth0-server.js'
import { passkeyRegister, passkeyChallenge } from './passkey.js'

/**
 * Regression guard for the confidential-client passkey fix (SDK-10671 / BUG-03).
 *
 * Unlike passkey.test.ts, which mocks `client.passkey`, this exercises the real
 * `@auth0/auth0-server-js` -> `@auth0/auth0-auth-js` stack through our own
 * `auth0Server()` entry point, stubbing only `fetch`. It asserts that a
 * confidential client's `client_secret` reaches the `/passkey/register` and
 * `/passkey/challenge` request bodies.
 *
 * This forwarding only exists in auth0-auth-js >= 1.12.1 (pulled in by
 * auth0-server-js >= 1.12.1). If the dependency floor is ever lowered below
 * that, or our config stops forwarding `clientSecret`, this test fails.
 */

const CLIENT_SECRET = 'confidential-web-app-secret'

/** Captures the JSON body of the first request to a path matching `pathSuffix`. */
function stubFetchCapturing(pathSuffix: string): () => Record<string, unknown> | undefined {
  let captured: Record<string, unknown> | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith(pathSuffix) && init?.body) {
        captured = JSON.parse(String(init.body))
      }
      // Minimal shape so the passkey response transform does not throw.
      return new Response(
        JSON.stringify({
          auth_session: 'auth-session-1',
          authn_params_public_key: { challenge: 'c', rp: {}, user: {} },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }),
  )
  return () => captured
}

function confidentialAuth0() {
  return auth0Server({
    domain: 'tenant.auth0.com',
    clientId: 'my-client-id',
    clientSecret: CLIENT_SECRET,
    secret: 'x'.repeat(32),
    appBaseUrl: 'https://app.example.com',
  })
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('passkey confidential-client authentication (SDK-10671)', () => {
  it('sends client_secret to /passkey/register for a confidential client', async () => {
    const getBody = stubFetchCapturing('/passkey/register')
    await passkeyRegister(confidentialAuth0(), { email: 'a@example.com' } as never)
    const body = getBody()
    expect(body).toBeDefined()
    expect(body!.client_id).toBe('my-client-id')
    expect(body!.client_secret).toBe(CLIENT_SECRET)
  })

  it('sends client_secret to /passkey/challenge for a confidential client', async () => {
    const getBody = stubFetchCapturing('/passkey/challenge')
    await passkeyChallenge(confidentialAuth0())
    const body = getBody()
    expect(body).toBeDefined()
    expect(body!.client_id).toBe('my-client-id')
    expect(body!.client_secret).toBe(CLIENT_SECRET)
  })
})
