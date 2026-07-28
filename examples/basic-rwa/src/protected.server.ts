import { getSession } from '@auth0/auth0-tanstack-start-react/server'
import { auth0 } from './auth.server'

/**
 * Server-only logic for the protected server function. Loaded exclusively via a
 * dynamic import from inside a `createServerFn().handler()` (see server-fns.ts),
 * so the `*.server.ts` filename and the server-only imports here never reach the
 * client bundle.
 *
 * Reads the session directly and throws if there is none — the manual
 * equivalent of `requireAuthMiddleware` for a hand-rolled server function.
 */
export async function protectedMessage() {
  const session = await getSession(auth0)
  if (!session) {
    throw new Error('Unauthorized')
  }
  const user = session.user
  return {
    message: `Hello ${user.name ?? user.email ?? user.sub} — this came from a protected server function.`,
    sub: user.sub,
    at: new Date().toISOString(),
  }
}
