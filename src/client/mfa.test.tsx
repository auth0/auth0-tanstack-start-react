import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMfa, type MfaServerFns } from './mfa.js'

function serverFns(): MfaServerFns {
  return {
    getAuthenticators: vi.fn().mockResolvedValue([{ id: 'a1' }]),
    challenge: vi.fn().mockResolvedValue({ challengeType: 'otp' }),
    verify: vi.fn().mockResolvedValue(undefined),
    enroll: vi.fn().mockResolvedValue({ authenticatorType: 'otp' }),
  } as unknown as MfaServerFns
}

describe('useMfa', () => {
  it('passes mfaToken through to getAuthenticators', async () => {
    const fns = serverFns()
    const { result } = renderHook(() => useMfa(fns))
    await result.current.getAuthenticators('tok')
    expect(fns.getAuthenticators).toHaveBeenCalledWith({ mfaToken: 'tok' })
  })

  it('assembles the challenge payload from positional args', async () => {
    const fns = serverFns()
    const { result } = renderHook(() => useMfa(fns))
    await result.current.challenge('auth-1', { mfaToken: 'tok', challengeType: 'oob' })
    expect(fns.challenge).toHaveBeenCalledWith({
      authenticatorId: 'auth-1',
      mfaToken: 'tok',
      challengeType: 'oob',
    })
  })

  it('forwards verify and enroll options unchanged', async () => {
    const fns = serverFns()
    const { result } = renderHook(() => useMfa(fns))
    await result.current.verify({ mfaToken: 't', factorType: 'otp', otp: '123456' })
    expect(fns.verify).toHaveBeenCalledWith({
      mfaToken: 't',
      factorType: 'otp',
      otp: '123456',
    })
    await result.current.enroll({ mfaToken: 't', authenticatorTypes: ['otp'] })
    expect(fns.enroll).toHaveBeenCalledWith({
      mfaToken: 't',
      authenticatorTypes: ['otp'],
    })
  })
})
