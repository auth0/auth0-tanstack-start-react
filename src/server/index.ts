/**
 * Server entry point for `@auth0/auth0-tanstack-start-react`.
 *
 * Runs exclusively in the TanStack Start server runtime. Never imported into
 * client bundles. Import via `@auth0/auth0-tanstack-start-react/server`.
 *
 * @packageDocumentation
 */

// Group 1 — server factory, config, cookie handler.
export { auth0Server } from './auth0-server.js'
export type {
  Auth0Instance,
  Auth0ServerExtraOptions,
  SessionStore,
} from './auth0-server.js'
export {
  getConfig,
  resolveAppBaseUrl,
  inferAppBaseUrlFromRequest,
  toSafeRedirect,
  type ResolvedConfig,
} from './config.js'
export type { DomainResolver } from '../types/index.js'
export { TanStackStartCookieHandler } from './cookie-handler.js'

// Group 2 — auth route handling.
export {
  auth0Handlers,
  handleLogin,
  handleCallback,
  handleLogout,
  handleProfile,
  handleBackchannelLogout,
} from './handlers.js'

// Group 3 — server middleware.
// Primary request middleware lives in its own module with a minimal static
// graph (only `createMiddleware`), so importing it — including from `start.ts`,
// which is client-compiled — never statically pulls in server-only code.
export { auth0Middleware } from './request-middleware.js'
export {
  auth0FunctionMiddleware,
  requireAuthMiddleware,
  requireOrgMiddleware,
  withApiAuth,
  withApiScopes,
  withApiOrg,
  withApiClaimEquals,
  withApiClaimIncludes,
} from './middleware.js'
export {
  toSessionData,
  toAuth0RouterContext,
  toTokenSet,
} from './session-mapper.js'

// Group 4 — session & tokens.
export {
  getSession,
  getAccessToken,
  getTokenSet,
  createFetcher,
  type GetAccessTokenOptions,
} from './session.js'

// Group 7a — MFA step-up.
export {
  mfaGetAuthenticators,
  mfaChallenge,
  mfaVerify,
  mfaEnroll,
} from './mfa.js'

// Group 7b — Organizations (switch / invitation flows).
export {
  switchOrg,
  acceptOrgInvitation,
  type SwitchOrgOptions,
  type AcceptOrgInvitationOptions,
} from './organizations.js'

// Group 7c — Account linking (connect / disconnect).
export {
  connectAccount,
  completeConnectAccount,
  disconnectAccount,
  completeDisconnectAccount,
  type ConnectAccountOptions,
  type DisconnectAccountOptions,
} from './account-linking.js'

// Group 7d — CIBA backchannel authentication.
export {
  backchannelAuthentication,
  type BackchannelAuthenticationOptions,
  type BackchannelAuthenticationResult,
} from './ciba.js'

// Group 7e — Custom token exchange + Token Vault.
// (Option/result types live in /types: CustomTokenExchangeOptions,
//  CustomTokenExchangeResult, ConnectionTokenSet, GetAccessTokenForConnectionOptions.)
export {
  customTokenExchange,
  getAccessTokenForConnection,
} from './token-exchange.js'

// Group 7f — Passkey (WebAuthn).
export {
  passkeyRegister,
  passkeyChallenge,
  passkeyGetToken,
  type PasskeyRegisterOptions,
  type PasskeyRegisterResponse,
  type PasskeyChallengeOptions,
  type PasskeyChallengeResponse,
  type PasskeyGetTokenOptions,
  type PasskeyGetTokenResult,
} from './passkey.js'

// --- Foundation error classes (server-only) ---
// Re-exported from a single place so consumers can instanceof-check foundation
// failures without importing @auth0/auth0-server-js directly. These are
// server-only; the SDK's own errors live in the client-safe `/errors` entry.
export {
  MfaChallengeError,
  MfaEnrollmentError,
  MfaListAuthenticatorsError,
  MfaVerifyError,
  isMfaRequiredError,
  // Account linking (only StartLinkUserError is exported by the foundation today).
  StartLinkUserError,
  // Passkey (WebAuthn).
  PasskeyChallengeError,
  PasskeyGetTokenError,
  PasskeyRegisterError,
} from '@auth0/auth0-server-js'

// Group 5+ (client) is a separate entry point (./client).
