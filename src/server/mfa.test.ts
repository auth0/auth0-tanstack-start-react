import { describe, expect, it, vi } from 'vitest'
import {
  mfaGetAuthenticators,
  mfaChallenge,
  mfaVerify,
  mfaEnroll,
} from './mfa.js'
import type { Auth0Instance } from './auth0-server.js'

function mockAuth0(mfa: Record<string, ReturnType<typeof vi.fn>>): Auth0Instance {
  return { client: { mfa } } as unknown as Auth0Instance
}

describe('mfaGetAuthenticators', () => {
  it('maps the foundation authenticator shape (oobChannels array) onto our type', async () => {
    const listAuthenticators = vi.fn().mockResolvedValue([
      {
        id: 'dev_1',
        authenticatorType: 'oob',
        active: true,
        name: 'My phone',
        oobChannels: ['sms'],
        type: 'phone',
      },
    ])
    const auth0 = mockAuth0({ listAuthenticators })

    const result = await mfaGetAuthenticators(auth0, { mfaToken: 'mfa-tok' })

    expect(listAuthenticators).toHaveBeenCalledWith({ mfaToken: 'mfa-tok' })
    expect(result).toEqual([
      {
        id: 'dev_1',
        authenticatorType: 'oob',
        active: true,
        name: 'My phone',
        oobChannels: ['sms'],
      },
    ])
  })
})

describe('mfaChallenge', () => {
  it('passes through challenge options', async () => {
    const challengeAuthenticator = vi
      .fn()
      .mockResolvedValue({ challengeType: 'oob', oobCode: 'oob_1' })
    const auth0 = mockAuth0({ challengeAuthenticator })

    const res = await mfaChallenge(auth0, {
      mfaToken: 'm',
      authenticatorId: 'dev_1',
      challengeType: 'oob',
    })

    expect(challengeAuthenticator).toHaveBeenCalledWith({
      mfaToken: 'm',
      authenticatorId: 'dev_1',
      challengeType: 'oob',
    })
    expect(res.oobCode).toBe('oob_1')
  })
})

describe('mfaVerify', () => {
  it('forwards the discriminated verify options to the foundation', async () => {
    const verify = vi.fn().mockResolvedValue({ accessToken: 'new' })
    const auth0 = mockAuth0({ verify })

    await mfaVerify(auth0, { mfaToken: 'm', factorType: 'otp', otp: '123456' })

    expect(verify).toHaveBeenCalledWith({
      mfaToken: 'm',
      factorType: 'otp',
      otp: '123456',
    })
  })
})

describe('mfaEnroll', () => {
  it('forwards array-shaped enroll options (authenticatorTypes/oobChannels)', async () => {
    const enrollAuthenticator = vi
      .fn()
      .mockResolvedValue({ authenticatorType: 'oob', oobCode: 'x' })
    const auth0 = mockAuth0({ enrollAuthenticator })

    await mfaEnroll(auth0, {
      mfaToken: 'm',
      authenticatorTypes: ['oob'],
      oobChannels: ['sms'],
      phoneNumber: '+15551234567',
    })

    expect(enrollAuthenticator).toHaveBeenCalledWith({
      mfaToken: 'm',
      authenticatorTypes: ['oob'],
      oobChannels: ['sms'],
      phoneNumber: '+15551234567',
    })
  })
})
