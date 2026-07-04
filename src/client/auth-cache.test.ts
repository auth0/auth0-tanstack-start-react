import { describe, expect, it } from 'vitest'
import {
  getClientAuthCache,
  setClientAuthCache,
  clearClientAuthCache,
} from './auth-cache.js'
import type { Auth0RouterContext } from '../types/index.js'

const RESOLVED: Auth0RouterContext = {
  user: { sub: 'auth0|1' },
  isAuthenticated: true,
  status: 'resolved',
  isLoading: false,
}

describe('client auth cache', () => {
  it('starts undefined, stores, then clears', () => {
    clearClientAuthCache()
    expect(getClientAuthCache()).toBeUndefined()
    setClientAuthCache(RESOLVED)
    expect(getClientAuthCache()).toEqual(RESOLVED)
    clearClientAuthCache()
    expect(getClientAuthCache()).toBeUndefined()
  })
})
