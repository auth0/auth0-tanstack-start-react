# Change Log

## [v1.0.0-beta.1](https://github.com/auth0/auth0-tanstack-start-react/tree/v1.0.0-beta.1) (2026-08-28)
[Full Changelog](https://github.com/auth0/auth0-tanstack-start-react/compare/v1.0.0-beta.0...v1.0.0-beta.1)

**Fixed**
- fix: forward authorizationParams on login redirects; reserve OIDC Req… [\#31](https://github.com/auth0/auth0-tanstack-start-react/pull/31) ([@nandan-bhat](https://github.com/nandan-bhat))
- fix: remove unpopulated `display_name` from `Organization` [\#30](https://github.com/auth0/auth0-tanstack-start-react/pull/30) ([@nandan-bhat](https://github.com/nandan-bhat))
- fix: derive the callback redirect_uri from appBaseUr [\#29](https://github.com/auth0/auth0-tanstack-start-react/pull/29) ([@nandan-bhat](https://github.com/nandan-bhat))


## [v1.0.0-beta.0](https://github.com/auth0/auth0-tanstack-start-react/tree/v1.0.0-beta.0) (2026-08-11)

The first release of `@auth0/auth0-tanstack-start-react`, the Auth0 Authentication
SDK for [TanStack Start](https://tanstack.com/start) (React) server-rendered
Regular Web Applications. It is built on
[`@auth0/auth0-server-js`](https://github.com/auth0/auth0-auth-js) and exposes a
tree-shakeable, client/server-split API.

**Added**

- Server-side login, callback, and logout backed by an encrypted JWE session
  cookie, served automatically by `auth0Middleware()`.
- `auth0Server()` factory plus server helpers: `getSession`, `getAccessToken`,
  `getTokenSet`, and `createFetcher`. Tokens stay on the server and never reach
  the browser.
- Router integration: `auth0BeforeLoad()` and `<Auth0Provider>` wire the
  server-resolved auth state into the router with no client-side loading flash.
- Route protection: `requireAuth` and `requireOrg` route guards, and the
  server-function middleware `requireAuthMiddleware`, `withApiAuth`,
  `withApiScopes`, `withApiOrg`, `withApiClaimEquals`, and `withApiClaimIncludes`.
- React hooks and components: `useAuth0`, `useUser`, `useOrg`, `useLogin`,
  `useLogout`, `useMfa`, and `<SignedIn>`, `<SignedOut>`, `<HasOrg>`,
  `<AuthReady>`, `<AuthLoading>`.
- Enterprise features: multi-factor authentication (step-up), Organizations
  (switch and invitation flows), account linking, CIBA back-channel
  authentication, custom token exchange, Token Vault, and passkeys (WebAuthn).
- Multiple Custom Domains: pass a resolver to `domain` to serve several custom
  domains that front the same tenant, with `appBaseUrl` inferred per request.
- Configuration: `sessionConfiguration` for the session cookie and its lifetime,
  a `sessionStore` to switch from stateless to stateful sessions, `secret` as a
  string or an array for zero-downtime key rotation, and `excludedClaims` to keep
  internal OIDC claims out of the SSR HTML.
- Testing utilities under `/testing`: a mock router context
  (`createMockAuth0Context`), a test provider (`Auth0TestProvider`), and a mock
  Auth0 client (`createMockAuth0Client`).
- Example apps under `examples/`: `basic-oidc` (standard OIDC login) and
  `passkeys` (WebAuthn register and login).

**Notes**

- This is a beta release. APIs may change before the stable `1.0.0`.
- See the README "Known limitations" for the current list.
