import { InvalidConfigurationError } from '../errors/index.js'
import type {
  Auth0ServerOptions,
  AppBaseUrl,
  DomainResolver,
  SessionCookieOptions,
} from '../types/index.js'

/**
 * Cache key the foundation (`@auth0/auth0-server-js`) uses for a token set when
 * no audience is configured. It keys `tokenSets` by audience and falls back to
 * this string for an unset audience. We match on it when selecting a token set
 * and when enforcing scopes; if the foundation ever changes this key, update it
 * here in one place.
 */
export const DEFAULT_AUDIENCE_KEY = 'default'

/**
 * Warns (in production only) when the session cookie is configured in a way
 * that weakens its protection. Auth0 defaults `secure` from the app's URL
 * protocol, so this only fires when a developer overrides it. We warn rather
 * than throw, because TLS-terminating proxies can legitimately make the app
 * see `http` while the browser connection is `https`.
 */
function warnOnInsecureCookie(cookie: SessionCookieOptions | undefined): void {
  if (!cookie || process.env.NODE_ENV !== 'production') return
  if (cookie.secure === false) {
    console.warn(
      '[auth0] Session cookie `secure` is set to false in production. The ' +
        'session cookie will be sent over unencrypted connections.',
    )
  }
  if (cookie.sameSite === 'none' && cookie.secure !== true) {
    console.warn(
      "[auth0] Session cookie `sameSite` is 'none' without `secure: true` in " +
        'production. Browsers reject such cookies, and it weakens CSRF protection.',
    )
  }
}

/**
 * Resolved, validated configuration used to construct the server client.
 * Every field here is guaranteed present (unlike the user-facing
 * {@link Auth0ServerOptions}, where everything is optional).
 */
export interface ResolvedConfig extends Auth0ServerOptions {
  domain: string | DomainResolver
  clientId: string
  clientSecret: string
  secret: string | string[]
  /**
   * The configured app base URL, or `undefined` in resolver mode where it is
   * inferred per request. Use {@link resolveAppBaseUrl} to get a concrete URL.
   */
  appBaseUrl: AppBaseUrl | undefined
}

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]
    if (value) return value
  }
  return undefined
}

/**
 * Merges explicit options with environment variables (explicit wins), then
 * validates that the required fields are present. Throws
 * {@link InvalidConfigurationError} with an actionable message if not.
 *
 * Recognised env vars: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
 * `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`, `AUTH0_AUDIENCE`.
 */
export function getConfig(options: Auth0ServerOptions = {}): ResolvedConfig {
  const domain = options.domain ?? envFirst('AUTH0_DOMAIN')
  const clientId = options.clientId ?? envFirst('AUTH0_CLIENT_ID')
  const clientSecret = options.clientSecret ?? envFirst('AUTH0_CLIENT_SECRET')
  const secret = options.secret ?? envFirst('AUTH0_SECRET')
  const appBaseUrl = options.appBaseUrl ?? envFirst('APP_BASE_URL')
  const audience = options.audience ?? envFirst('AUTH0_AUDIENCE')

  // A function `domain` is a per-request resolver (Multiple Custom Domains). In
  // that mode `appBaseUrl` is optional: it is inferred from the request host.
  // With a static string domain, `appBaseUrl` is still required.
  const usesDomainResolver = typeof domain === 'function'

  // `secret` may be a single string or an array of strings. An array enables
  // zero-downtime key rotation: the first entry encrypts new sessions, and every
  // entry can decrypt existing ones. An empty array counts as missing.
  const hasSecret = Array.isArray(secret) ? secret.length > 0 : Boolean(secret)

  const missing: string[] = []
  if (!domain) missing.push('domain (AUTH0_DOMAIN)')
  if (!clientId) missing.push('clientId (AUTH0_CLIENT_ID)')
  if (!clientSecret) missing.push('clientSecret (AUTH0_CLIENT_SECRET)')
  if (!hasSecret) missing.push('secret (AUTH0_SECRET)')
  if (!appBaseUrl && !usesDomainResolver) missing.push('appBaseUrl (APP_BASE_URL)')

  if (missing.length > 0) {
    throw new InvalidConfigurationError(
      `Auth0 configuration is incomplete. Missing: ${missing.join(', ')}. ` +
        `Provide these via auth0Server({ ... }) or environment variables.`,
    )
  }

  // Every secret (each rotation key) must meet the minimum length.
  const secrets = Array.isArray(secret) ? secret : [secret!]
  if (secrets.some((s) => Buffer.byteLength(s, 'utf8') < 32)) {
    throw new InvalidConfigurationError(
      'Auth0 `secret` must be at least 32 bytes. Generate one with `openssl rand -hex 32`.',
    )
  }

  warnOnInsecureCookie(options.sessionConfiguration?.cookie)

  return {
    ...options,
    domain: domain!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    secret: secret!,
    appBaseUrl: appBaseUrl,
    audience,
  }
}

/**
 * Infers the application base URL from the incoming request.
 *
 * Reads the host from `X-Forwarded-Host` (falling back to `Host`) and the
 * protocol from `X-Forwarded-Proto` (falling back to the request URL's
 * protocol), then builds `${protocol}://${host}`.
 *
 * Security: the host and forwarded headers are trusted as-is. This is only used
 * in Multiple Custom Domains mode (a {@link DomainResolver} is configured), and
 * that mode requires a trusted reverse proxy that sets these headers and blocks
 * client-supplied values. See the "Multiple Custom Domains" section in
 * EXAMPLES.md.
 */
export function inferAppBaseUrlFromRequest(request: Request): string {
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) {
    throw new InvalidConfigurationError(
      'Unable to infer appBaseUrl: the request has no Host header. In Multiple ' +
        'Custom Domains mode, ensure your reverse proxy forwards the host.',
    )
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')
  // `X-Forwarded-Proto` can be a comma-separated list from chained proxies; the
  // first entry is the client-facing protocol.
  const protocol =
    forwardedProto?.split(',')[0]?.trim() ||
    new URL(request.url).protocol.replace(/:$/, '')

  return `${protocol}://${host}`
}

/**
 * Resolves the application base URL for a given request.
 *
 * - string: used as-is.
 * - string[]: an allow-list; the request's origin must match one entry
 *   (supports staging/preview deployments). Throws if no entry matches.
 * - undefined: Multiple Custom Domains mode; inferred from the request host via
 *   {@link inferAppBaseUrlFromRequest}. Throws if no request is available.
 */
export function resolveAppBaseUrl(
  appBaseUrl: AppBaseUrl | undefined,
  request?: Request,
): string {
  if (appBaseUrl === undefined) {
    if (!request) {
      throw new InvalidConfigurationError(
        'Cannot resolve appBaseUrl without a request. In Multiple Custom ' +
          'Domains mode, appBaseUrl is inferred per request.',
      )
    }
    return inferAppBaseUrlFromRequest(request)
  }

  if (typeof appBaseUrl === 'string') return appBaseUrl

  if (!request) {
    // No request to match against — fall back to the first allowed origin.
    const first = appBaseUrl[0]
    if (!first) {
      throw new InvalidConfigurationError('appBaseUrl allow-list is empty.')
    }
    return first
  }

  const requestOrigin = new URL(request.url).origin
  const match = appBaseUrl.find((url) => new URL(url).origin === requestOrigin)
  if (!match) {
    throw new InvalidConfigurationError(
      `Request origin "${requestOrigin}" is not in the appBaseUrl allow-list.`,
    )
  }
  return match
}

/**
 * Validates a redirect target against a trusted base URL, returning the
 * redirect only if it resolves to the same origin. Prevents open-redirect
 * attacks on `returnTo`. Returns `undefined` if unsafe.
 */
export function toSafeRedirect(
  dangerousRedirect: string,
  safeBaseUrl: string,
): string | undefined {
  let url: URL
  try {
    url = new URL(dangerousRedirect, safeBaseUrl)
  } catch {
    return undefined
  }
  if (url.origin !== new URL(safeBaseUrl).origin) return undefined
  return url.toString()
}

/**
 * Builds the `appState` for a redirect-based flow (login, account linking,
 * organization switch/invitation), validating `returnTo` against the app's own
 * origin before it is stored.
 *
 * `returnTo` is usually attacker-influenceable (it comes from a query param), so
 * an unchecked value would be an open redirect once a callback redirects to it.
 * Validating here, at the point the value enters `appState`, keeps every flow
 * safe regardless of how the callback is wired, and matches how the login flow
 * and the other Auth0 SDKs sanitize `returnTo`. When `returnTo` is unsafe or
 * absent, no `returnTo` is stored and the caller falls back to a safe default.
 */
export function toSafeAppState(
  appBaseUrl: AppBaseUrl | undefined,
  returnTo?: string,
  request?: Request,
): { returnTo: string } | undefined {
  if (!returnTo) return undefined
  const base = resolveAppBaseUrl(appBaseUrl, request)
  const safeReturnTo = toSafeRedirect(returnTo, base)
  return safeReturnTo ? { returnTo: safeReturnTo } : undefined
}

/**
 * True when the callback `redirect_uri` must be computed per request rather than
 * baked into the client at construction. This is the case with a
 * {@link DomainResolver} (Multiple Custom Domains) or a non-string `appBaseUrl`
 * (an allow-list, or inferred). In these modes the interactive-login flows
 * resolve the base URL from the request and pass `redirect_uri` explicitly; with
 * a single static string `appBaseUrl` the client already carries the value.
 */
export function usesPerRequestRedirectUri(config: {
  domain: string | DomainResolver
  appBaseUrl: AppBaseUrl | undefined
}): boolean {
  return typeof config.domain === 'function' || typeof config.appBaseUrl !== 'string'
}
