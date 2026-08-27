import type { AuthorizationParameters } from './types/index.js'

/**
 * Builds the URL for the SDK's login route, appending `returnTo` and any extra
 * OIDC authorization parameters as query params.
 *
 * Every place that redirects to login (the `useLogin` hook, the imperative
 * `login()`, the route guards, and the server middleware) routes through here,
 * so they all forward the same params in the same way. The login route's server
 * handler then filters these query params and applies them on the `/authorize`
 * call. This is what lets a route guard trigger a step-up login by passing, for
 * example, `acr_values`.
 *
 * `returnTo` is emitted first so the common case keeps a stable, readable URL.
 * `null`/`undefined` authorization values are skipped rather than serialized as
 * the string `"null"`. Values are coerced with `String()` so numbers (e.g.
 * `max_age`) come through as expected.
 */
export function buildLoginHref(
  loginPath: string,
  options: {
    returnTo?: string
    authorizationParams?: AuthorizationParameters
  } = {},
): string {
  const params = new URLSearchParams()
  if (options.returnTo) params.set('returnTo', options.returnTo)
  for (const [key, value] of Object.entries(
    options.authorizationParams ?? {},
  )) {
    if (value != null) params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${loginPath}?${query}` : loginPath
}
