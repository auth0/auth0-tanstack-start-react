/**
 * Shared TypeScript types for `@auth0/auth0-tanstack-start-react`.
 *
 * Zero runtime dependencies on `/client` or `/server` — safe to import anywhere.
 *
 * @packageDocumentation
 */

// Session configuration is owned by the foundation. Re-export its types instead
// of defining our own, so the shape we accept always matches what the session
// store actually reads (see `sessionConfiguration` on Auth0ServerOptions).
import type { SessionConfiguration } from '@auth0/auth0-server-js'
export type {
  SessionConfiguration,
  SessionCookieOptions,
} from '@auth0/auth0-server-js'

/**
 * Resolves the Auth0 custom domain to use for the current request.
 *
 * Return the custom domain host (for example `login.brand-a.com`) for the
 * incoming request. Use this when one app instance serves several custom
 * domains that all front the same Auth0 tenant (Multiple Custom Domains).
 *
 * The function receives the incoming `Request`, so you can pick the domain from
 * the request host. It may be sync or async, and it must return a non-empty
 * host string. Map the host to a domain from a known, trusted set. Do not build
 * the domain from untrusted input. See the "Multiple Custom Domains" section in
 * EXAMPLES.md for the trusted-proxy requirement.
 */
export type DomainResolver = (request: Request) => string | Promise<string>

/**
 * The value of a token claim. Claims are always JSON, so this is the recursive
 * JSON value type (string, number, boolean, null, array, or object). `User`
 * uses it for its index signature, covering arbitrary custom claims, so the
 * profile can be dehydrated into the SSR HTML by TanStack Router, whose
 * serialization types reject a plain `unknown`.
 */
export type ClaimValue =
  | string
  | number
  | boolean
  | null
  | ClaimValue[]
  | { [key: string]: ClaimValue }

/** Auth0 user profile, sourced from the ID token / userinfo claims. */
export interface User {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  nickname?: string
  preferred_username?: string
  picture?: string
  email?: string
  email_verified?: boolean
  /** Present when the user logged in through an Auth0 Organization. */
  org_id?: string
  /** Organization slug; included only when the tenant adds the `org_name` claim. */
  org_name?: string
  [key: string]: ClaimValue | undefined
}

/** Shape of `context.auth0.session`. In RWA/SSR this is the decrypted cookie payload. */
export interface SessionData {
  user: User
  idToken?: string
  accessToken: string
  accessTokenScope?: string
  /** Unix timestamp (seconds). */
  accessTokenExpiresAt: number
  refreshToken?: string
  tokenType: string
  /**
   * Unix timestamp (seconds) of when the session was created. `undefined` when
   * the underlying store did not record it, rather than a fabricated value.
   */
  createdAt?: number
}

/** Full server-side token set returned by token utilities. */
export interface TokenSet {
  accessToken: string
  refreshToken?: string
  idToken?: string
  /** Unix timestamp (seconds). */
  expiresAt: number
  scope?: string
  tokenType: string
}

/** Return type of the server-side `getAccessToken()`. */
export interface AccessTokenResponse {
  token: string
  /** Unix timestamp (seconds). */
  expiresAt: number
  scope?: string
}

/** Organization object derived from token claims. */
export interface Organization {
  /** `org_id` from the ID token. */
  id: string
  /**
   * `org_name` URL slug from the ID token. Optional because the `org_name`
   * claim is only present when the tenant adds it, so it is omitted rather than
   * reported as an empty string when absent.
   */
  name?: string
  /** Human-readable name; NOT in the JWT by default (requires an Action). */
  display_name?: string
}

/** OIDC authorization request parameters. */
export interface AuthorizationParameters {
  scope?: string
  audience?: string
  prompt?: string
  /** Max seconds since last authentication. */
  max_age?: number
  login_hint?: string
  connection?: string
  organization?: string
  invitation?: string
  screen_hint?: string
  [key: string]: unknown
}

/** Options for `login()` / `useLogin()`. */
export interface LoginOptions {
  returnTo?: string
  authorizationParams?: AuthorizationParameters
  appState?: Record<string, unknown>
}

/**
 * Options for `logout()` / `useLogout()`.
 *
 * Only `returnTo` is supported, matching the other Auth0 SDKs (express, nuxt),
 * which pass `returnTo` to the foundation's `logout()`. Federated logout is not
 * exposed here; if it is needed later it should be added across the SDK family
 * rather than promised by this type alone.
 */
export interface LogoutOptions {
  returnTo?: string
}

/**
 * How far along the auth state is.
 *
 * - `resolved`: auth state is known (the user is authenticated or not).
 * - `loading`: auth state is still being determined.
 * - `unresolved`: auth state has not been populated at all. On the client this
 *   usually means `Auth0Provider` or `auth0Middleware` is not wired up. Guards
 *   treat this as not-authenticated and redirect, so it never fails open.
 */
export type Auth0Status = 'resolved' | 'loading' | 'unresolved'

/**
 * The auth state available in every `beforeLoad`, `loader`, and component via
 * `context.auth0`. In RWA/SSR `status` is `resolved` on first paint because
 * auth state is resolved server-side before HTML is sent.
 *
 * This context is serialized into the client (TanStack Router dehydrates
 * `beforeLoad` context into the HTML), so it MUST carry only non-secret display
 * claims. Tokens never appear here. Read tokens server-side via
 * `getSession(auth0)` / `getAccessToken(auth0)`.
 */
export interface Auth0RouterContext {
  user: User | undefined
  isAuthenticated: boolean
  /** The source of truth for how far along auth resolution is. */
  status: Auth0Status
  /** Convenience derived from `status`: `true` only while `status` is `loading`. */
  isLoading: boolean
}

/**
 * A Rich Authorization Request detail object (RFC 9396). Carries a `type` plus
 * arbitrary authorization data; surfaced by flows that use RAR (e.g. CIBA).
 */
export interface AuthorizationDetails {
  type: string
  [key: string]: unknown
}

/** Out-of-band delivery channels for OOB authenticators. */
export type OobChannel = 'sms' | 'voice' | 'auth0' | 'email'

/** An enrolled MFA factor. Mirrors the foundation's `AuthenticatorResponse`. */
export interface Authenticator {
  id: string
  authenticatorType: 'otp' | 'oob' | 'recovery-code'
  active: boolean
  name?: string
  /** Delivery channels (only present for `authenticatorType: 'oob'`). */
  oobChannels?: OobChannel[]
}

/** Response from initiating an MFA challenge. */
export interface MfaChallengeResponse {
  challengeType: 'otp' | 'oob'
  oobCode?: string
  bindingMethod?: string
}

/** Response from enrolling a new MFA factor. */
export interface MfaEnrollmentResponse {
  authenticatorType: 'otp' | 'oob'
  secret?: string
  barcodeUri?: string
  oobCode?: string
  oobChannel?: OobChannel
  recoveryCodes?: string[]
  id?: string
}

/** Options for initiating an MFA challenge. */
export interface MfaChallengeOptions {
  mfaToken: string
  authenticatorId?: string
  challengeType: 'otp' | 'oob'
}

/** Options for verifying an MFA challenge, discriminated by `factorType`. */
export type MfaVerifyOptions =
  | { mfaToken: string; factorType: 'otp'; otp: string; audience?: string }
  | {
      mfaToken: string
      factorType: 'oob'
      oobCode: string
      bindingCode?: string
      audience?: string
    }
  | {
      mfaToken: string
      factorType: 'recovery-code'
      recoveryCode: string
      audience?: string
    }

/**
 * Options for enrolling a new MFA factor. Matches the foundation's enrollment
 * union: `authenticatorTypes` and `oobChannels` are arrays.
 */
export type MfaEnrollOptions =
  | { mfaToken: string; authenticatorTypes: ['otp'] }
  | {
      mfaToken: string
      authenticatorTypes: ['oob']
      oobChannels: OobChannel[]
      phoneNumber?: string
    }
  | {
      mfaToken: string
      authenticatorTypes: ['oob']
      oobChannels: ['email']
      email?: string
    }

/**
 * Options for a custom token exchange (RFC 8693): exchange an external/legacy
 * subject token for Auth0 tokens.
 */
export interface CustomTokenExchangeOptions {
  /** The token to be exchanged. */
  subjectToken: string
  /** Token type URI of the subject token, e.g. `urn:acme:legacy-token`. */
  subjectTokenType: string
  /** Target API audience. */
  audience?: string
  /** Space-separated scopes to request. */
  scope?: string
  /** Requested token type (RFC 8693). Defaults to access_token. */
  requestedTokenType?: string
  /** Organization ID or name to authenticate the user within. */
  organization?: string
  /** Actor token for delegation (RFC 8693). Must be paired with `actorTokenType`. */
  actorToken?: string
  /** URI identifying the actor token type. Must be paired with `actorToken`. */
  actorTokenType?: string
  /** Custom parameters forwarded to Auth0 Actions. */
  extra?: Record<string, string | string[]>
}

/** Result of a custom token exchange. */
export interface CustomTokenExchangeResult {
  /** Rich Authorization Request (RFC 9396) details, when RAR was used. */
  authorizationDetails?: AuthorizationDetails[]
}

/** A token set for an upstream federated connection (Token Vault). */
export interface ConnectionTokenSet {
  accessToken: string
  scope?: string
  /** Unix timestamp (seconds). */
  expiresAt: number
  connection: string
  loginHint?: string
}

/** Options for retrieving an upstream connection access token (Token Vault). */
export interface GetAccessTokenForConnectionOptions {
  /** Federated connection name, e.g. `'google-oauth2'`. */
  connection: string
  /** Optional hint for which connection account, when the user has several. */
  loginHint?: string
}

/** Auth route path overrides. */
export interface RoutesConfig {
  base?: string
  login?: string
  callback?: string
  logout?: string
  profile?: string
  backchannelLogout?: string
}

/**
 * `appBaseUrl` may be a single static URL, or an allow-list of permitted
 * origins (useful for staging/preview deployments). When omitted, it is
 * inferred from the incoming request.
 */
export type AppBaseUrl = string | string[]

/** All configuration options for `auth0Server()`. Unset values fall back to env vars. */
export interface Auth0ServerOptions {
  /**
   * The Auth0 custom domain. Pass a string for a single custom domain, or a
   * {@link DomainResolver} to pick the domain per request when one app instance
   * serves several custom domains that front the same Auth0 tenant (Multiple
   * Custom Domains). With a resolver, `appBaseUrl` becomes optional and is
   * inferred from the request host.
   */
  domain?: string | DomainResolver
  clientId?: string
  clientSecret?: string
  /**
   * Session encryption secret. Each secret must be at least 32 bytes.
   *
   * Pass an array to rotate the secret with zero downtime: the first entry
   * encrypts new sessions, and every entry can decrypt existing ones. To rotate,
   * prepend the new secret and keep the old one until existing sessions expire.
   */
  secret?: string | string[]
  /**
   * The application base URL. Required with a string `domain`. Optional with a
   * {@link DomainResolver}, where it is inferred per request from the
   * `X-Forwarded-Host` / `Host` and `X-Forwarded-Proto` headers.
   */
  appBaseUrl?: AppBaseUrl
  audience?: string
  /**
   * Session configuration, passed through to the foundation's session store.
   * This is the foundation's own `SessionConfiguration` (rolling, durations, and
   * cookie options incl. `cookie.name`), so what you set here always takes effect.
   */
  sessionConfiguration?: SessionConfiguration
  routes?: RoutesConfig
  authorizationParams?: AuthorizationParameters
}
