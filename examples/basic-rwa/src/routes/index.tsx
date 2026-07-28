import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth0, SignedIn, SignedOut, useLogin } from '@auth0/auth0-tanstack-start-react/client'
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Server,
  Building2,
  ArrowRight,
} from 'lucide-react'
import { Badge, Button, Card } from '../components/ui'

export const Route = createFileRoute('/')({ component: Home })

const FEATURES = [
  {
    icon: <Lock className="size-5" />,
    title: 'Route guards',
    body: 'Protect routes server-side with requireAuth / requireOrg in beforeLoad.',
  },
  {
    icon: <KeyRound className="size-5" />,
    title: 'Server-side tokens',
    body: 'Read access tokens on the server with getAccessToken. Tokens never reach the browser.',
  },
  {
    icon: <Server className="size-5" />,
    title: 'Server middleware',
    body: 'auth0Middleware handles /auth/* and attaches the session to every request.',
  },
  {
    icon: <Building2 className="size-5" />,
    title: 'Organizations',
    body: 'Read the active org with useOrg, and guard routes by organization with requireOrg.',
  },
]

function Home() {
  const { isAuthenticated } = useAuth0()
  const login = useLogin()

  return (
    <div className="space-y-12">
      <section className="text-center">
        <Badge tone="indigo">
          <ShieldCheck className="size-3.5" />
          Regular Web App · server-rendered
        </Badge>
        <h1 className="mx-auto mt-4 max-w-2xl text-balance text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Auth0 authentication for TanStack Start
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-gray-500">
          A live demo of{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
            @auth0/auth0-tanstack-start-react
          </code>
          . Auth state is resolved on the server before the page is sent — no loading flash.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <SignedOut>
            <Button onClick={() => login('/dashboard')}>
              Log in to try it <ArrowRight className="size-4" />
            </Button>
          </SignedOut>
          <SignedIn>
            <Link to="/dashboard">
              <Button>
                Open the dashboard <ArrowRight className="size-4" />
              </Button>
            </Link>
          </SignedIn>
        </div>

        <p className="mt-4 text-sm text-gray-400">
          You are currently{' '}
          <span className="font-medium text-gray-600">
            {isAuthenticated ? 'signed in' : 'signed out'}
          </span>
          .
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title} icon={f.icon} title={f.title} description={f.body} />
        ))}
      </section>
    </div>
  )
}
