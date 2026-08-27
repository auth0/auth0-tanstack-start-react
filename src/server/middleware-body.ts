import { auth0Server, type Auth0Instance } from './auth0-server.js'
import { resolveRoutePaths } from './config.js'
import { auth0Handlers } from './handlers.js'
import { toAuth0RouterContext } from './session-mapper.js'
import type { Auth0ServerOptions } from '../types/index.js'

/**
 * Server-only body for {@link auth0Middleware}.
 *
 * This module statically imports the heavy server-only graph (handlers, session
 * mapping, the foundational server client). It is loaded EXCLUSIVELY via a
 * dynamic `import()` from inside the middleware's `.server()` handler — never at
 * module top-level — so it is never pulled into the client bundle. (This is the
 * standard way to satisfy TanStack Start's import-protection for server-only code.)
 */

// Cache the instance so it is constructed once per server process, not per
// request. `auth0Middleware(options)` is called once at startup, so the options
// object is a stable reference for the whole process; we key on that identity
// with a WeakMap. Keying on `JSON.stringify(options)` would be wrong: it drops
// function values, so a `domain` set to a `DomainResolver` serializes to the
// same key as no config, collapsing different resolver configs onto one
// instance and using the wrong Auth0 domain (SDK-10662).
const instanceByOptions = new WeakMap<Auth0ServerOptions, Auth0Instance>()
// Separate slot for the common `auth0Middleware()` (no options) call, which has
// no object to key a WeakMap on.
let defaultInstance: Auth0Instance | undefined

function resolveInstance(options?: Auth0ServerOptions): Auth0Instance {
  if (!options) {
    return (defaultInstance ??= auth0Server())
  }
  let instance = instanceByOptions.get(options)
  if (!instance) {
    instance = auth0Server(options)
    instanceByOptions.set(options, instance)
  }
  return instance
}

export interface MiddlewareBodyArgs {
  request: Request
  pathname: string
  next: (opts: {
    context: { auth0: ReturnType<typeof toAuth0RouterContext> }
  }) => unknown
}

/**
 * The actual request-middleware logic:
 * - paths under the auth base (`/auth/*`) → handled directly (OIDC endpoints)
 * - all other paths → read/decrypt the session and attach `context.auth0`
 *
 * Returns either the result of `args.next(...)` or a `Response`; the caller
 * (the `.server()` handler in middleware.ts) maps the type at its boundary.
 */
export async function middlewareBody(
  args: Pick<MiddlewareBodyArgs, 'request' | 'pathname'> & {
    next: MiddlewareBodyArgs['next']
  },
  options?: Auth0ServerOptions,
): Promise<unknown> {
  const auth0 = resolveInstance(options)
  const base = resolveRoutePaths(auth0.config).base

  // Match the base exactly or a path segment under it, so sibling routes like
  // `/authors` or `/authentication` are not mistaken for `/auth` endpoints.
  if (args.pathname === base || args.pathname.startsWith(`${base}/`)) {
    const handlers = auth0Handlers(auth0)
    const method = args.request.method.toUpperCase()
    return method === 'POST' ? handlers.POST() : handlers.GET()
  }

  const session = await auth0.client.getSession()
  return args.next({
    context: { auth0: toAuth0RouterContext(session, auth0.config.excludedClaims) },
  })
}
