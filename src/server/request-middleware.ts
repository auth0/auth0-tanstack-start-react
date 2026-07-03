import { createMiddleware } from '@tanstack/react-start'
import type { Auth0ServerOptions } from '../types/index.js'

/**
 * Primary request middleware. Register once in `start.ts`:
 *
 * ```ts
 * // src/start.ts
 * import { createStart } from '@tanstack/react-start'
 * import { auth0Middleware } from '@auth0/auth0-tanstack-start-react/server'
 *
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [auth0Middleware()],
 * }))
 * ```
 *
 * **Client-safe module.** `start.ts` is compiled into the CLIENT bundle and
 * TanStack Start's import-protection forbids it from reaching any server-only
 * module. This file's ONLY static import is `createMiddleware` (client-safe);
 * every server-only piece — the Auth0 instance, OIDC handlers, session
 * decryption, `node:async_hooks`-backed request helpers — is loaded lazily via a
 * dynamic `import('./middleware-body.js')` INSIDE the `.server()` handler, which
 * never runs at build time or in the browser. This is the standard pattern for
 * server-only work in a client-compiled TanStack Start entry file.
 *
 * `auth0Middleware()` takes optional config (read from env by default, identical
 * to {@link auth0Server}) rather than an `auth0` instance, precisely so the call
 * site needs no server-only import.
 *
 * Behavior:
 * - paths under the auth base (`/auth/*`) → handles the OIDC endpoints
 *   directly and returns a `Response` (TanStack Router never sees them);
 * - all other paths → reads/decrypts the session and attaches `context.auth0`.
 */
export function auth0Middleware(options?: Auth0ServerOptions) {
  return createMiddleware({ type: 'request' }).server(async (args) => {
    const { middlewareBody } = await import('./middleware-body.js')
    return middlewareBody(args, options) as ReturnType<typeof args.next>
  })
}
