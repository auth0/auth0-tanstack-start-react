/**
 * Client entry point for `@auth0/auth0-tanstack-start-react`.
 *
 * Safe to import in any React file; server code is never included. This is also
 * the package root export (`@auth0/auth0-tanstack-start-react`).
 *
 * @packageDocumentation
 */

// Provider + route context.
export {
  Auth0Provider,
  type Auth0ProviderProps,
  type Auth0ContextValue,
  type LoginRedirectOptions,
} from './provider.js'
export { auth0BeforeLoad, auth0RouterContext } from './context.js'
export {
  getClientAuthCache,
  setClientAuthCache,
  clearClientAuthCache,
} from './auth-cache.js'

// Hooks.
export { useAuth0, useUser, useLogin, useLogout, useOrg } from './hooks.js'

// Components.
export {
  SignedIn,
  SignedOut,
  HasOrg,
  AuthLoading,
  AuthReady,
} from './components.js'

// Route guards.
export {
  requireAuth,
  requireOrg,
  type GuardOptions,
  type GuardContext,
} from './guards.js'

// Imperative helpers (for loaders / beforeLoad).
export { login, logout, type ImperativeContext } from './imperative.js'

// MFA (client hook; takes app-provided MFA server functions).
export {
  useMfa,
  type MfaServerFns,
  type UseMfaResult,
} from './mfa.js'
