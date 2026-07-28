import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  requireAuth,
  useUser,
  useAuth0,
  useOrg,
} from '@auth0/auth0-tanstack-start-react/client'
import {
  Server,
  UserRound,
  Building2,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { Badge, Button, Card, CodeBlock } from '../components/ui'
import { getProtectedMessage } from '../server-fns'

export const Route = createFileRoute('/dashboard')({
  // Protected server-side: unauthenticated users are redirected to /auth/login
  // before any HTML is sent.
  beforeLoad: requireAuth({ returnTo: '/dashboard' }),
  component: Dashboard,
})

function Dashboard() {
  const user = useUser()
  const { isAuthenticated } = useAuth0()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Protected by <code className="text-xs">requireAuth()</code>. Try the SDK features below.
          </p>
        </div>
        <Badge tone="green">
          <CheckCircle2 className="size-3.5" />
          {isAuthenticated ? 'Authenticated' : 'Unknown'}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProtectedCallCard />
        <OrgCard />
      </div>

      <ProfileCard user={user} />
    </div>
  )
}

function ProtectedCallCard() {
  const callServer = useServerFn(getProtectedMessage)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCall() {
    setLoading(true)
    setError(null)
    try {
      setResult(await callServer())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      icon={<Server className="size-5" />}
      title="Call a protected server function"
      description="Guarded with requireAuthMiddleware on the server."
    >
      <Button onClick={handleCall} disabled={loading} variant="secondary">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Server className="size-4" />}
        Call server function
      </Button>
      {result != null && <CodeBlock>{JSON.stringify(result, null, 2)}</CodeBlock>}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </Card>
  )
}

function OrgCard() {
  const org = useOrg()
  return (
    <Card
      icon={<Building2 className="size-5" />}
      title="Organization"
      description="useOrg() reads the org_id / org_name claims."
    >
      {org ? (
        <CodeBlock>{JSON.stringify(org, null, 2)}</CodeBlock>
      ) : (
        <p className="text-sm text-gray-500">
          No organization in this session. Log in through an Auth0 Organization to populate it.
        </p>
      )}
    </Card>
  )
}

function ProfileCard({ user }: { user: ReturnType<typeof useUser> }) {
  return (
    <Card
      icon={<UserRound className="size-5" />}
      title="User profile"
      description="The decoded ID-token claims for the current user."
    >
      <CodeBlock>{JSON.stringify(user, null, 2)}</CodeBlock>
    </Card>
  )
}
