import { createServerFn } from '@tanstack/react-start'

/**
 * A protected server function, callable from client components via RPC.
 *
 * Why this file is NOT named `*.server.ts` and statically imports nothing
 * server-only: it is imported by `dashboard.tsx`, which is part of the client
 * route tree. TanStack Start's import-protection forbids a client-reachable
 * module from statically importing server-only code. `createServerFn` compiles
 * to a client RPC stub; the real logic + the Auth0 instance are loaded lazily
 * INSIDE `.handler()` (which only runs on the server) via a dynamic import.
 */
export const getProtectedMessage = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { protectedMessage } = await import('./protected.server')
    return protectedMessage()
  },
)
