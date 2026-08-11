import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { auth0RouterContext } from '@auth0/auth0-tanstack-start-react/client'
import type { Auth0RouterContext } from '@auth0/auth0-tanstack-start-react/types'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  auth0: Auth0RouterContext
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Seed context.auth0 with the SDK sentinel; auth0BeforeLoad replaces it
    // with the real (server-resolved) auth state at runtime.
    context: { auth0: auth0RouterContext } satisfies RouterContext,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
