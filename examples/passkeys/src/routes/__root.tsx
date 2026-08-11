import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import {
  Auth0Provider,
  auth0BeforeLoad,
  SignedIn,
  SignedOut,
  useUser,
  useLogout,
} from '@auth0/auth0-tanstack-start-react/client'
import { LogOut, KeyRound } from 'lucide-react'

import type { RouterContext } from '../router'
import { Button } from '../components/ui'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<RouterContext>()({
  // Populates context.auth0 for the whole route tree. On the server it reads the
  // session auth0Middleware resolved; on the client it reads the hydrated cache.
  beforeLoad: auth0BeforeLoad(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Passkeys · Auth0 + TanStack Start' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-3xl font-bold text-gray-900">404</h1>
      <p className="mt-2 text-gray-500">That page does not exist.</p>
      <Link
        to="/"
        className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
      >
        Back home
      </Link>
    </div>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-gray-50">
      <head>
        <HeadContent />
      </head>
      <body className="h-full text-gray-900 antialiased">
        <Auth0Provider>
          <div className="flex min-h-full flex-col">
            <TopNav />
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
              {children}
            </main>
            <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
              Built with{' '}
              <span className="font-medium">
                @auth0/auth0-tanstack-start-react
              </span>
            </footer>
          </div>
        </Auth0Provider>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

function TopNav() {
  const user = useUser()
  const logout = useLogout()

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-2 px-6">
        <Link to="/" className="mr-2 flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
            <KeyRound className="size-5" />
          </span>
          <span className="hidden sm:inline">Passkeys · TanStack Start</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <SignedIn>
            <div className="flex items-center gap-2">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt=""
                  className="size-8 rounded-full ring-1 ring-gray-200"
                />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden text-sm text-gray-700 sm:inline">
                {user?.name ?? user?.email ?? user?.sub}
              </span>
              <Button variant="secondary" onClick={() => logout()}>
                <LogOut className="size-4" />
                Log out
              </Button>
            </div>
          </SignedIn>
          <SignedOut>
            <span className="text-sm text-gray-400">Not signed in</span>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
