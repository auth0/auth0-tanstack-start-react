import { describe, expect, it, vi } from 'vitest'
import { switchOrg, acceptOrgInvitation } from './organizations.js'
import { InvalidConfigurationError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'

const APP_BASE_URL = 'https://app.example.com'

function mockAuth0(startInteractiveLogin: ReturnType<typeof vi.fn>): Auth0Instance {
  return {
    client: { startInteractiveLogin },
    config: { appBaseUrl: APP_BASE_URL },
  } as unknown as Auth0Instance
}

describe('switchOrg', () => {
  it('starts an interactive login with the organization param', async () => {
    const start = vi.fn().mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    const auth0 = mockAuth0(start)

    await switchOrg(auth0, { organization: 'org_xyz', returnTo: '/dash' })

    expect(start).toHaveBeenCalledWith({
      // returnTo is resolved against the app origin and stored as an absolute URL.
      appState: { returnTo: `${APP_BASE_URL}/dash` },
      authorizationParams: { organization: 'org_xyz' },
    })
  })

  it('drops an off-origin returnTo (open-redirect protection)', async () => {
    const start = vi.fn().mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await switchOrg(mockAuth0(start), {
      organization: 'org_xyz',
      returnTo: 'https://evil.com/phish',
    })
    expect(start.mock.calls[0]![0].appState).toBeUndefined()
  })

  it('omits appState when returnTo is not provided', async () => {
    const start = vi.fn().mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await switchOrg(mockAuth0(start), { organization: 'org_xyz' })
    expect(start).toHaveBeenCalledWith({
      appState: undefined,
      authorizationParams: { organization: 'org_xyz' },
    })
  })

  it('forwards extra authorizationParams (e.g. prompt=none)', async () => {
    const start = vi.fn().mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await switchOrg(mockAuth0(start), {
      organization: 'org_xyz',
      authorizationParams: { prompt: 'none' },
    })
    expect(start).toHaveBeenCalledWith({
      appState: undefined,
      authorizationParams: { prompt: 'none', organization: 'org_xyz' },
    })
  })

  it('throws on an empty organization', async () => {
    const start = vi.fn()
    await expect(
      switchOrg(mockAuth0(start), { organization: '' }),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(start).not.toHaveBeenCalled()
  })
})

describe('acceptOrgInvitation', () => {
  it('starts a login with organization + invitation params', async () => {
    const start = vi.fn().mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await acceptOrgInvitation(mockAuth0(start), {
      organization: 'org_abc',
      invitation: 'inv_xyz',
    })
    expect(start).toHaveBeenCalledWith({
      appState: undefined,
      authorizationParams: { organization: 'org_abc', invitation: 'inv_xyz' },
    })
  })

  it('keeps a same-origin returnTo but drops an off-origin one', async () => {
    const start = vi.fn().mockResolvedValue(new URL('https://t.auth0.com/authorize'))

    await acceptOrgInvitation(mockAuth0(start), {
      organization: 'org_abc',
      invitation: 'inv_xyz',
      returnTo: '/welcome',
    })
    expect(start.mock.calls[0]![0].appState).toEqual({
      returnTo: `${APP_BASE_URL}/welcome`,
    })

    start.mockClear()
    await acceptOrgInvitation(mockAuth0(start), {
      organization: 'org_abc',
      invitation: 'inv_xyz',
      returnTo: '//evil.com',
    })
    expect(start.mock.calls[0]![0].appState).toBeUndefined()
  })

  it('throws when invitation is missing', async () => {
    const start = vi.fn()
    await expect(
      acceptOrgInvitation(mockAuth0(start), {
        organization: 'org_abc',
        invitation: '',
      }),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(start).not.toHaveBeenCalled()
  })
})
