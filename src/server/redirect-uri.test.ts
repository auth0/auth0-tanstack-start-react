import { describe, expect, it, vi, beforeEach } from 'vitest'

let currentRequest: Request

vi.mock('@tanstack/start-server-core', () => ({
  getRequest: () => currentRequest,
}))

import { switchOrg } from './organizations.js'
import { connectAccount, completeConnectAccount } from './account-linking.js'
import type { Auth0Instance } from './auth0-server.js'

// A resolver domain with no appBaseUrl puts the SDK in per-request mode, so the
// redirect_uri is built from the ambient request host read via getRequest().
function mcdInstance(
  fns: Record<string, ReturnType<typeof vi.fn>>,
  config: Partial<Record<string, unknown>> = {},
): Auth0Instance {
  return {
    client: fns,
    config: {
      domain: () => 'brand-a.auth0.com',
      appBaseUrl: undefined,
      routes: undefined,
      trustProxy: false,
      ...config,
    },
  } as unknown as Auth0Instance
}

beforeEach(() => {
  currentRequest = new Request('https://brand-a.example.com/switch', {
    headers: { host: 'brand-a.example.com' },
  })
})

describe('per-request redirect_uri in Multiple Custom Domains mode', () => {
  it('switchOrg derives redirect_uri and returnTo from the request host', async () => {
    const startInteractiveLogin = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-a.auth0.com/authorize'))
    const auth0 = mcdInstance({ startInteractiveLogin })

    await switchOrg(auth0, { organization: 'org_xyz', returnTo: '/dash' })

    const arg = startInteractiveLogin.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://brand-a.example.com/auth/callback',
    )
    expect(arg.authorizationParams.organization).toBe('org_xyz')
    // returnTo is validated against the inferred per-request origin.
    expect(arg.appState).toEqual({ returnTo: 'https://brand-a.example.com/dash' })
  })

  it('connectAccount derives redirect_uri from the request host', async () => {
    const startLinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-a.auth0.com/authorize'))
    const auth0 = mcdInstance({ startLinkUser })

    await connectAccount(auth0, {
      connection: 'google-oauth2',
      connectionScope: 'email',
    })

    const arg = startLinkUser.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://brand-a.example.com/auth/callback',
    )
    expect(arg.connection).toBe('google-oauth2')
  })

  it('builds redirect_uri from the forwarded host once trustProxy is enabled', async () => {
    const startInteractiveLogin = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-b.auth0.com/authorize'))
    const auth0 = mcdInstance({ startInteractiveLogin }, { trustProxy: true })
    currentRequest = new Request('http://10.0.0.7:3000/switch', {
      headers: {
        host: '10.0.0.7:3000',
        'x-forwarded-host': 'brand-b.example.com',
        'x-forwarded-proto': 'https',
      },
    })

    await switchOrg(auth0, { organization: 'org_xyz', returnTo: '/dash' })

    const arg = startInteractiveLogin.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://brand-b.example.com/auth/callback',
    )
    expect(arg.appState).toEqual({ returnTo: 'https://brand-b.example.com/dash' })
  })

  it('moves redirect_uri with a customised routes.base', async () => {
    // The exchange re-sends this exact value, so the configured base has to reach
    // it as well as the route that serves the callback.
    const startInteractiveLogin = vi
      .fn()
      .mockResolvedValue(new URL('https://brand-a.auth0.com/authorize'))
    const auth0 = mcdInstance(
      { startInteractiveLogin },
      { routes: { base: '/authentication' } },
    )

    await switchOrg(auth0, { organization: 'org_xyz' })

    const arg = startInteractiveLogin.mock.calls[0]![0]
    expect(arg.authorizationParams.redirect_uri).toBe(
      'https://brand-a.example.com/authentication/callback',
    )
  })

  it('rebuilds the account-linking callback URL from the per-request base URL', async () => {
    const completeLinkUser = vi.fn().mockResolvedValue({ appState: undefined })
    const auth0 = mcdInstance({ completeLinkUser }, { trustProxy: true })
    currentRequest = new Request('http://10.0.0.7:3000/auth/link-callback?code=1', {
      headers: {
        host: '10.0.0.7:3000',
        'x-forwarded-host': 'brand-b.example.com',
        'x-forwarded-proto': 'https',
      },
    })

    await completeConnectAccount(
      auth0,
      new URL('http://10.0.0.7:3000/auth/link-callback?code=1'),
    )

    expect(completeLinkUser.mock.calls[0]![0].toString()).toBe(
      'https://brand-b.example.com/auth/link-callback?code=1',
    )
  })
})

describe('per-request redirect_uri with an appBaseUrl allow-list', () => {
  function allowListInstance(
    fns: Record<string, ReturnType<typeof vi.fn>>,
    config: Partial<Record<string, unknown>> = {},
  ): Auth0Instance {
    return {
      client: fns,
      config: {
        domain: 'tenant.auth0.com',
        appBaseUrl: ['https://app.example.com', 'https://preview.example.com'],
        routes: undefined,
        trustProxy: false,
        ...config,
      },
    } as unknown as Auth0Instance
  }

  it('builds redirect_uri from the allow-list entry the request came in on', async () => {
    const startInteractiveLogin = vi
      .fn()
      .mockResolvedValue(new URL('https://tenant.auth0.com/authorize'))
    const auth0 = allowListInstance({ startInteractiveLogin })
    currentRequest = new Request('https://preview.example.com/switch')

    await switchOrg(auth0, { organization: 'org_xyz' })

    expect(
      startInteractiveLogin.mock.calls[0]![0].authorizationParams.redirect_uri,
    ).toBe('https://preview.example.com/auth/callback')
  })

  it('matches the allow-list against the forwarded host once trustProxy is enabled', async () => {
    const startInteractiveLogin = vi
      .fn()
      .mockResolvedValue(new URL('https://tenant.auth0.com/authorize'))
    const auth0 = allowListInstance({ startInteractiveLogin }, { trustProxy: true })
    currentRequest = new Request('http://10.0.0.7:3000/switch', {
      headers: {
        host: '10.0.0.7:3000',
        'x-forwarded-host': 'preview.example.com',
        'x-forwarded-proto': 'https',
      },
    })

    await switchOrg(auth0, { organization: 'org_xyz' })

    expect(
      startInteractiveLogin.mock.calls[0]![0].authorizationParams.redirect_uri,
    ).toBe('https://preview.example.com/auth/callback')
  })

  it('fails with an actionable error when the app is proxied and trustProxy is off', async () => {
    const startInteractiveLogin = vi.fn()
    const auth0 = allowListInstance({ startInteractiveLogin })
    currentRequest = new Request('http://10.0.0.7:3000/switch', {
      headers: {
        host: '10.0.0.7:3000',
        'x-forwarded-host': 'preview.example.com',
        'x-forwarded-proto': 'https',
      },
    })

    await expect(
      switchOrg(auth0, { organization: 'org_xyz' }),
    ).rejects.toThrow(/trustProxy/)
    expect(startInteractiveLogin).not.toHaveBeenCalled()
  })
})
