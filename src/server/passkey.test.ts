import { describe, expect, it, vi } from 'vitest'
import {
  passkeyRegister,
  passkeyChallenge,
  passkeyGetToken,
} from './passkey.js'
import { InvalidConfigurationError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'

function mockAuth0(passkey: Record<string, ReturnType<typeof vi.fn>>): Auth0Instance {
  return { client: { passkey } } as unknown as Auth0Instance
}

describe('passkeyRegister', () => {
  it('delegates to passkey.register', async () => {
    const register = vi
      .fn()
      .mockResolvedValue({ authSession: 's', authnParamsPublicKey: {} })
    const res = await passkeyRegister(mockAuth0({ register }), {
      email: 'a@example.com',
    } as never)
    expect(register).toHaveBeenCalledWith({ email: 'a@example.com' })
    expect(res.authSession).toBe('s')
  })

  it('throws when no user identifier is provided', async () => {
    const register = vi.fn()
    await expect(
      passkeyRegister(mockAuth0({ register }), {} as never),
    ).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(register).not.toHaveBeenCalled()
  })
})

describe('passkeyChallenge', () => {
  it('delegates to passkey.challenge (no options)', async () => {
    const challenge = vi
      .fn()
      .mockResolvedValue({ authSession: 's2', authnParamsPublicKey: {} })
    await passkeyChallenge(mockAuth0({ challenge }))
    expect(challenge).toHaveBeenCalledWith(undefined)
  })
})

describe('passkeyGetToken', () => {
  it('delegates to passkey.getToken', async () => {
    const getToken = vi.fn().mockResolvedValue({ authorizationDetails: [] })
    await passkeyGetToken(mockAuth0({ getToken }), {
      authSession: 's',
      credential: {},
    } as never)
    expect(getToken).toHaveBeenCalledWith({ authSession: 's', credential: {} })
  })
})
