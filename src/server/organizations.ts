import { InvalidConfigurationError } from '../errors/index.js'
import type { AuthorizationParameters } from '../types/index.js'
import type { Auth0Instance } from './auth0-server.js'
import { toSafeAppState } from './config.js'
import {
  perRequestAuthorizationParams,
  resolvePerRequestRedirect,
} from './redirect-uri.js'

/**
 * Organizations server helpers.
 *
 * Core organization support is already provided elsewhere: the route guards
 * (`requireOrg`), the API middleware (`withApiOrg`), and `useOrg()` all read the
 * `org_id` claim. This module adds the flows that require re-authentication:
 * switching organizations and accepting an organization invitation.
 *
 * The foundation has no dedicated `switchOrg`; both flows are expressed as an
 * interactive login carrying the `organization` (and optionally `invitation`)
 * authorization parameter. Each returns the Auth0 authorization URL — the
 * caller (typically a server function or route handler) issues the redirect.
 *
 * **Session replacement is atomic.** On callback, the foundation's
 * `completeInteractiveLogin` writes the new session with `removeIfExists: true`,
 * which deletes the prior session (and, for stateful stores, regenerates the
 * session id to prevent fixation). No explicit logout is required before
 * switching — the old org session cannot leak into the new one.
 *
 * **Client usage:** these are server functions. From a component, wrap one in a
 * `createServerFn()` that returns the URL, call it, then navigate — or simply
 * link the user to a route whose `beforeLoad`/handler calls these and redirects.
 *
 * @example
 * ```ts
 * // src/routes/switch-org.tsx
 * export const Route = createFileRoute('/switch-org/$orgId')({
 *   beforeLoad: async ({ params }) => {
 *     const url = await switchOrg(auth0, { organization: params.orgId })
 *     throw redirect({ href: url.toString() })
 *   },
 * })
 * ```
 */

/** Options for {@link switchOrg}. */
export interface SwitchOrgOptions {
  /** Target organization ID (`org_...`) or slug (e.g. `acme-corp`). */
  organization: string
  /**
   * Where to return after the new org session is established. Validated against
   * the app's own origin before being stored; an off-origin value is ignored
   * (open-redirect protection).
   */
  returnTo?: string
  /**
   * Extra authorization parameters to forward (e.g. `{ prompt: 'none' }` to
   * attempt a silent switch when the user already has an Auth0 SSO session).
   */
  authorizationParams?: AuthorizationParameters
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidConfigurationError(`\`${field}\` must be a non-empty string.`)
  }
}

/**
 * Re-authenticates the user in the context of a different organization.
 *
 * Returns the Auth0 authorization URL with the `organization` parameter set.
 * The existing session is replaced atomically when the user completes the new
 * login (see module note). The caller issues the redirect.
 *
 * @example
 * ```ts
 * const url = await switchOrg(auth0, { organization: 'org_xyz', returnTo: '/' })
 * throw redirect({ href: url.toString() })
 * ```
 */
export async function switchOrg(
  auth0: Auth0Instance,
  options: SwitchOrgOptions,
): Promise<URL> {
  assertNonEmpty(options.organization, 'organization')
  const { request, redirectUri } = resolvePerRequestRedirect(auth0)
  return auth0.client.startInteractiveLogin({
    appState: toSafeAppState(auth0.config.appBaseUrl, options.returnTo, request),
    authorizationParams: perRequestAuthorizationParams(
      { ...options.authorizationParams, organization: options.organization },
      redirectUri,
    ),
  })
}

/** Options for {@link acceptOrgInvitation}. */
export interface AcceptOrgInvitationOptions {
  /** Organization ID (`org_...`) the invitation belongs to. */
  organization: string
  /** The invitation token from the invitation link. */
  invitation: string
  /**
   * Where to return after the invitation is accepted. Validated against the
   * app's own origin before being stored; an off-origin value is ignored
   * (open-redirect protection).
   */
  returnTo?: string
  /** Extra authorization parameters to forward. */
  authorizationParams?: AuthorizationParameters
}

/**
 * Starts the login flow for accepting an organization invitation. Pass the
 * `organization` and `invitation` values extracted from the invitation link.
 *
 * Returns the Auth0 authorization URL; the caller issues the redirect. Auth0
 * accepts the invitation, adds the user to the org, and returns org-scoped
 * tokens.
 *
 * @example
 * ```ts
 * // invitation link: /invite?organization=org_abc&invitation=inv_xyz
 * const url = await acceptOrgInvitation(auth0, { organization, invitation })
 * throw redirect({ href: url.toString() })
 * ```
 */
export async function acceptOrgInvitation(
  auth0: Auth0Instance,
  options: AcceptOrgInvitationOptions,
): Promise<URL> {
  assertNonEmpty(options.organization, 'organization')
  assertNonEmpty(options.invitation, 'invitation')
  const { request, redirectUri } = resolvePerRequestRedirect(auth0)
  return auth0.client.startInteractiveLogin({
    appState: toSafeAppState(auth0.config.appBaseUrl, options.returnTo, request),
    authorizationParams: perRequestAuthorizationParams(
      {
        ...options.authorizationParams,
        organization: options.organization,
        invitation: options.invitation,
      },
      redirectUri,
    ),
  })
}
