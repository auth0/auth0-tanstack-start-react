import { InvalidConfigurationError } from '../errors/index.js'
import type {
  Auth0ServerOptions,
  AppBaseUrl,
  DomainResolver,
  RoutesConfig,
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
 * Internal OIDC claims stripped from the user object before it is serialized
 * into the SSR HTML (via the router context). These carry no display value and
 * would otherwise expose the Auth0 client ID (`aud`) and session ID (`sid`) in
 * the page source. Overridable per app via `excludedClaims`.
 */
export const DEFAULT_EXCLUDED_CLAIMS = ['iss', 'aud', 'iat', 'exp', 'sid']

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
 * Warns when a {@link DomainResolver} is configured but the forwarded headers are
 * not trusted. In that mode the app has no configured base URL, so every request
 * URL is derived from the request host. Behind a TLS-terminating proxy the app
 * sees `http` and an internal hostname, which produces a `redirect_uri` Auth0
 * rejects. Only warns when `trustProxy` was left at its default, so a developer
 * who deliberately turns it off is not nagged.
 */
function warnOnUntrustedProxyWithResolver(
  usesDomainResolver: boolean,
  trustProxyWasSetExplicitly: boolean,
): void {
  if (!usesDomainResolver || trustProxyWasSetExplicitly) return
  console.warn(
    '[auth0] A `domain` resolver is configured (Multiple Custom Domains), so ' +
      'the app base URL is derived from each request. `trustProxy` is disabled, ' +
      'so the X-Forwarded-Host and X-Forwarded-Proto headers are ignored. If ' +
      'this app runs behind a reverse proxy or load balancer, set ' +
      '`trustProxy: true` (or AUTH0_TRUST_PROXY=true). Pass `trustProxy: false` ' +
      'explicitly to silence this warning.',
  )
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
  /** Whether `X-Forwarded-Host` / `X-Forwarded-Proto` are trusted. */
  trustProxy: boolean
  /** Claims stripped from the user object before it reaches the client HTML. */
  excludedClaims: string[]
}

/**
 * The subset of the resolved config needed to turn a request into a concrete app
 * base URL. Accepting this shape (rather than the whole {@link ResolvedConfig})
 * keeps {@link resolveAppBaseUrl} and {@link toSafeAppState} easy to call from
 * tests, while still guaranteeing that `trustProxy` travels with `appBaseUrl`.
 */
export interface AppBaseUrlConfig {
  appBaseUrl: AppBaseUrl | undefined
  trustProxy?: boolean
}

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]
    if (value) return value
  }
  return undefined
}

const TRUTHY_ENV_VALUES = new Set(['true', '1', 'yes', 'on'])
const FALSY_ENV_VALUES = new Set(['false', '0', 'no', 'off'])

/**
 * Reads a boolean environment variable, returning `undefined` when it is unset so
 * the caller can fall back to its own default.
 *
 * An unrecognised value throws rather than being ignored: silently treating
 * `AUTH0_TRUST_PROXY=TRUE_PLEASE` as "off" would leave a proxied app broken with
 * nothing to point at.
 */
function envBool(key: string): boolean | undefined {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return undefined
  const value = raw.trim().toLowerCase()
  if (TRUTHY_ENV_VALUES.has(value)) return true
  if (FALSY_ENV_VALUES.has(value)) return false
  throw new InvalidConfigurationError(
    `${key} must be one of true, false, 1, 0, yes, no, on, off. Received "${raw}".`,
  )
}

/**
 * Validates every configured app base URL, so a typo surfaces at startup with a
 * clear message instead of as an "Invalid URL" TypeError on the first login.
 */
function assertValidAppBaseUrl(appBaseUrl: AppBaseUrl): void {
  const entries = Array.isArray(appBaseUrl) ? appBaseUrl : [appBaseUrl]
  for (const entry of entries) {
    let parsed: URL
    try {
      parsed = new URL(entry)
    } catch {
      throw new InvalidConfigurationError(
        `appBaseUrl "${entry}" is not an absolute URL. Use a full origin, ` +
          'for example "https://app.example.com".',
      )
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new InvalidConfigurationError(
        `appBaseUrl "${entry}" must use http or https.`,
      )
    }
    // Auth0 rejects a `redirect_uri` that carries credentials, so a base URL
    // like `https://user:pass@app.example.com` would only fail on the first
    // login. Reject it here so the typo surfaces at startup instead.
    if (parsed.username !== '' || parsed.password !== '') {
      throw new InvalidConfigurationError(
        `appBaseUrl "${entry}" must not include a username or password. Use a ` +
          'plain origin, for example "https://app.example.com".',
      )
    }
  }
}

/**
 * Merges explicit options with environment variables (explicit wins), then
 * validates that the required fields are present. Throws
 * {@link InvalidConfigurationError} with an actionable message if not.
 *
 * Recognised env vars: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
 * `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`, `AUTH0_AUDIENCE`,
 * `AUTH0_TRUST_PROXY`.
 */
export function getConfig(options: Auth0ServerOptions = {}): ResolvedConfig {
  const domain = options.domain ?? envFirst('AUTH0_DOMAIN')
  const clientId = options.clientId ?? envFirst('AUTH0_CLIENT_ID')
  const clientSecret = options.clientSecret ?? envFirst('AUTH0_CLIENT_SECRET')
  const secret = options.secret ?? envFirst('AUTH0_SECRET')
  const appBaseUrl = options.appBaseUrl ?? envFirst('APP_BASE_URL')
  const audience = options.audience ?? envFirst('AUTH0_AUDIENCE')
  // Off unless the developer opts in. Forwarded headers are client-supplied
  // unless a proxy overwrites them, so trusting them cannot be the default.
  const configuredTrustProxy = options.trustProxy ?? envBool('AUTH0_TRUST_PROXY')
  const trustProxy = configuredTrustProxy ?? false

  // A function `domain` is a per-request resolver (Multiple Custom Domains). In
  // that mode `appBaseUrl` is optional: it is inferred from the request host.
  // With a static string domain, `appBaseUrl` is still required.
  const usesDomainResolver = typeof domain === 'function'

  // `secret` may be a single string or an array of strings. An array enables
  // zero-downtime key rotation: the first entry encrypts new sessions, and every
  // entry can decrypt existing ones. An empty array counts as missing.
  const hasSecret = Array.isArray(secret) ? secret.length > 0 : Boolean(secret)

  // An empty allow-list can never match a request, so it counts as missing
  // rather than as a configured (but unusable) value.
  const hasAppBaseUrl = Array.isArray(appBaseUrl)
    ? appBaseUrl.length > 0
    : Boolean(appBaseUrl)

  const missing: string[] = []
  if (!domain) missing.push('domain (AUTH0_DOMAIN)')
  if (!clientId) missing.push('clientId (AUTH0_CLIENT_ID)')
  if (!clientSecret) missing.push('clientSecret (AUTH0_CLIENT_SECRET)')
  if (!hasSecret) missing.push('secret (AUTH0_SECRET)')
  if (!hasAppBaseUrl && !usesDomainResolver) missing.push('appBaseUrl (APP_BASE_URL)')

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

  if (hasAppBaseUrl) assertValidAppBaseUrl(appBaseUrl!)

  warnOnInsecureCookie(options.sessionConfiguration?.cookie)
  warnOnUntrustedProxyWithResolver(
    usesDomainResolver,
    configuredTrustProxy !== undefined,
  )

  return {
    ...options,
    domain: domain!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    secret: secret!,
    appBaseUrl: appBaseUrl,
    trustProxy,
    audience,
    // An explicit array (including empty, to keep all claims) wins; otherwise
    // strip the internal OIDC claims by default.
    excludedClaims: options.excludedClaims ?? DEFAULT_EXCLUDED_CLAIMS,
  }
}

/**
 * Reads a single value out of a request header.
 *
 * Every proxy in a chain appends to `X-Forwarded-*`, so these headers can arrive
 * as a comma-separated list. The left-most entry is the one closest to the
 * browser, which is the value that describes the public request.
 */
function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim()
  return first ? first : undefined
}

/**
 * Builds the origin the browser used to reach this app, as `protocol://host`.
 *
 * With `trustProxy` disabled (the default) this describes the request the server
 * itself received: the `Host` header, falling back to the host in the request
 * URL, and the request URL's protocol. With `trustProxy` enabled,
 * `X-Forwarded-Host` and `X-Forwarded-Proto` take precedence, because a proxy
 * that terminates TLS is the only party that still knows the public origin.
 *
 * The result is normalised through `URL`, so a header carrying a path, embedded
 * credentials, or a default port cannot smuggle anything into the origin, and the
 * protocol must be exactly `http` or `https`.
 *
 * With `trustProxy` disabled the `Host` header is still used, and `Host` is
 * client-supplied. On a directly reachable deployment a caller can send a `Host`
 * that matches a different `appBaseUrl` allow-list entry (for example a staging
 * origin). Auth0's Allowed Callback URLs are the backstop that keeps this from
 * reaching anywhere the app has not registered.
 *
 * This is the only place in the SDK that reads a forwarded header.
 */
export function publicRequestOrigin(
  request: Request,
  trustProxy = false,
): string {
  const received = new URL(request.url)
  const host =
    (trustProxy
      ? firstHeaderValue(request.headers.get('x-forwarded-host'))
      : undefined) ??
    firstHeaderValue(request.headers.get('host')) ??
    received.host
  // Strip a trailing colon from whichever value we use. `URL.protocol` always
  // carries one (`"https:"`), and some proxies send `X-Forwarded-Proto: https:`
  // with the colon as well, so normalising both keeps the check below from
  // rejecting an otherwise valid scheme.
  const protocol = (
    (trustProxy
      ? firstHeaderValue(request.headers.get('x-forwarded-proto'))
      : undefined) ?? received.protocol
  ).replace(/:$/, '')

  // Check the protocol before it is concatenated, not after parsing. A value
  // like `https://evil.com` would otherwise parse as the scheme `https` plus the
  // host `evil.com`, and the host worked out above would be discarded.
  if (!/^https?$/i.test(protocol)) {
    throw new InvalidConfigurationError(
      `Request protocol "${protocol}" is not http or https.`,
    )
  }

  let origin: URL
  try {
    origin = new URL(`${protocol}://${host}`)
  } catch {
    throw new InvalidConfigurationError(
      `Unable to determine the request origin from protocol "${protocol}" and ` +
        `host "${host}".`,
    )
  }
  return origin.origin
}

/**
 * Infers the application base URL from the incoming request. Used when no
 * `appBaseUrl` is configured, which is only allowed alongside a
 * {@link DomainResolver} (Multiple Custom Domains).
 *
 * The host must be present on the request: with nothing configured to fall back
 * on, guessing would produce a `redirect_uri` that Auth0 rejects. Pass
 * `trustProxy: true` to take the host and protocol from `X-Forwarded-Host` and
 * `X-Forwarded-Proto`, which is what a TLS-terminating proxy requires. See the
 * "Multiple Custom Domains" section in EXAMPLES.md.
 */
export function inferAppBaseUrlFromRequest(
  request: Request,
  options: { trustProxy?: boolean } = {},
): string {
  const trustProxy = options.trustProxy ?? false
  const forwardedHost = trustProxy
    ? firstHeaderValue(request.headers.get('x-forwarded-host'))
    : undefined
  if (!forwardedHost && !firstHeaderValue(request.headers.get('host'))) {
    throw new InvalidConfigurationError(
      'Unable to infer appBaseUrl: the request has no Host header. In Multiple ' +
        'Custom Domains mode, ensure your reverse proxy forwards the host.',
    )
  }
  return publicRequestOrigin(request, trustProxy)
}

/**
 * Resolves the application base URL for a given request.
 *
 * - string: used as-is. No request and no header is consulted, so this is
 *   correct behind any proxy without further configuration.
 * - string[]: an allow-list; the request's origin must match one entry
 *   (supports staging/preview deployments). Throws if no entry matches.
 * - undefined: Multiple Custom Domains mode; inferred from the request host via
 *   {@link inferAppBaseUrlFromRequest}.
 *
 * Both per-request forms need a request, and need `trustProxy` enabled when the
 * app is behind a proxy that terminates TLS.
 *
 * @remarks
 * The first argument is the resolved config object (`auth0.config`), not the
 * `appBaseUrl` value. Earlier betas took `appBaseUrl` directly; passing that now
 * throws a {@link InvalidConfigurationError} explaining the change.
 *
 * @example
 * ```ts
 * const appBaseUrl = resolveAppBaseUrl(auth0.config, getRequest())
 * ```
 */
export function resolveAppBaseUrl(
  config: AppBaseUrlConfig,
  request?: Request,
): string {
  // `resolveAppBaseUrl` used to take `appBaseUrl` directly. It now takes the
  // config so that `trustProxy` always travels with it; without this guard the
  // old call shape would silently fall through to the Multiple Custom Domains
  // branch and infer the base URL from the request. `null`/`undefined` is caught
  // here too: in Multiple Custom Domains mode the old first argument was
  // `appBaseUrl`, which is `undefined`, so an old call would otherwise crash with
  // a raw "Cannot destructure" TypeError instead of this actionable message. A
  // `function` (a `domain` resolver passed here by mistake) is rejected for the
  // same reason: it would destructure to `appBaseUrl: undefined` and quietly
  // enter that same branch.
  if (
    config == null ||
    typeof config === 'string' ||
    typeof config === 'function' ||
    Array.isArray(config)
  ) {
    throw new InvalidConfigurationError(
      'resolveAppBaseUrl() takes the resolved config object, not the ' +
        '`appBaseUrl` value. Call resolveAppBaseUrl(auth0.config, request).',
    )
  }

  const { appBaseUrl, trustProxy = false } = config

  // A single configured URL is authoritative: the app already knows its public
  // origin, so nothing about the request can change it.
  if (typeof appBaseUrl === 'string') return appBaseUrl

  if (Array.isArray(appBaseUrl) && appBaseUrl.length === 0) {
    throw new InvalidConfigurationError('appBaseUrl allow-list is empty.')
  }

  if (!request) {
    throw new InvalidConfigurationError(
      appBaseUrl === undefined
        ? 'Cannot resolve appBaseUrl without a request. In Multiple Custom ' +
          'Domains mode, appBaseUrl is inferred per request.'
        : 'Cannot resolve appBaseUrl without a request. With an appBaseUrl ' +
          'allow-list, the entry to use is chosen per request, so the request ' +
          'being handled must be passed in.',
    )
  }

  if (appBaseUrl === undefined) {
    return inferAppBaseUrlFromRequest(request, { trustProxy })
  }

  const requestOrigin = publicRequestOrigin(request, trustProxy)
  const match = appBaseUrl.find((url) => new URL(url).origin === requestOrigin)
  if (!match) {
    throw new InvalidConfigurationError(
      `Request origin "${requestOrigin}" is not in the appBaseUrl allow-list ` +
        `(${appBaseUrl.join(', ')}).` +
        (trustProxy
          ? ''
          : ' If this app runs behind a reverse proxy or load balancer that ' +
            'terminates TLS, set `trustProxy: true` (or AUTH0_TRUST_PROXY=true) ' +
            'so the X-Forwarded-Host and X-Forwarded-Proto headers are used.'),
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
  config: AppBaseUrlConfig,
  returnTo?: string,
  request?: Request,
): { returnTo: string } | undefined {
  if (!returnTo) return undefined
  const base = resolveAppBaseUrl(config, request)
  const safeReturnTo = toSafeRedirect(returnTo, base)
  return safeReturnTo ? { returnTo: safeReturnTo } : undefined
}

/** Every auth endpoint path the SDK serves, fully resolved. */
export interface ResolvedRoutePaths {
  base: string
  login: string
  callback: string
  logout: string
  profile: string
  backchannelLogout: string
}

/**
 * Resolves the auth endpoint paths from the `routes` config, defaulting each one
 * to a segment under the configured base.
 *
 * Every part of the SDK that needs one of these paths goes through here. The
 * callback path in particular is used in three places (the `redirect_uri` sent to
 * Auth0, the `redirect_uri` re-sent during the token exchange, and the dispatch
 * of the incoming callback request), and Auth0 rejects the login unless all three
 * agree.
 */
export function resolveRoutePaths(config: {
  routes?: RoutesConfig
}): ResolvedRoutePaths {
  const routes = config.routes
  const base = routes?.base ?? '/auth'
  return {
    base,
    login: routes?.login ?? `${base}/login`,
    callback: routes?.callback ?? `${base}/callback`,
    logout: routes?.logout ?? `${base}/logout`,
    profile: routes?.profile ?? `${base}/profile`,
    backchannelLogout: routes?.backchannelLogout ?? `${base}/backchannel-logout`,
  }
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
