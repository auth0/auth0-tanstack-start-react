# Basic RWA example — Auth0 + TanStack Start

A server-rendered (Regular Web Application) TanStack Start app demonstrating
[`@auth0/auth0-tanstack-start-react`](../../README.md).

It shows the core SDK surface:

- **`auth0Server()`** — the server auth instance (`src/auth.server.ts`)
- **`auth0Middleware()`** — registered in `src/start.ts`; serves `/auth/*` and
  attaches `context.auth0` to every request
- **`auth0BeforeLoad()` + `<Auth0Provider>`** — wire auth state into the router
  and React (`src/routes/__root.tsx`)
- **`requireAuth()`** — protects `/dashboard` (`src/routes/dashboard.tsx`)
- **Hooks/components** — `useUser`, `useAuth0`, `useOrg`, `useLogin`,
  `useLogout`, `<SignedIn>`, `<SignedOut>`, `<HasOrg>`
- **A protected server function** via `createServerFn` (`src/server-fns.ts` →
  `src/protected.server.ts`)

## Prerequisites

An Auth0 **Regular Web Application**. In its settings, add:

- **Allowed Callback URLs:** `http://localhost:3000/auth/callback`
- **Allowed Logout URLs:** `http://localhost:3000`

## Setup

This example consumes the SDK from the local workspace via `file:../..`, so build
the SDK's `dist/` first (from the repo root: `npm install && npm run build`).
Then:

```bash
cp .env.example .env   # then fill in your Auth0 credentials
npm install
npm run dev            # http://localhost:3000
```

`.env`:

```sh
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SECRET=use-`openssl rand -hex 32`
APP_BASE_URL=http://localhost:3000
```

## What to try

1. Open `/` — server-rendered home; no auth loading flash.
2. Click **Log in** — redirects to Auth0 Universal Login.
3. After signing in you land on `/dashboard`, protected by `requireAuth()`, which
   exercises the SDK feature cards (access token, protected server call,
   role/permission gates, organization, profile).
4. **Log out** from the nav.

> Role/permission gates only flip to "granted" once your tenant populates those
> claims (RBAC + a Post-Login Action). Organization data appears when you log in
> through an Auth0 Organization.

## Production build

```bash
npm run build              # builds client + SSR + Nitro server
node .output/server/index.mjs
```
