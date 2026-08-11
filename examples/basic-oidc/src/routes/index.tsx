import { createFileRoute, Link } from '@tanstack/react-router'
import {
  SignedIn,
  SignedOut,
  useLogin,
} from '@auth0/auth0-tanstack-start-react/client'
import { ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Badge, Button, Card } from '../components/ui'

export const Route = createFileRoute('/')({ component: Home })

const STEPS = [
  <>
    Create an Auth0 <strong>Regular Web Application</strong> and copy its domain,
    client ID, and client secret into <code>.env</code> (see{' '}
    <code>.env.example</code>).
  </>,
  <>
    In the application settings, add{' '}
    <code>http://localhost:3000/auth/callback</code> to{' '}
    <strong>Allowed Callback URLs</strong> and{' '}
    <code>http://localhost:3000</code> to <strong>Allowed Logout URLs</strong>.
  </>,
  <>
    Run <code>npm run dev</code> and click <strong>Log in</strong> below. You are
    redirected to Auth0 Universal Login, then back to the protected dashboard.
  </>,
]

function Home() {
  const login = useLogin()

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <Badge tone="indigo">
          <ShieldCheck className="size-3.5" />
          Regular Web App · server-rendered
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Auth0 + TanStack Start
        </h1>
        <p className="text-gray-500">
          A minimal demo of{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
            @auth0/auth0-tanstack-start-react
          </code>
          . Auth state resolves on the server before the page is sent.
        </p>
      </header>

      <Card title="How to test this example">
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-600">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                {i + 1}
              </span>
              <span className="leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex items-center gap-3">
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
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="size-4" />
            Signed in
          </span>
        </SignedIn>
      </div>
    </div>
  )
}
