import { describe, expect, it } from 'vitest'
import { requireAuth, requireOrg } from './guards.js'
import { createMockAuth0Context } from '../testing/index.js'

/** Runs a guard and returns the thrown redirect (or undefined if it passed). */
function runGuard(
  guard: (ctx: { context: { auth0: ReturnType<typeof createMockAuth0Context> } }) => unknown,
  auth0: ReturnType<typeof createMockAuth0Context>,
): unknown {
  try {
    guard({ context: { auth0 } })
    return undefined
  } catch (thrown) {
    return thrown
  }
}

describe('requireAuth', () => {
  it('passes for an authenticated user', () => {
    const ctx = createMockAuth0Context({ user: { sub: 'auth0|1' } })
    expect(runGuard(requireAuth(), ctx)).toBeUndefined()
  })

  it('redirects an unauthenticated user', () => {
    const ctx = createMockAuth0Context()
    expect(runGuard(requireAuth(), ctx)).toBeDefined()
  })

  it('forces a full-document navigation so the auth route is not matched internally', () => {
    const ctx = createMockAuth0Context()
    const thrown = runGuard(requireAuth(), ctx) as { options?: { reloadDocument?: boolean } }
    expect(thrown.options?.reloadDocument).toBe(true)
  })

  it('no-ops while auth is still loading', () => {
    const ctx = createMockAuth0Context({ status: 'loading' })
    expect(runGuard(requireAuth(), ctx)).toBeUndefined()
  })

  it('fails closed (redirects) when auth is unresolved', () => {
    const ctx = createMockAuth0Context({ status: 'unresolved' })
    expect(runGuard(requireAuth(), ctx)).toBeDefined()
  })

  it('forwards authorizationParams to the login route (step-up)', () => {
    const ctx = createMockAuth0Context()
    const thrown = runGuard(
      requireAuth({ authorizationParams: { acr_values: 'urn:mfa' } }),
      ctx,
    ) as { options?: { href?: string } }
    expect(thrown.options?.href).toBe('/auth/login?acr_values=urn%3Amfa')
  })

  it('forwards returnTo before authorizationParams', () => {
    const ctx = createMockAuth0Context()
    const thrown = runGuard(
      requireAuth({
        returnTo: '/dashboard',
        authorizationParams: { acr_values: 'urn:mfa' },
      }),
      ctx,
    ) as { options?: { href?: string } }
    expect(thrown.options?.href).toBe(
      '/auth/login?returnTo=%2Fdashboard&acr_values=urn%3Amfa',
    )
  })
})

describe('requireOrg', () => {
  it('passes when the org_id matches', () => {
    const ctx = createMockAuth0Context({ user: { sub: 'x', org_id: 'org_1' } })
    expect(runGuard(requireOrg('org_1'), ctx)).toBeUndefined()
  })

  it('redirects on org mismatch', () => {
    const ctx = createMockAuth0Context({ user: { sub: 'x', org_id: 'org_2' } })
    expect(runGuard(requireOrg('org_1'), ctx)).toBeDefined()
  })

  it('matches org_id only, not org_name (consistent with the server)', () => {
    // A user whose org_name is the slug but whose org_id differs must NOT pass,
    // so the client guard and the server middleware agree.
    const ctx = createMockAuth0Context({
      user: { sub: 'x', org_id: 'org_123', org_name: 'acme' },
    })
    expect(runGuard(requireOrg('acme'), ctx)).toBeDefined()
    expect(runGuard(requireOrg('org_123'), ctx)).toBeUndefined()
  })

  it('forwards returnTo and authorizationParams alongside the organization', () => {
    const ctx = createMockAuth0Context({ user: { sub: 'x', org_id: 'org_2' } })
    const thrown = runGuard(
      requireOrg('org_1', { returnTo: '/team', authorizationParams: { prompt: 'login' } }),
      ctx,
    ) as { options?: { href?: string } }
    expect(thrown.options?.href).toBe(
      '/auth/login?returnTo=%2Fteam&prompt=login&organization=org_1',
    )
  })

  it('lets the guard organization win over one passed in authorizationParams', () => {
    const ctx = createMockAuth0Context({ user: { sub: 'x', org_id: 'org_2' } })
    const thrown = runGuard(
      requireOrg('org_1', { authorizationParams: { organization: 'org_evil' } }),
      ctx,
    ) as { options?: { href?: string } }
    expect(thrown.options?.href).toBe('/auth/login?organization=org_1')
  })
})
