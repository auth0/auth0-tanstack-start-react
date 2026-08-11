# Basic OIDC example (Auth0 + TanStack Start)

A server-rendered (Regular Web Application) TanStack Start app demonstrating the
standard OIDC login flow with
[`@auth0/auth0-tanstack-start-react`](../../README.md).

It shows the core SDK surface:

- **`auth0Server()`**: the server auth instance (`src/auth.server.ts`)
- **`auth0Middleware()`**: registered in `src/start.ts`; serves `/auth/*` and
  attaches `context.auth0` to every request
- **`auth0BeforeLoad()` + `<Auth0Provider>`**: wire auth state into the router
  and React (`src/routes/__root.tsx`)
- **`requireAuth()`**: protects `/dashboard` (`src/routes/dashboard.tsx`)
- **Hooks and components**: `useUser`, `useAuth0`, `useOrg`, `useLogin`,
  `useLogout`, `<SignedIn>`, `<SignedOut>`, `<HasOrg>`
- **A protected server function** via `createServerFn` (`src/server-fns.ts` to
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
npm run typecheck      # optional: tsc --noEmit
npm run dev            # http://localhost:3000
```

The dev server uses `strictPort`, so it always runs on `http://localhost:3000`.
If that port is busy it fails fast rather than moving to another port, which
would break the registered callback URL.

`.env`:

```sh
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SECRET=use-`openssl rand -hex 32`
APP_BASE_URL=http://localhost:3000
```

## What to try

The home page (`/`) shows a short **"How to test this example"** checklist. In
short:

1. Open `/`. The home is server-rendered, with no auth loading flash.
2. Click **Log in**. You are redirected to Auth0 Universal Login.
3. After signing in you land on `/dashboard`, protected by `requireAuth()`, which
   confirms the session and shows your user profile, a protected server-function
   call, and the active organization.
4. **Log out** from the nav.

> Organization data appears only when you log in through an Auth0 Organization.
> Otherwise the card shows a "no organization" note.

## Production build

```bash
npm run build              # builds client + SSR + Nitro server
node .output/server/index.mjs
```
