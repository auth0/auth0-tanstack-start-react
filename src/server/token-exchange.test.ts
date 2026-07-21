import { describe, expect, it, vi } from 'vitest'
import {
  customTokenExchange,
  getAccessTokenForConnection,
} from './token-exchange.js'
import { InvalidConfigurationError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'

function mockAuth0(fns: Record<string, ReturnType<typeof vi.fn>>): Auth0Instance {
  return { client: fns } as unknown as Auth0Instance
}

describe('customTokenExchange', () => {
  it('forwards exchange options and returns authorizationDetails', async () => {
    const loginWithCustomTokenExchange = vi
      .fn()
      .mockResolvedValue({ authorizationDetails: [{ type: 'x' }] })
    const res = await customTokenExchange(
      mockAuth0({ loginWithCustomTokenExchange }),
      {
        subjectToken: 'tok',
        subjectTokenType: 'urn:acme:legacy-token',
        audience: 'https://api.example.com',
      },
    )
    expect(loginWithCustomTokenExchange).toHaveBeenCalledWith({
      subjectToken: 'tok',
      subjectTokenType: 'urn:acme:legacy-token',
      audience: 'https://api.example.com',
    })
    expect(res.authorizationDetails).toEqual([{ type: 'x' }])
  })

  it('throws when subjectToken is missing', async () => {
    const loginWithCustomTokenExchange = vi.fn()
    await expect(
      customTokenExchange(mockAuth0({ loginWithCustomTokenExchange }), {
        subjectToken: '',
        subjectTokenType: 'urn:acme:legacy-token',
      }),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(loginWithCustomTokenExchange).not.toHaveBeenCalled()
  })

  it('throws when actorToken is provided without actorTokenType', async () => {
    const loginWithCustomTokenExchange = vi.fn()
    await expect(
      customTokenExchange(mockAuth0({ loginWithCustomTokenExchange }), {
        subjectToken: 'tok',
        subjectTokenType: 'urn:acme:legacy-token',
        actorToken: 'actor',
      }),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(loginWithCustomTokenExchange).not.toHaveBeenCalled()
  })

  it('forwards delegation (actorToken/actorTokenType) and extra params', async () => {
    const loginWithCustomTokenExchange = vi.fn().mockResolvedValue({})
    await customTokenExchange(mockAuth0({ loginWithCustomTokenExchange }), {
      subjectToken: 'tok',
      subjectTokenType: 'urn:acme:legacy-token',
      actorToken: 'actor',
      actorTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      extra: { device: 'abc' },
    })
    expect(loginWithCustomTokenExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        actorToken: 'actor',
        actorTokenType: 'urn:ietf:params:oauth:token-type:access_token',
        extra: { device: 'abc' },
      }),
    )
  })
})

describe('getAccessTokenForConnection', () => {
  it('maps the connection token set', async () => {
    const getAccessTokenForConnectionFn = vi.fn().mockResolvedValue({
      accessToken: 'goog-token',
      scope: 'calendar',
      expiresAt: 123,
      connection: 'google-oauth2',
      loginHint: 'u@gmail.com',
      extraIgnored: true,
    })
    const res = await getAccessTokenForConnection(
      mockAuth0({ getAccessTokenForConnection: getAccessTokenForConnectionFn }),
      { connection: 'google-oauth2', loginHint: 'u@gmail.com' },
    )
    expect(getAccessTokenForConnectionFn).toHaveBeenCalledWith({
      connection: 'google-oauth2',
      loginHint: 'u@gmail.com',
    })
    expect(res).toEqual({
      accessToken: 'goog-token',
      scope: 'calendar',
      expiresAt: 123,
      connection: 'google-oauth2',
      loginHint: 'u@gmail.com',
    })
  })

  it('throws when connection is missing', async () => {
    const fn = vi.fn()
    await expect(
      getAccessTokenForConnection(
        mockAuth0({ getAccessTokenForConnection: fn }),
        { connection: '' },
      ),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
  })
})
