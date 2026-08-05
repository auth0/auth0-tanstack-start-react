import { getRequest } from '@tanstack/start-server-core'
import type { Auth0Instance } from './auth0-server.js'
import { resolveAppBaseUrl, usesPerRequestRedirectUri } from './config.js'

/**
 * Per-request redirect context for the interactive flows started outside the
 * `/auth/login` handler (organization switch/invitation, account link/unlink).
 *
 * In Multiple Custom Domains mode, or with a non-string `appBaseUrl`, the
 * callback `redirect_uri` and the base URL used to validate `returnTo` both
 * depend on the incoming request, so they are read from the ambient request
 * here. With a single static `appBaseUrl` the client already carries the
 * `redirect_uri` and there is no ambient request to read, so `request` and
 * `redirectUri` are `undefined`.
 */
export interface PerRequestRedirect {
  /** The ambient request, only in per-request mode. */
  request: Request | undefined
  /** The callback URL for the resolved base URL, only in per-request mode. */
  redirectUri: string | undefined
}

/**
 * Resolves the per-request redirect context for an interactive flow. Reads the
 * ambient request only when the SDK runs in a per-request mode
 * (see {@link usesPerRequestRedirectUri}), so static-string deployments keep
 * working without an ambient request.
 */
export function resolvePerRequestRedirect(auth0: Auth0Instance): PerRequestRedirect {
  if (!usesPerRequestRedirectUri(auth0.config)) {
    return { request: undefined, redirectUri: undefined }
  }
  const request = getRequest()
  const appBaseUrl = resolveAppBaseUrl(auth0.config.appBaseUrl, request)
  const callbackPath = auth0.config.routes?.callback ?? '/auth/callback'
  return {
    request,
    redirectUri: new URL(callbackPath, appBaseUrl).toString(),
  }
}

/**
 * Merges the caller's `authorizationParams` with a per-request `redirect_uri`
 * when one applies. Returns `undefined` when there is nothing to pass, so the
 * caller can omit the field entirely in static mode.
 */
export function perRequestAuthorizationParams(
  base: Record<string, unknown> | undefined,
  redirectUri: string | undefined,
): Record<string, unknown> | undefined {
  if (!redirectUri) return base
  return { ...base, redirect_uri: redirectUri }
}
