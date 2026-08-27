/**
 * Test utilities for `@auth0/auth0-tanstack-start-react`.
 *
 * Excluded from production bundles. Import via
 * `@auth0/auth0-tanstack-start-react/testing`.
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react'
import { createElement } from 'react'
import {
  StatelessStateStore,
  type CookieHandler,
  type CookieSerializeOptions,
} from '@auth0/auth0-server-js'
import { Auth0ContextForTesting } from '../client/provider.js'
import type {
  Auth0RouterContext,
  Auth0Status,
  SessionData,
  User,
} from '../types/index.js'

/** Config for {@link createMockAuth0Context} / {@link Auth0TestProvider}. */
export interface MockAuthConfig {
  /** The user to present. Omit for an unauthenticated context. */
  user?: Partial<User>
  /**
   * Force a loading state. Default: `false`. Shorthand for `status: 'loading'`;
   * `status` takes precedence when both are set.
   */
  isLoading?: boolean
  /** Force a specific resolution status. Default: `resolved`. */
  status?: Auth0Status
}

/**
 * Builds a mock {@link Auth0RouterContext}. `isAuthenticated` is derived from
 * whether `user` is provided. The context carries only display claims (no
 * tokens), matching the real client context.
 *
 * Use as the initial `context.auth0` when building a test router, so guards and
 * loaders see the mock state without running the real SSR flow.
 */
export function createMockAuth0Context(
  config: MockAuthConfig = {},
): Auth0RouterContext {
  const user = config.user as User | undefined
  const status: Auth0Status =
    config.status ?? (config.isLoading ? 'loading' : 'resolved')
  return {
    user,
    isAuthenticated: user !== undefined,
    status,
    isLoading: status === 'loading',
  }
}

/**
 * Wraps children with a mocked Auth0 context so component tests can use the SDK
 * hooks (`useAuth0`, `useUser`, etc.) without a real provider or session.
 *
 * Implemented by importing the internal provider context and supplying a value
 * directly. Kept dependency-light so it works in any test environment.
 */
export function Auth0TestProvider(props: {
  children: ReactNode
  user?: Partial<User>
  isLoading?: boolean
}): ReactNode {
  const ctx = createMockAuth0Context(props)
  const value = {
    ...ctx,
    routes: { login: '/auth/login', logout: '/auth/logout' },
    login: () => {},
    logout: () => {},
  }
  return createElement(
    Auth0ContextForTesting.Provider,
    { value },
    props.children,
  )
}

/**
 * A minimal mock of the server-side Auth0 instance, for testing server
 * functions without a real Auth0 tenant, cookies, or tokens.
 */
export interface MockAuth0ClientConfig {
  session?: Partial<SessionData> | null
  accessToken?: string
  /**
   * Overrides for the mocked sub-clients (`mfa`, `orgs`, passkey, linking, CIBA
   * methods). Merged onto the default no-op stubs, so a test only needs to
   * supply the one method it exercises.
   */
  clientOverrides?: Record<string, unknown>
}

/**
 * Returns a mock `Auth0Instance`-shaped object. Pass it wherever the real
 * instance is used in a server function under test.
 *
 * The MFA, organization, account-linking, CIBA, and passkey surfaces are
 * stubbed so server functions that touch them do not hit `undefined`. Override
 * any method through `clientOverrides` to assert on it.
 */
export function createMockAuth0Client(config: MockAuth0ClientConfig = {}) {
  const session = config.session ?? null
  return {
    client: {
      getSession: async () => session,
      getUser: async () => session?.user,
      getAccessToken: async () => ({
        accessToken: config.accessToken ?? session?.accessToken ?? 'mock-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        scope: session?.accessTokenScope,
        audience: 'default',
      }),
      // MFA step-up.
      mfa: {
        listAuthenticators: async () => [],
        challengeAuthenticator: async () => ({ challengeType: 'otp' }),
        verify: async () => undefined,
        enrollAuthenticator: async () => ({
          authenticatorType: 'otp',
          secret: 'mock-secret',
          barcodeUri: 'otpauth://totp/mock',
        }),
      },
      // Organizations, account linking, CIBA, custom token exchange, passkey.
      startInteractiveLogin: async () => new URL('https://mock.auth0.com/authorize'),
      completeInteractiveLogin: async () => ({ appState: {} }),
      logout: async () => new URL('https://mock.auth0.com/v2/logout'),
      handleBackchannelLogout: async () => undefined,
      loginBackchannel: async () => ({ authReqId: 'mock-req' }),
      startLinkUser: async () => new URL('https://mock.auth0.com/authorize'),
      completeLinkUser: async () => undefined,
      startUnlinkUser: async () => new URL('https://mock.auth0.com/authorize'),
      completeUnlinkUser: async () => undefined,
      // Custom token exchange. The SDK calls loginWithCustomTokenExchange
      // (the session-persisting variant), not getTokenByCustomTokenExchange.
      loginWithCustomTokenExchange: async () => ({ authorizationDetails: undefined }),
      getAccessTokenForConnection: async () => ({
        accessToken: 'mock-connection-token',
        scope: undefined,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        connection: 'mock-connection',
      }),
      // Passkey. The SDK calls register / challenge / getToken on this client.
      passkey: {
        register: async () => ({}),
        challenge: async () => ({}),
        getToken: async () => ({}),
      },
      ...config.clientOverrides,
    },
    config: {
      domain: 'mock.auth0.com',
      clientId: 'mock-client',
      clientSecret: 'mock-secret',
      secret: 'x'.repeat(32),
      appBaseUrl: 'http://localhost:3000',
      trustProxy: false,
      routes: undefined,
    },
  }
}

/** Config for {@link generateSessionCookie}. */
export interface GenerateSessionCookieConfig {
  /** Must match the `secret` passed to `auth0Server()`. */
  secret: string
  /** Cookie name. Default: `__a0_session`. */
  cookieName?: string
  user: Partial<User>
  accessToken?: string
  accessTokenExpiresAt?: number
}

/**
 * Produces a real, encrypted session cookie value (for SSR integration tests),
 * by driving the foundation's `StatelessStateStore` with a capturing cookie
 * handler. The cookie is encrypted with the same scheme the SDK uses at
 * runtime, so injecting it into a test request yields an authenticated session.
 *
 * Returns the raw encrypted value (not a `name=value` string).
 */
export async function generateSessionCookie(
  config: GenerateSessionCookieConfig,
): Promise<string> {
  const captured: Record<string, string> = {}
  const cookieHandler: CookieHandler<void> = {
    setCookie: (name: string, value: string, _opts?: CookieSerializeOptions) => {
      captured[name] = value
    },
    getCookie: (name: string) => captured[name],
    getCookies: () => captured,
    deleteCookie: (name: string) => {
      delete captured[name]
    },
  }

  const cookieName = config.cookieName ?? '__a0_session'
  const store = new StatelessStateStore<void>(
    { secret: config.secret, cookie: { name: cookieName } },
    cookieHandler,
  )

  const now = Math.floor(Date.now() / 1000)
  await store.set(cookieName, {
    user: config.user as User,
    idToken: undefined,
    refreshToken: undefined,
    tokenSets: [
      {
        audience: 'default',
        accessToken: config.accessToken ?? 'test-access-token',
        scope: undefined,
        expiresAt: config.accessTokenExpiresAt ?? now + 3600,
      },
    ],
    internal: { sid: 'test-sid', createdAt: now },
  })

  // Stateless store chunks values as `${name}.0`, `${name}.1`, ... — join them.
  return Object.keys(captured)
    .filter((k) => k.startsWith(`${cookieName}.`))
    .sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]))
    .map((k) => captured[k])
    .join('')
}
