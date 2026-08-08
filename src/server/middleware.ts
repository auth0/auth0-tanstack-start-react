import { createMiddleware } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import type { Auth0Instance } from './auth0-server.js'
import { toAuth0RouterContext } from './session-mapper.js'
import { DEFAULT_AUDIENCE_KEY } from './config.js'
import { UnauthorizedError, ForbiddenError } from '../errors/index.js'
import type { Auth0RouterContext } from '../types/index.js'

/**
 * Reads the current session from the client and shapes it into the
 * {@link Auth0RouterContext} that the rest of the SDK (and the router) consume.
 */
async function readAuthContext(auth0: Auth0Instance): Promise<Auth0RouterContext> {
  const session = await auth0.client.getSession()
  return toAuth0RouterContext(session, auth0.config.excludedClaims)
}

function authBasePath(auth0: Auth0Instance): string {
  return auth0.config.routes?.base ?? '/auth'
}

/**
 * Function middleware that attaches `context.auth0` to server functions.
 * Never blocks — `context.auth0.user` may be `undefined`.
 */
export function auth0FunctionMiddleware(auth0: Auth0Instance) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const auth0Context = await readAuthContext(auth0)
    return next({ context: { auth0: auth0Context } })
  })
}

/**
 * Function middleware that blocks unauthenticated requests by redirecting to
 * the login route. Use for server functions that drive navigation.
 */
export function requireAuthMiddleware(auth0: Auth0Instance) {
  const loginPath = auth0.config.routes?.login ?? `${authBasePath(auth0)}/login`
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const auth0Context = await readAuthContext(auth0)
    if (!auth0Context.isAuthenticated) {
      throw redirect({ href: loginPath, reloadDocument: true })
    }
    return next({ context: { auth0: auth0Context } })
  })
}

/**
 * Function middleware that requires the session's organization to match `orgId`.
 */
export function requireOrgMiddleware(auth0: Auth0Instance, orgId: string) {
  const loginPath = auth0.config.routes?.login ?? `${authBasePath(auth0)}/login`
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const auth0Context = await readAuthContext(auth0)
    if (!auth0Context.isAuthenticated) {
      throw redirect({ href: `${loginPath}?organization=${orgId}`, reloadDocument: true })
    }
    if (auth0Context.user?.org_id !== orgId) {
      throw redirect({ href: `${loginPath}?organization=${orgId}`, reloadDocument: true })
    }
    return next({ context: { auth0: auth0Context } })
  })
}

// --- JSON API middleware (throw HTTP-style errors instead of redirecting) ---

/**
 * Throws {@link UnauthorizedError} (HTTP 401 semantics) when there is no valid
 * session. For JSON API server functions.
 */
export function withApiAuth(auth0: Auth0Instance) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const auth0Context = await readAuthContext(auth0)
    if (!auth0Context.isAuthenticated) throw new UnauthorizedError()
    return next({ context: { auth0: auth0Context } })
  })
}

/**
 * Throws {@link ForbiddenError} when the access token is missing any of the
 * required `scopes`. Chains auth internally.
 */
export function withApiScopes(auth0: Auth0Instance, scopes: string[]) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    // Read the granted scope from the server-side session, not the router
    // context (which carries no token/scope data). This is server middleware,
    // so direct session access is fine.
    const session = await auth0.client.getSession()
    if (!session?.user) throw new UnauthorizedError()
    // Read the scope from the token set for the configured audience, not an
    // arbitrary tokenSets[0], so multi-audience apps enforce the right token.
    const audience = auth0.config.audience ?? DEFAULT_AUDIENCE_KEY
    const tokenSet = session.tokenSets.find((set) => set.audience === audience)
    const granted = (tokenSet?.scope ?? '').split(' ')
    const missing = scopes.filter((s) => !granted.includes(s))
    if (missing.length > 0) {
      throw new ForbiddenError(`Missing required scope(s): ${missing.join(', ')}`)
    }
    return next({
      context: { auth0: toAuth0RouterContext(session, auth0.config.excludedClaims) },
    })
  })
}

/**
 * Throws {@link ForbiddenError} when the session's `org_id` does not match.
 */
export function withApiOrg(auth0: Auth0Instance, orgId: string) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const auth0Context = await readAuthContext(auth0)
    if (!auth0Context.isAuthenticated) throw new UnauthorizedError()
    if (auth0Context.user?.org_id !== orgId) {
      throw new ForbiddenError(`Organization mismatch.`)
    }
    return next({ context: { auth0: auth0Context } })
  })
}

/**
 * Throws {@link ForbiddenError} when the user's `claim` does not exactly equal `value`.
 */
export function withApiClaimEquals(
  auth0: Auth0Instance,
  claim: string,
  value: unknown,
) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const auth0Context = await readAuthContext(auth0)
    if (!auth0Context.isAuthenticated) throw new UnauthorizedError()
    if (auth0Context.user?.[claim] !== value) {
      throw new ForbiddenError(`Claim "${claim}" does not match the required value.`)
    }
    return next({ context: { auth0: auth0Context } })
  })
}

/**
 * Throws {@link ForbiddenError} when the user's array `claim` includes none of `values`.
 */
export function withApiClaimIncludes(
  auth0: Auth0Instance,
  claim: string,
  ...values: string[]
) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const auth0Context = await readAuthContext(auth0)
    if (!auth0Context.isAuthenticated) throw new UnauthorizedError()
    const actual = auth0Context.user?.[claim]
    const arr = Array.isArray(actual) ? actual : []
    if (!values.some((v) => arr.includes(v))) {
      throw new ForbiddenError(`Claim "${claim}" does not include a required value.`)
    }
    return next({ context: { auth0: auth0Context } })
  })
}
