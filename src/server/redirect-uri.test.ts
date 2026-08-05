import { describe, expect, it, vi, beforeEach } from 'vitest'

let currentRequest: Request

vi.mock('@tanstack/start-server-core', () => ({
  getRequest: () => currentRequest,
}))

import { switchOrg } from './organizations.js'
import { connectAccount } from './account-linking.js'
import type { Auth0Instance } from './auth0-server.js'

// A resolver domain with no appBaseUrl puts the SDK in per-request mode, so the
// redirect_uri is built from the ambient request host read via getRequest().
function mcdInstance(fns: Record<string, ReturnType<typeof vi.fn>>): Auth0Instance {
  return {
    client: fns,
    config: { domain: () => 'brand-a.auth0.com', appBaseUrl: undefined, routes: undefined },
  } as unknown as Auth0Instance
}

beforeEach(() => {
  currentRequest = new Request('https://brand-a.example.com/switch', {
    headers: { host: 'brand-a.example.com', 'x-forwarded-proto': 'https' },
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
})
