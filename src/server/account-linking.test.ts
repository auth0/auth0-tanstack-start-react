import { describe, expect, it, vi } from 'vitest'
import {
  connectAccount,
  completeConnectAccount,
  disconnectAccount,
  completeDisconnectAccount,
} from './account-linking.js'
import { InvalidConfigurationError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'

const APP_BASE_URL = 'https://app.example.com'

function mockAuth0(fns: Record<string, ReturnType<typeof vi.fn>>): Auth0Instance {
  return {
    client: fns,
    config: { appBaseUrl: APP_BASE_URL },
  } as unknown as Auth0Instance
}

describe('connectAccount', () => {
  it('starts link-user with the provided connection and scope', async () => {
    const startLinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await connectAccount(mockAuth0({ startLinkUser }), {
      connection: 'google-oauth2',
      connectionScope: 'email profile',
      returnTo: '/settings',
    })
    expect(startLinkUser).toHaveBeenCalledWith({
      connection: 'google-oauth2',
      connectionScope: 'email profile',
      // returnTo is resolved against the app origin and stored as an absolute URL.
      appState: { returnTo: `${APP_BASE_URL}/settings` },
      authorizationParams: undefined,
    })
  })

  it('throws on an empty connection', async () => {
    const startLinkUser = vi.fn()
    await expect(
      connectAccount(mockAuth0({ startLinkUser }), {
        connection: '',
        connectionScope: '',
      }),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(startLinkUser).not.toHaveBeenCalled()
  })

  it('propagates errors thrown by the foundation', async () => {
    const startLinkUser = vi.fn().mockRejectedValue(new Error('link failed'))
    await expect(
      connectAccount(mockAuth0({ startLinkUser }), {
        connection: 'google-oauth2',
        connectionScope: '',
      }),
    ).rejects.toThrow('link failed')
  })

  it('drops an off-origin returnTo (open-redirect protection)', async () => {
    const startLinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await connectAccount(mockAuth0({ startLinkUser }), {
      connection: 'google-oauth2',
      connectionScope: '',
      returnTo: 'https://evil.com/steal',
    })
    // The malicious returnTo must not be stored; appState is dropped entirely.
    expect(startLinkUser.mock.calls[0]![0].appState).toBeUndefined()
  })

  it('drops a protocol-relative returnTo pointing off-origin', async () => {
    const startLinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await connectAccount(mockAuth0({ startLinkUser }), {
      connection: 'google-oauth2',
      connectionScope: '',
      returnTo: '//evil.com',
    })
    expect(startLinkUser.mock.calls[0]![0].appState).toBeUndefined()
  })

  it('keeps a same-origin absolute returnTo', async () => {
    const startLinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await connectAccount(mockAuth0({ startLinkUser }), {
      connection: 'google-oauth2',
      connectionScope: '',
      returnTo: `${APP_BASE_URL}/settings`,
    })
    expect(startLinkUser.mock.calls[0]![0].appState).toEqual({
      returnTo: `${APP_BASE_URL}/settings`,
    })
  })

  it('stores no appState when returnTo is omitted', async () => {
    const startLinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await connectAccount(mockAuth0({ startLinkUser }), {
      connection: 'google-oauth2',
      connectionScope: '',
    })
    expect(startLinkUser.mock.calls[0]![0].appState).toBeUndefined()
  })
})

describe('completeConnectAccount', () => {
  it('delegates to completeLinkUser with the callback URL', async () => {
    const completeLinkUser = vi.fn().mockResolvedValue({ appState: { returnTo: '/x' } })
    const url = new URL('https://app.example.com/cb?code=1')
    const res = await completeConnectAccount(mockAuth0({ completeLinkUser }), url)
    expect(completeLinkUser).toHaveBeenCalledWith(url)
    expect(res.appState).toEqual({ returnTo: '/x' })
  })
})

describe('disconnectAccount', () => {
  it('starts unlink-user with the connection', async () => {
    const startUnlinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await disconnectAccount(mockAuth0({ startUnlinkUser }), {
      connection: 'google-oauth2',
    })
    expect(startUnlinkUser).toHaveBeenCalledWith({
      connection: 'google-oauth2',
      appState: undefined,
      authorizationParams: undefined,
    })
  })

  it('drops an off-origin returnTo (open-redirect protection)', async () => {
    const startUnlinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await disconnectAccount(mockAuth0({ startUnlinkUser }), {
      connection: 'google-oauth2',
      returnTo: 'https://evil.com',
    })
    expect(startUnlinkUser.mock.calls[0]![0].appState).toBeUndefined()
  })

  it('keeps a same-origin returnTo', async () => {
    const startUnlinkUser = vi
      .fn()
      .mockResolvedValue(new URL('https://t.auth0.com/authorize'))
    await disconnectAccount(mockAuth0({ startUnlinkUser }), {
      connection: 'google-oauth2',
      returnTo: '/account',
    })
    expect(startUnlinkUser.mock.calls[0]![0].appState).toEqual({
      returnTo: `${APP_BASE_URL}/account`,
    })
  })
})

describe('completeDisconnectAccount', () => {
  it('delegates to completeUnlinkUser', async () => {
    const completeUnlinkUser = vi.fn().mockResolvedValue({ appState: undefined })
    const url = new URL('https://app.example.com/cb?code=2')
    await completeDisconnectAccount(mockAuth0({ completeUnlinkUser }), url)
    expect(completeUnlinkUser).toHaveBeenCalledWith(url)
  })
})
