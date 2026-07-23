import { InvalidConfigurationError } from '../errors/index.js'
import type { Auth0Instance } from './auth0-server.js'

/**
 * Passkey (WebAuthn) server helpers. **Server-side only (RWA / Mode C)** —
 * passkey flows require backend session persistence and are not applicable to
 * SPA modes.
 *
 * Passkey spans client and server. These helpers are the SERVER half; the
 * browser performs the WebAuthn ceremony in between:
 *  1. (server) {@link passkeyRegister} / {@link passkeyChallenge} — get a
 *     WebAuthn challenge (`authnParamsPublicKey`) and an `authSession`.
 *  2. (browser) pass `authnParamsPublicKey` to `navigator.credentials.create()`
 *     (register) or `.get()` (login) to produce a `credential`.
 *  3. (server) {@link passkeyGetToken} — exchange `{ authSession, credential }`
 *     for tokens and persist the session.
 *
 * Wire steps 1 and 3 as TanStack Start server functions the browser calls; step
 * 2 runs in the component. See EXAMPLES.md for a full client/server walkthrough.
 *
 * The WebAuthn option/credential shapes are intricate and (apart from the token
 * result) not exported by `@auth0/auth0-server-js`; rather than redefine them,
 * these wrappers derive their parameter and return types directly from the
 * foundation client so they stay exactly in sync. Use `PasskeyRegisterOptions`
 * etc. (exported below) for annotations — your editor expands them to the full
 * shape on hover.
 *
 * Errors: throw the foundation's `PasskeyRegisterError`, `PasskeyChallengeError`,
 * and `PasskeyGetTokenError` (re-exported from `/server`).
 */

type PasskeyClient = Auth0Instance['client']['passkey']

/** Options for {@link passkeyRegister} (signup challenge). */
export type PasskeyRegisterOptions = Parameters<PasskeyClient['register']>[0]
/** Response from {@link passkeyRegister}. */
export type PasskeyRegisterResponse = Awaited<
  ReturnType<PasskeyClient['register']>
>
/** Options for {@link passkeyChallenge} (login challenge). */
export type PasskeyChallengeOptions = Parameters<PasskeyClient['challenge']>[0]
/** Response from {@link passkeyChallenge}. */
export type PasskeyChallengeResponse = Awaited<
  ReturnType<PasskeyClient['challenge']>
>
/** Options for {@link passkeyGetToken}. */
export type PasskeyGetTokenOptions = Parameters<PasskeyClient['getToken']>[0]
/** Result of {@link passkeyGetToken}. */
export type PasskeyGetTokenResult = Awaited<
  ReturnType<PasskeyClient['getToken']>
>

/**
 * Requests a passkey signup challenge for a new user. Pass at least one of
 * `email`, `username`, or `phoneNumber`. Returns `authSession` plus the
 * `authnParamsPublicKey` to hand to `navigator.credentials.create()`.
 *
 * @throws {InvalidConfigurationError} if no user identifier is provided.
 */
export async function passkeyRegister(
  auth0: Auth0Instance,
  options: PasskeyRegisterOptions,
): Promise<PasskeyRegisterResponse> {
  const o = options as {
    email?: string
    username?: string
    phoneNumber?: string
  }
  if (!o.email && !o.username && !o.phoneNumber) {
    throw new InvalidConfigurationError(
      'passkeyRegister requires at least one of `email`, `username`, or `phoneNumber`.',
    )
  }
  return auth0.client.passkey.register(options)
}

/**
 * Requests a passkey login challenge for an existing user. Returns
 * `authSession` plus the `authnParamsPublicKey` to hand to
 * `navigator.credentials.get()`.
 */
export async function passkeyChallenge(
  auth0: Auth0Instance,
  options?: PasskeyChallengeOptions,
): Promise<PasskeyChallengeResponse> {
  return auth0.client.passkey.challenge(options)
}

/**
 * Exchanges a WebAuthn credential (from `create()`/`get()`) for tokens and
 * persists the session. Pass the `authSession` from the challenge step and the
 * serialized `credential` from the browser.
 *
 * @throws {PasskeyGetTokenError} on failure. If the underlying cause is
 * `mfa_required`, no session is persisted; complete MFA via the `/server` MFA
 * helpers using the `mfa_token` from the error before retrying.
 */
export async function passkeyGetToken(
  auth0: Auth0Instance,
  options: PasskeyGetTokenOptions,
): Promise<PasskeyGetTokenResult> {
  return auth0.client.passkey.getToken(options)
}
