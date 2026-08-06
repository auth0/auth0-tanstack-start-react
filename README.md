# @auth0/auth0-tanstack-start-react

Auth0 Authentication SDK for [TanStack Start](https://tanstack.com/start) (React) applications.

> **Status: early development.** This SDK targets TanStack Start Regular Web Applications
> (server-rendered). SPA-only and Resource Server (API-only) deployments are not in scope for this
> release. For a TanStack Router SPA, use [`@auth0/auth0-react`](https://github.com/auth0/auth0-react).

The SDK is built on Auth0's foundational
[`@auth0/auth0-server-js`](https://github.com/auth0/auth0-auth-js) package. It consumes the
foundation rather than re-implementing OIDC, session, and token logic, so behavior stays consistent
with the rest of the Auth0 ecosystem.

## Table of contents

- [Installation](#installation)
- [Package structure](#package-structure)
- [Features](#features)
- [Quick start](#quick-start)
- [Known limitations](#known-limitations)
- [Feedback](#feedback)
- [License](#license)

## Installation

```sh
npm install @auth0/auth0-tanstack-start-react
```

This SDK relies on the following peer dependencies, which you install in your own app:

| Package | Version |
| --- | --- |
| `react` | `^18.0.0` or `^19.0.0` |
| `react-dom` | `^18.0.0` or `^19.0.0` |
| `@tanstack/react-router` | `^1.0.0` |
| `@tanstack/react-start` | `^1.0.0` |

## Package structure

The SDK is one package with seven entry points. Each entry point is tree-shakeable, and the bundle
boundary is enforced by the `exports` map, so server code never enters the client bundle and client
code never enters the server bundle.

| Import path | Contents |
| --- | --- |
| `@auth0/auth0-tanstack-start-react` (root, resolves to `/client`) | Provider, hooks, components, route guards |
| `@auth0/auth0-tanstack-start-react/client` | Same as the root import |
| `@auth0/auth0-tanstack-start-react/server` | `auth0Server()` factory, middleware, session and token helpers, auth route handlers, enterprise features |
| `@auth0/auth0-tanstack-start-react/server/middleware` | The request middleware only, in a client-safe module for use in `start.ts` |
| `@auth0/auth0-tanstack-start-react/testing` | Test utilities |
| `@auth0/auth0-tanstack-start-react/errors` | Typed error classes |
| `@auth0/auth0-tanstack-start-react/types` | TypeScript types |

The root import resolves to `/client`, the browser-safe surface, so the convenient path is also the
safe one. Server-only APIs require the explicit `/server` import.

### API style: free functions, not instance methods

The server APIs are free functions that take your `auth0` instance as the first argument, such as
`getSession(auth0)` and `getAccessToken(auth0)`. This differs from `@auth0/nextjs-auth0`, where you
call methods on the instance (`auth0.getSession()`).

The free-function style is deliberate. It matches what TanStack Start's own middleware and server
functions look like, it tree-shakes cleanly because you only bundle the helpers you import, and it
keeps each helper easy to wrap in a `createServerFn()`. If you are migrating from
`@auth0/nextjs-auth0`, the rename is mechanical: `auth0.getSession()` becomes `getSession(auth0)`,
`auth0.getAccessToken()` becomes `getAccessToken(auth0)`, and so on.

## Features

**Authentication**

- Login, callback, and logout handled server-side with an encrypted JWE session cookie.
- Back-channel logout so Auth0 can end a user's session from the Dashboard or another app. This
  requires a stateful `sessionStore`; see [EXAMPLES.md](./EXAMPLES.md#19-stateful-session-store).

**Route protection**

- `requireAuth` and `requireOrg` guards that run in a route's `beforeLoad`.
- Server-function middleware: `requireAuthMiddleware` for redirect flows, and
  `withApiAuth`, `withApiScopes`, `withApiOrg`, `withApiClaimEquals`, and `withApiClaimIncludes` for
  JSON APIs that should return HTTP errors. You check roles or permissions by naming the exact claim,
  for example `withApiClaimIncludes(auth0, 'https://myapp.com/roles', 'admin')`.

**React hooks and components**

- Hooks: `useAuth0`, `useUser`, `useOrg`, `useLogin`, `useLogout`, and `useMfa`.
- Components: `SignedIn`, `SignedOut`, `HasOrg`, `AuthReady`, and `AuthLoading`.

**Server-side tokens**

- Read the session and access tokens on the server with `getSession(auth0)`, `getAccessToken(auth0)`,
  `getTokenSet(auth0)`, and `createFetcher(auth0)` inside loaders and server functions.

**Enterprise**

- Multi-factor authentication (step-up), Organizations (switch and invitation flows), account
  linking, CIBA back-channel authentication, custom token exchange, Token Vault, and passkeys
  (WebAuthn).

**Configuration**

- Configure the session cookie and its lifetime through `sessionConfiguration`, and switch from
  stateless (encrypted cookie) sessions to stateful (server-stored) sessions with a `sessionStore`.
- **Multiple Custom Domains**: serve several custom domains that front the same Auth0 tenant from one
  app by passing a function to `domain`. The SDK picks the Auth0 domain per request and infers
  `appBaseUrl` from the request host. See
  [EXAMPLES.md](./EXAMPLES.md#17-multiple-custom-domains-mcd).

**Testing utilities**

- Mock context, a test provider, a mock server instance, and a real encrypted session-cookie
  generator for SSR integration tests.

Access, refresh, and ID tokens stay on the server and are never exposed to the browser. To be
precise about how that is enforced: the token-returning helpers (`getSession`, `getTokenSet`,
`getAccessToken`) live only in the `/server` entry point, so client code cannot import them, and the
automatic router context that is sent to the browser carries only the `user` object, never the
tokens. The only way a token reaches the browser is if you return one yourself from your own
`createServerFn`, so do not do that. Client-side token access is not provided in this release.

The `user` object is built from the ID token claims, and it is sent to the browser as part of the
server-rendered HTML. Any custom claim your tenant adds through an Action is included, so keep
sensitive data out of ID token claims. Treat the claims as values that anyone with access to the
page can read.

## Quick start

See [EXAMPLES.md](./EXAMPLES.md) for step-by-step walkthroughs, including the enterprise features. A
complete, runnable app lives in [`examples/basic-rwa`](./examples/basic-rwa).

Two TanStack Start conventions are worth knowing before you start:

- The router module must export a function named `getRouter`.
- `src/start.ts` runs in both the client and server bundles. Import the request middleware from the
  `/server/middleware` entry point, which is client-safe. Do not import the `/server` barrel or your
  own `auth.server` module at the top level of `start.ts`, because that would pull server-only code
  into the client bundle and TanStack Start's import-protection would reject it. See
  [EXAMPLES.md](./EXAMPLES.md#3-register-the-middleware).

## Known limitations

- **DPoP** (sender-constrained tokens) is not supported yet. DPoP is not provided by the underlying
  `@auth0/auth0-server-js`. It is planned for a future release, ideally once the foundation gains
  native support so that all Auth0 SDKs share one implementation.
- **SPA** (TanStack Router SPA or TanStack Start SPA mode) and **Resource Server** (API-only)
  deployments are out of scope for this SDK. Use
  [`@auth0/auth0-react`](https://github.com/auth0/auth0-react) for a TanStack Router SPA.

## Feedback

### Contributing

We appreciate feedback and contribution to this repo! Before you get started, please read the following:

- [Auth0's general contribution guidelines](https://github.com/auth0/open-source-template/blob/master/GENERAL-CONTRIBUTING.md)
- [Auth0's code of conduct guidelines](https://github.com/auth0/auth0-tanstack-start-react/blob/main/CODE-OF-CONDUCT.md)
- [This repo's contribution guide](./CONTRIBUTING.md)

### Raise an issue

To provide feedback or report a bug, please [raise an issue on our issue tracker](https://github.com/auth0/auth0-tanstack-start-react/issues).

## Vulnerability Reporting

Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/responsible-disclosure-policy) details the procedure for disclosing security issues.

## What is Auth0?

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_dark_mode.png" width="150">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
    <img alt="Auth0 Logo" src="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
  </picture>
</p>
<p align="center">
  Auth0 is an easy to implement, adaptable authentication and authorization platform. To learn more checkout <a href="https://auth0.com/why-auth0">Why Auth0?</a>
</p>
<p align="center">
  This project is licensed under the Apache License 2.0. See the <a href="https://github.com/auth0/auth0-tanstack-start-react/blob/main/LICENSE"> LICENSE</a> file for more info.
</p>
