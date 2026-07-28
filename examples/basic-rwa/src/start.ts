import { createStart } from '@tanstack/react-start'
// Import from the dedicated /server/middleware subpath (NOT the /server barrel):
// it has a minimal, client-safe static graph, so this client-compiled file never
// pulls in server-only / node-only code.
import { auth0Middleware } from '@auth0/auth0-tanstack-start-react/server/middleware'

// auth0Middleware() takes no server instance — it reads config from env and loads
// all server-only work lazily inside its handler — so this client-compiled file
// stays free of server-only imports (satisfies TanStack Start import-protection).
//
// It intercepts /auth/* (login, callback, logout, profile) and, on every other
// request, decrypts the session cookie and attaches context.auth0.
export const startInstance = createStart(() => ({
  requestMiddleware: [auth0Middleware()],
}))
