// Import the cookie/request helpers from the narrow `@tanstack/start-server-core`
// entry, NOT the broad `@tanstack/react-start/server` barrel. The barrel
// re-exports the SSR render handlers (renderRouterToString → react-dom/server),
// which, if this module is ever reached from a client-bundled file (e.g. a
// `start.ts` that registers middleware), would drag server-only render code into
// the client bundle and break hydration. The narrow entry exposes the same
// helpers without the renderer. (start-server-core is a direct dependency of
// @tanstack/react-start, so it is always present.)
import {
  getCookie,
  getCookies,
  setCookie,
  deleteCookie,
} from '@tanstack/start-server-core'
import type {
  CookieHandler,
  CookieSerializeOptions,
} from '@auth0/auth0-server-js'

/**
 * Bridges `@auth0/auth0-server-js`'s {@link CookieHandler} contract onto
 * TanStack Start's request/response cookie utilities.
 *
 * Unlike the Nuxt/Fastify adapters, no `storeOptions` (event/request/reply)
 * needs to be threaded through: TanStack Start resolves the current request
 * implicitly via its own server-side context (`getRequest()` / `getH3Event()`),
 * so `getCookie`/`setCookie`/`deleteCookie` already operate on the in-flight
 * request. This keeps every server call site free of request plumbing.
 *
 * `storeOptions` is therefore unused here. The type parameter is `void` to make
 * that explicit while still satisfying the generic interface.
 */
export class TanStackStartCookieHandler implements CookieHandler<void> {
  setCookie(
    name: string,
    value: string,
    options?: CookieSerializeOptions,
  ): void {
    setCookie(name, value, options)
  }

  getCookie(name: string): string | undefined {
    return getCookie(name)
  }

  getCookies(): Record<string, string> {
    return getCookies()
  }

  deleteCookie(name: string, _storeOptions?: void, options?: CookieSerializeOptions): void {
    // TanStack Start's deleteCookie takes (name, options); the middle
    // storeOptions slot from the interface is unused.
    deleteCookie(name, options)
  }
}
