import { describe, expect, it, vi } from 'vitest'
import { backchannelAuthentication } from './ciba.js'
import { InvalidConfigurationError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'

function mockAuth0(loginBackchannel: ReturnType<typeof vi.fn>): Auth0Instance {
  return { client: { loginBackchannel } } as unknown as Auth0Instance
}

describe('backchannelAuthentication', () => {
  it('forwards bindingMessage, loginHint, and authorizationParams', async () => {
    const loginBackchannel = vi.fn().mockResolvedValue({})
    await backchannelAuthentication(mockAuth0(loginBackchannel), {
      bindingMessage: 'Approve $42',
      loginHint: { sub: 'auth0|123' },
      authorizationParams: { audience: 'https://api.example.com' },
    })
    expect(loginBackchannel).toHaveBeenCalledWith({
      bindingMessage: 'Approve $42',
      loginHint: { sub: 'auth0|123' },
      authorizationParams: { audience: 'https://api.example.com' },
    })
  })

  it('returns authorizationDetails from the result', async () => {
    const loginBackchannel = vi
      .fn()
      .mockResolvedValue({ authorizationDetails: [{ type: 'payment' }] })
    const res = await backchannelAuthentication(mockAuth0(loginBackchannel), {
      bindingMessage: 'm',
      loginHint: { sub: 'auth0|1' },
    })
    expect(res.authorizationDetails).toEqual([{ type: 'payment' }])
  })

  it('throws when bindingMessage is missing', async () => {
    const loginBackchannel = vi.fn()
    await expect(
      backchannelAuthentication(mockAuth0(loginBackchannel), {
        bindingMessage: '',
        loginHint: { sub: 'auth0|1' },
      }),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(loginBackchannel).not.toHaveBeenCalled()
  })

  it('throws when loginHint.sub is missing', async () => {
    const loginBackchannel = vi.fn()
    await expect(
      backchannelAuthentication(mockAuth0(loginBackchannel), {
        bindingMessage: 'm',
        loginHint: { sub: '' },
      }),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
  })

  it('propagates foundation errors (e.g. denial / expiry)', async () => {
    const loginBackchannel = vi.fn().mockRejectedValue(new Error('access_denied'))
    await expect(
      backchannelAuthentication(mockAuth0(loginBackchannel), {
        bindingMessage: 'm',
        loginHint: { sub: 'auth0|1' },
      }),
    ).rejects.toThrow('access_denied')
  })
})
