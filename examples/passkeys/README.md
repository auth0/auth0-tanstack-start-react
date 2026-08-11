# Passkeys example (Auth0 + TanStack Start)

A server-rendered (Regular Web Application) TanStack Start app that demonstrates
**passkey (WebAuthn) register and login** with
[`@auth0/auth0-tanstack-start-react`](../../README.md).

It shows the passkey surface:

- **`passkeyRegister`**: signup challenge for a new user
- **`passkeyChallenge`**: login challenge for an existing user
- **`passkeyGetToken`**: exchange the browser credential for tokens and a session

Steps 1 and 3 run on the server through a confidential client
(`src/passkey.functions.ts`). The WebAuthn ceremony (step 2) runs in the browser
(`src/routes/index.tsx`).

## Prerequisites

Passkeys need more setup than a plain login, because WebAuthn is bound to a real
domain (the Relying Party ID). The home page lists these as a checklist. In full:

1. An Auth0 **custom domain**. A custom Relying Party ID is only allowed with a
   custom domain, so plain `localhost` will not work.
2. A **Relying Party ID** (Tenant Settings) set to the registrable root shared by
   your Auth0 custom domain and this app's origin. For example, `acmetest.org`
   for an app served at `app.acmetest.org`.
3. Serve this app over **HTTPS** on a domain under that RP ID (a secure context,
   for example via a tunnel). WebAuthn will not run over plain HTTP or on a
   mismatched origin.
4. The tenant's **passkey feature flags** enabled (native passkeys and RP ID).
5. `https://<your-app-domain>/auth/callback` added to **Allowed Callback URLs**,
   and `https://<your-app-domain>` added to **Allowed Logout URLs**.

This example requires a **confidential client** (a client secret) and
`@auth0/auth0-server-js` version 1.12.1 or later, which forwards the client
secret to the passkey endpoints. That version is already the SDK's floor.

## Setup

This example consumes the SDK from the local workspace via `file:../..`, so build
the SDK's `dist/` first (from the repo root: `npm install && npm run build`).
Then:

```bash
cp .env.example .env   # fill in your Auth0 custom-domain credentials
npm install
npm run typecheck      # optional: tsc --noEmit
npm run dev            # served locally on :3000; reach it via your HTTPS domain
```

The dev server uses `strictPort`, so it always runs on port 3000 (behind your
HTTPS tunnel) and fails fast if that port is busy.

See `.env.example` for the variables. `AUTH0_DOMAIN` must be your Auth0 **custom
domain**, and `APP_BASE_URL` must be the **HTTPS origin** the browser uses to
reach the app.

> This example serves over a custom domain, so its dev server allows any host
> (`server.allowedHosts: true` in `vite.config.ts`). That is a local development
> convenience, not something you would ship in a real app.

## What to try

1. Open the app on your HTTPS domain. The home page shows the prerequisites.
2. **Register a passkey:** enter an email and click *Register passkey*. Your
   browser or operating system prompts you to create a passkey.
3. **Log in with a passkey:** click *Log in with passkey* and pick your passkey.
4. On success the page reloads into the signed-in view, showing your session and
   ID-token claims. Use **Log out** in the nav to end the session.

> The browser only offers to create a *local* (this-device) passkey outside of
> Guest or incognito sessions, and when a passkey provider is available. In a
> bare or Guest profile it may only offer the cross-device (phone or QR) option.

## Production build

```bash
npm run build              # builds client + SSR + Nitro server
node .output/server/index.mjs
```
