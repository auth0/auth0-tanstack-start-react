import {
  ServerClient,
  CookieTransactionStore,
  StatefulStateStore,
  StatelessStateStore,
  type StateStore,
  type DomainResolver as FoundationDomainResolver,
} from '@auth0/auth0-server-js'
import { getRequest } from '@tanstack/start-server-core'
import { TanStackStartCookieHandler } from './cookie-handler.js'
import { getConfig, type ResolvedConfig } from './config.js'
import type { Auth0ServerOptions } from '../types/index.js'

/**
 * A pluggable session store backend. When supplied to {@link auth0Server},
 * the SDK switches from stateless (encrypted-cookie) sessions to stateful
 * sessions, keeping only an encrypted session id in the cookie and the session
 * body in this store (Redis, a database, etc.).
 *
 * Mirrors the `SessionStore` contract `@auth0/auth0-server-js` expects, with
 * `void` store options (TanStack Start resolves the request implicitly).
 */
export type SessionStore = ConstructorParameters<
  typeof StatefulStateStore<void>
>[0]['store']

/**
 * Extra options accepted by {@link auth0Server} beyond {@link Auth0ServerOptions}.
 */
export interface Auth0ServerExtraOptions {
  /**
   * Optional custom session store. When provided, sessions are stateful
   * (session id in the cookie, body in the store). When omitted, sessions are
   * stateless (the whole encrypted session lives in the cookie).
   */
  sessionStore?: SessionStore
}

/**
 * The configured Auth0 server instance. Every server-side helper
 * (middleware, session functions, token utilities, route handlers) takes this
 * instance. Created once, typically in `src/auth.server.ts`, and exported.
 */
export interface Auth0Instance {
  /** The underlying `@auth0/auth0-server-js` client. */
  readonly client: ServerClient<void>
  /** The resolved, validated configuration. */
  readonly config: ResolvedConfig
}

/**
 * Creates the Auth0 server instance for a TanStack Start (server-rendered) app.
 *
 * Wraps `@auth0/auth0-server-js`'s `ServerClient`, wiring in a TanStack Start
 * cookie handler plus a cookie transaction store and either a stateless or
 * stateful state store. Configuration is read from the passed options first,
 * then from environment variables.
 *
 * @example
 * ```ts
 * // src/auth.server.ts
 * import { auth0Server } from '@auth0/auth0-tanstack-start-react/server'
 * export const auth0 = auth0Server() // reads AUTH0_* from the environment
 * ```
 */
export function auth0Server(
  options: Auth0ServerOptions & Auth0ServerExtraOptions = {},
): Auth0Instance {
  const config = getConfig(options)
  const cookieHandler = new TanStackStartCookieHandler()

  const transactionStore = new CookieTransactionStore<void>(
    { secret: config.secret },
    cookieHandler,
  )

  // `sessionConfiguration` is the foundation's own SessionConfiguration, so its
  // fields (rolling, absoluteDuration, inactivityDuration, cookie) are consumed
  // directly by the store.
  const stateStore: StateStore<void> = options.sessionStore
    ? new StatefulStateStore<void>(
        {
          ...config.sessionConfiguration,
          secret: config.secret,
          store: options.sessionStore,
        },
        cookieHandler,
      )
    : new StatelessStateStore<void>(
        {
          ...config.sessionConfiguration,
          secret: config.secret,
        },
        cookieHandler,
      )

  // In Multiple Custom Domains mode, `config.domain` is a request-first resolver.
  // The foundation calls its resolver with the store options (here `void`), so
  // we adapt by reading the ambient request via `getRequest()` and handing it to
  // the developer's resolver. This is the same ambient-request model the cookie
  // handler already relies on, so no store options need threading through calls.
  const domain: string | FoundationDomainResolver<void> =
    typeof config.domain === 'function'
      ? () => (config.domain as (request: Request) => string | Promise<string>)(getRequest())
      : config.domain

  // Only bake a fixed `redirect_uri` into the client when the app base URL is a
  // single static string. With an allow-list or a domain resolver, the correct
  // `redirect_uri` depends on the request, so the auth route handlers supply it
  // per request instead.
  const callbackPath = config.routes?.callback ?? '/auth/callback'
  const staticAppBaseUrl =
    typeof config.appBaseUrl === 'string' ? config.appBaseUrl : undefined
  const redirectUri = staticAppBaseUrl
    ? new URL(callbackPath, staticAppBaseUrl).toString()
    : undefined

  const client = new ServerClient<void>({
    domain,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationParams: {
      audience: config.audience,
      ...config.authorizationParams,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    },
    transactionStore,
    stateStore,
    stateIdentifier: config.sessionConfiguration?.cookie?.name,
  })

  return { client, config }
}
