// Narrow entry (not the @tanstack/react-start/server barrel) so the SSR render
// handlers are never pulled into a client-reachable graph. See cookie-handler.ts.
import { getRequest, getResponseHeaders } from '@tanstack/start-server-core'
import type { Auth0Instance } from './auth0-server.js'
import {
  resolveAppBaseUrl,
  toSafeRedirect,
  usesPerRequestRedirectUri,
} from './config.js'
import { CallbackError } from '../errors/index.js'

/**
 * Builds a 302 redirect Response that preserves any `Set-Cookie` headers the
 * underlying client staged on the ambient response (login transaction cookie,
 * session cookie, cleared cookies). Returning a fresh Response must not drop
 * those, so we copy them across explicitly.
 */
function redirect(location: string): Response {
  const headers = new Headers({ Location: location })
  const ambient = getResponseHeaders() as unknown as Headers
  // getResponseHeaders returns a Headers-like; copy Set-Cookie entries.
  const setCookie = (ambient as Headers).getSetCookie?.() ?? []
  for (const cookie of setCookie) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 302, headers })
}

interface AppState {
  returnTo?: string
}

// Applied to responses that carry the user profile so shared caches (browsers,
// CDNs, proxies) never store PII. Mirrors the header set nextjs-auth0 writes on
// its own profile response.
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const

/**
 * True when the foundation refused a back-channel logout because the session
 * store is stateless. The foundation throws a plain Error with this message
 * (see `StatelessStateStore.deleteByLogoutToken`), so we match on it.
 */
function isStatelessStoreError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Backchannel logout is not available')
  )
}

// Object.prototype names plus commonly abused prototype-pollution keys, blocked
// from user-supplied authorization params.
const DENIED_PARAM_KEYS = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  '__proto__',
  'constructor',
  'prototype',
])

// OAuth/OIDC protocol parameters the SDK controls; never overridable by the
// caller through query params.
const RESERVED_OAUTH_PARAMS = new Set([
  'response_type',
  'state',
  'code_challenge',
  'code_challenge_method',
  'client_id',
  'redirect_uri',
  'nonce',
  'scope',
  'audience',
])

/**
 * Collects the login query string into a safe `authorizationParams` object.
 * Drops `returnTo` (handled separately), reserved OAuth params, and
 * prototype-pollution keys, so a caller can pass through `screen_hint`,
 * `connection`, `login_hint`, `prompt`, etc. Mirrors the filter `auth0-express`
 * applies to its login query.
 */
function authorizationParamsFromQuery(
  params: URLSearchParams,
): Record<string, string> | undefined {
  const filtered: Record<string, string> = Object.create(null)
  for (const [key, value] of params.entries()) {
    if (
      key === 'returnTo' ||
      DENIED_PARAM_KEYS.has(key) ||
      RESERVED_OAUTH_PARAMS.has(key)
    ) {
      continue
    }
    filtered[key] = value
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined
}

/**
 * The auth endpoint paths this SDK serves, relative to the configured base.
 */
function resolvePaths(auth0: Auth0Instance) {
  const base = auth0.config.routes?.base ?? '/auth'
  return {
    login: auth0.config.routes?.login ?? `${base}/login`,
    callback: auth0.config.routes?.callback ?? `${base}/callback`,
    logout: auth0.config.routes?.logout ?? `${base}/logout`,
    profile: auth0.config.routes?.profile ?? `${base}/profile`,
    backchannelLogout:
      auth0.config.routes?.backchannelLogout ?? `${base}/backchannel-logout`,
  }
}

/**
 * Builds the callback `redirect_uri` for a resolved app base URL. Passed
 * explicitly on every interactive flow so login works when the client has no
 * baked-in `redirect_uri`: Multiple Custom Domains mode (a domain resolver) and
 * the `appBaseUrl` allow-list both resolve the base URL per request.
 */
function redirectUriFor(auth0: Auth0Instance, appBaseUrl: string): string {
  return new URL(resolvePaths(auth0).callback, appBaseUrl).toString()
}

/**
 * Handles `GET <base>/login`. Starts the interactive (authorization-code) login
 * and redirects the browser to Auth0. A `returnTo` query param (validated to be
 * same-origin) is stored in `appState` so the callback can send the user back.
 */
export async function handleLogin(auth0: Auth0Instance): Promise<Response> {
  const request = getRequest()
  const url = new URL(request.url)
  const appBaseUrl = resolveAppBaseUrl(auth0.config.appBaseUrl, request)

  const rawReturnTo = url.searchParams.get('returnTo') ?? '/'
  const returnTo = toSafeRedirect(rawReturnTo, appBaseUrl) ?? appBaseUrl

  const authorizationParams = authorizationParamsFromQuery(url.searchParams)

  // In Multiple Custom Domains mode (a domain resolver) or with a non-string
  // `appBaseUrl` (allow-list / inferred), the client has no baked-in
  // `redirect_uri` because the correct one depends on the request, so supply it
  // here. With a single static `appBaseUrl` the client already carries it.
  const perRequestRedirectUri = usesPerRequestRedirectUri(auth0.config)
    ? { redirect_uri: redirectUriFor(auth0, appBaseUrl) }
    : undefined

  const mergedAuthParams =
    authorizationParams || perRequestRedirectUri
      ? { ...authorizationParams, ...perRequestRedirectUri }
      : undefined

  const authorizationUrl = await auth0.client.startInteractiveLogin({
    appState: { returnTo } satisfies AppState,
    ...(mergedAuthParams ? { authorizationParams: mergedAuthParams } : {}),
  })
  return redirect(authorizationUrl.toString())
}

/**
 * Handles `GET <base>/callback`. Completes the login (exchanges the code,
 * writes the session cookie) and redirects to the stored `returnTo`.
 */
export async function handleCallback(auth0: Auth0Instance): Promise<Response> {
  const request = getRequest()
  const url = new URL(request.url)
  const appBaseUrl = resolveAppBaseUrl(auth0.config.appBaseUrl, request)

  // Auth0 signals a failed authorization by redirecting back with `error` /
  // `error_description` query params (e.g. an invalid `organization`, a rejected
  // consent, or a misconfigured client). The foundation's
  // `completeInteractiveLogin` throws a bare `HTTPError` for these, which the
  // framework surfaces as an unhandled 500. Detect the error response up front
  // and raise a `CallbackError` so it flows through the SDK's error handling.
  const authError = url.searchParams.get('error')
  if (authError) {
    throw new CallbackError(
      url.searchParams.get('error_description') ?? authError,
    )
  }

  try {
    const { appState } = await auth0.client.completeInteractiveLogin<AppState>(
      url,
    )
    const returnTo =
      (appState?.returnTo && toSafeRedirect(appState.returnTo, appBaseUrl)) ||
      appBaseUrl
    return redirect(returnTo)
  } catch (error) {
    throw new CallbackError(
      error instanceof Error ? error.message : 'Login callback failed.',
      { cause: error },
    )
  }
}

/**
 * Handles `GET <base>/logout`. Clears the local session and redirects to Auth0's
 * logout endpoint, which returns the user to a post-logout destination. A
 * `returnTo` query param is honored when it is same-origin (validated with
 * `toSafeRedirect`); otherwise the app's base URL is used. The chosen value
 * must also be registered as an Allowed Logout URL in the Auth0 Dashboard.
 */
export async function handleLogout(auth0: Auth0Instance): Promise<Response> {
  const request = getRequest()
  const url = new URL(request.url)
  const appBaseUrl = resolveAppBaseUrl(auth0.config.appBaseUrl, request)

  const rawReturnTo = url.searchParams.get('returnTo')
  const returnTo = rawReturnTo
    ? (toSafeRedirect(rawReturnTo, appBaseUrl) ?? appBaseUrl)
    : appBaseUrl

  const logoutUrl = await auth0.client.logout({ returnTo })
  return redirect(logoutUrl.toString())
}

/**
 * Handles `GET <base>/profile`. Returns the current user as JSON, or 204 when
 * there is no session. The response carries PII, so it is marked no-store to
 * keep it out of any shared cache.
 */
export async function handleProfile(auth0: Auth0Instance): Promise<Response> {
  const user = await auth0.client.getUser()
  if (!user) return new Response(null, { status: 204, headers: NO_STORE_HEADERS })
  return Response.json(user, { headers: NO_STORE_HEADERS })
}

/**
 * Handles `POST <base>/backchannel-logout`. Receives Auth0's backchannel logout
 * webhook and deletes the matching session.
 */
export async function handleBackchannelLogout(
  auth0: Auth0Instance,
): Promise<Response> {
  const request = getRequest()
  const body = await request.formData().catch(() => null)
  const logoutToken = body?.get('logout_token')
  if (typeof logoutToken !== 'string' || !logoutToken) {
    return Response.json(
      { error: 'missing logout_token' },
      { status: 400 },
    )
  }
  try {
    await auth0.client.handleBackchannelLogout(logoutToken)
    return new Response(null, { status: 204 })
  } catch (error) {
    // Back-channel logout only works with a stateful session store. In the
    // default (stateless) config the foundation throws because it cannot delete
    // a session by logout token. Surface that as a clear configuration error
    // rather than a generic "invalid token", which would be misleading.
    if (isStatelessStoreError(error)) {
      return Response.json(
        {
          error: 'backchannel_logout_unsupported',
          message:
            'Back-channel logout requires a stateful session store. Pass a `sessionStore` to auth0Server() to enable it.',
        },
        { status: 501 },
      )
    }
    // Otherwise the token itself is bad. It is attacker-influenced input, so
    // return a generic error without echoing the underlying message.
    return Response.json({ error: 'invalid logout_token' }, { status: 400 })
  }
}

/**
 * Returns `{ GET, POST }` handlers for the catch-all auth route
 * (`src/routes/auth/$.ts`). Dispatches by pathname to the individual
 * handlers above.
 *
 * @example
 * ```ts
 * // src/routes/auth/$.ts
 * import { createFileRoute } from '@tanstack/react-router'
 * import { auth0 } from '~/auth.server'
 * const { GET, POST } = auth0Handlers(auth0)
 * export const Route = createFileRoute('/auth/$')({ server: { handlers: { GET, POST } } })
 * ```
 */
export function auth0Handlers(auth0: Auth0Instance): {
  GET: () => Promise<Response>
  POST: () => Promise<Response>
} {
  const paths = resolvePaths(auth0)

  return {
    GET: async () => {
      const pathname = new URL(getRequest().url).pathname
      switch (pathname) {
        case paths.login:
          return handleLogin(auth0)
        case paths.callback:
          return handleCallback(auth0)
        case paths.logout:
          return handleLogout(auth0)
        case paths.profile:
          return handleProfile(auth0)
        default:
          return new Response(null, { status: 404 })
      }
    },
    POST: async () => {
      const pathname = new URL(getRequest().url).pathname
      if (pathname === paths.backchannelLogout) {
        return handleBackchannelLogout(auth0)
      }
      return new Response(null, { status: 404 })
    },
  }
}
