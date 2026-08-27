# Session context

## Current task: SDK-11062 — forward `authorizationParams` on every login redirect

**Branch:** `fix/SDK-11062-forward-authorization-params` (off `main`, not yet committed).

### Problem

The `beforeLoad` / loader / server-function login surfaces accepted
`authorizationParams` in their types but silently forwarded only `returnTo`, so
redirect-based step-up MFA (`acr_values` from a route guard) never worked.
`useLogin()` and the server login handler were already correct; only the
guard / imperative / middleware paths had drifted.

### Fix

- **`src/login-url.ts`** (new) — one pure `buildLoginHref(loginPath, { returnTo,
  authorizationParams })` helper. Every login-redirect site builds the URL
  through it, so they cannot drift apart again (drift was the root cause).
  Encodes via `URLSearchParams`, `returnTo` first, skips null/undefined.
- **`src/client/imperative.ts`**, **`src/client/provider.tsx`**,
  **`src/client/guards.ts`**, **`src/server/middleware.ts`** — all route their
  login redirects through `buildLoginHref`.
- **`requireOrg` / `requireOrgMiddleware`** now also forward `returnTo` (they
  dropped it before) and merge `{ ...authorizationParams, organization: orgId }`
  with `organization` last so the guard's target org always wins.
- **`RequireLoginMiddlewareOptions`** (new, exported) gained `returnTo` and
  `authorizationParams`, matching the client `GuardOptions`.
- **`LoginOptions.appState`** removed — the "display_name pattern" (a field the
  SDK never delivers). The server hardcodes `appState: { returnTo }`; imperative
  `login()` cannot deliver a caller `appState`. This is a **breaking type
  change** to flag in the release PR.
- JSDoc on all four surfaces notes that SDK-controlled OAuth params (`scope`,
  `audience`, `state`, `redirect_uri`, and similar) are dropped by the login
  route; set `scope` / `audience` on `auth0Server({ authorizationParams })`.
- **EXAMPLES.md** — new "Step-up MFA from a guard" subsection, with a caveat that
  the gated claim (e.g. `amr`) must actually be issued by the tenant or the
  guard loops back to login.

### Trust boundary (relied on, and hardened in this branch)

The client only builds the query string. The server's
`authorizationParamsFromQuery` (`src/server/handlers.ts`) re-filters before
`/authorize`, dropping `returnTo`, `DENIED_PARAM_KEYS` (prototype pollution),
and `RESERVED_OAUTH_PARAMS`. So `scope` / `audience` passed to a redirect
surface are silently dropped by design.

### Security fix folded into this branch (from auth0-express PR #25)

`RESERVED_OAUTH_PARAMS` did not include the OIDC Request-Object params, so a
crafted link `/auth/login?request_uri=https://attacker/obj` could submit a
Request Object to `/authorize` carrying its own authorization parameters
(parameter smuggling). Added `request`, `request_uri`, `claims`,
`id_token_hint`, `response_mode` to the reserved set. `prompt` and `login_hint`
stay forwardable on purpose (integrators set them); a guard test locks that in.
Two new handler tests: Request-Object params dropped, and `prompt`/`login_hint`
still forwarded. Mirrors the fix auth0-express shipped in its PR #25. The user
chose to land it on this same branch rather than a separate one.

### Review

Ran the `pr-reviewer` agent (on `opus` after a Bedrock 403 on the default
model). Verdict: no blocking bugs, security verified. All fixable findings
addressed in place:
- reserved-param JSDoc on all four option types,
- `returnTo` symmetry on the middleware options + 2 tests,
- EXAMPLES loop/tenant caveat.
Deliberately not changed: barrel-export of `RequireLoginMiddlewareOptions`
(consistent with `WithApiScopesOptions`), `String()` coercion (matches prior
behavior), CHANGELOG (release-PR-owns-changelog convention).

### Validation (all green)

`npx tsc --noEmit` clean · `npm test` 308/308 · `npm run lint` clean · no new
em/en dashes (flagged ones are all pre-existing).

### Not done / awaiting user

- User commits (I do not commit or push).
- `examples/basic-oidc/vite.config.ts` has an unrelated stray `allowedHosts`
  local change — NOT part of this feature; exclude from the commit.
- After push, reply to Rudy on Slack that this feature is being added (only on
  the user's word).
- Flag the breaking `LoginOptions.appState` removal in the release PR.
