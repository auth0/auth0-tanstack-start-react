// Server functions for the passkey flow. Steps 1 and 3 of the WebAuthn ceremony
// run on the server (they need the confidential client's secret); step 2 (the
// browser credential ceremony) runs in the component.
//
// Named `*.functions.ts` (NOT `*.server.ts`) on purpose: this module is imported
// by the route component, which is part of the client route tree. TanStack Start
// import-protection forbids a client-reachable module from importing a
// `*.server.*` file. `createServerFn` compiles to a client RPC stub, and the
// `.handler()` body only runs on the server, so the Auth0 import is safe here.
import { createServerFn } from '@tanstack/react-start'
import {
  passkeyRegister,
  passkeyChallenge,
  passkeyGetToken,
} from '@auth0/auth0-tanstack-start-react/server'
import { auth0 } from '#/auth.server'

/**
 * Logs the start/outcome of a passkey step to the server console.
 *
 * On error we log only the message plus `cause.error` / `cause.error_description`.
 * We deliberately do NOT log the whole `cause`: on an `mfa_required` failure the
 * foundation nests a live `mfa_token` there, and this example gets copied into
 * real apps whose logs flow to aggregators. Never log the full error object.
 */
async function logStep<T>(step: string, run: () => Promise<T>): Promise<T> {
  console.log(`[passkey] ${step} → start`)
  try {
    const result = await run()
    console.log(`[passkey] ${step} → ok`)
    return result
  } catch (error) {
    const cause = (error as { cause?: { error?: unknown; error_description?: unknown } })
      ?.cause
    console.error(`[passkey] ${step} → error`, {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      // Only the safe, named fields — not the raw cause (which may hold mfa_token).
      causeError: cause?.error,
      causeErrorDescription: cause?.error_description,
    })
    throw error
  }
}

/** Step 1 (new user): request a signup challenge for the given email. */
export const registerChallengeFn = createServerFn()
  .inputValidator((email: string) => email)
  .handler(({ data: email }) =>
    logStep('registerChallenge', () => passkeyRegister(auth0, { email })),
  )

/** Step 1 (existing user): request a login challenge. */
export const loginChallengeFn = createServerFn().handler(() =>
  logStep('loginChallenge', () => passkeyChallenge(auth0)),
)

/**
 * Step 3: exchange the serialized WebAuthn credential for tokens + a session.
 * The session is written to the cookie server-side, so nothing needs to be
 * returned to the client (and the token result must not be sent to it).
 */
export const getTokenFn = createServerFn()
  .inputValidator((d: Parameters<typeof passkeyGetToken>[1]) => d)
  .handler(async ({ data }) => {
    await logStep('getToken', () => passkeyGetToken(auth0, data))
  })
