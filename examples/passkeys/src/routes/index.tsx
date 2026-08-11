import { useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SignedIn, SignedOut, useUser } from '@auth0/auth0-tanstack-start-react/client'
import {
  KeyRound,
  Fingerprint,
  UserRound,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { Badge, Button, Card, CodeBlock, TextInput } from '../components/ui'
import {
  registerChallengeFn,
  loginChallengeFn,
  getTokenFn,
} from '#/passkey.functions'

export const Route = createFileRoute('/')({ component: Home })

// --- WebAuthn <-> SDK serialization -----------------------------------------
// The SDK exchanges binary WebAuthn fields as base64url strings, but the browser
// API works in ArrayBuffers. These bridge the two.

function b64urlToBuf(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  // Return the ArrayBuffer (not the Uint8Array view) so the value is typed as a
  // concrete BufferSource that the WebAuthn API accepts.
  return bytes.buffer
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Serialize a browser PublicKeyCredential into the base64url shape the SDK expects. */
function serializeCredential(cred: PublicKeyCredential) {
  const response = cred.response as AuthenticatorAttestationResponse &
    AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: bufToB64url(response.clientDataJSON),
      ...(response.attestationObject && {
        attestationObject: bufToB64url(response.attestationObject),
      }),
      ...(response.authenticatorData && {
        authenticatorData: bufToB64url(response.authenticatorData),
      }),
      ...(response.signature && { signature: bufToB64url(response.signature) }),
      ...(response.userHandle && { userHandle: bufToB64url(response.userHandle) }),
    },
  }
}

// --- Prerequisites shown on the page ----------------------------------------

const PREREQS: Array<ReactNode> = [
  <>
    An Auth0 <strong>custom domain</strong>. Passkeys need a real Relying Party
    ID, which Auth0 only allows with a custom domain, so plain{' '}
    <code>localhost</code> will not work.
  </>,
  <>
    A <strong>Relying Party ID</strong> set (Tenant Settings) to the registrable
    root shared by your Auth0 custom domain and this app's origin. For example,{' '}
    <code>acmetest.org</code> for <code>app.acmetest.org</code>.
  </>,
  <>
    Serve this app over <strong>HTTPS</strong> on a domain under that RP ID (a
    secure context, for example via a tunnel). WebAuthn will not run over plain
    HTTP or on a mismatched origin.
  </>,
  <>
    The tenant's <strong>passkey feature flags</strong> enabled (native
    passkeys + RP ID). Ask your Auth0 admin if unsure.
  </>,
  <>
    Add <code>https://&lt;your-app-domain&gt;/auth/callback</code> to{' '}
    <strong>Allowed Callback URLs</strong> in the application settings.
  </>,
]

function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <Badge tone="indigo">
          <KeyRound className="size-3.5" />
          Passkeys · WebAuthn
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Passkeys with Auth0 + TanStack Start
        </h1>
        <p className="text-gray-500">
          Register and sign in with a passkey. The challenge and token exchange
          run server-side through a confidential client; the WebAuthn ceremony
          runs in the browser.
        </p>
      </header>

      <SignedOut>
        <PasskeyForms />
      </SignedOut>
      <SignedIn>
        <SessionCard />
      </SignedIn>

      <Card title="How to test passkeys">
        <ol className="space-y-3">
          {PREREQS.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-600">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                {i + 1}
              </span>
              <span className="leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function PasskeyForms() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<
    { kind: 'idle' | 'busy' } | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const busy = status.kind === 'busy'

  async function handleRegister() {
    setStatus({ kind: 'busy' })
    try {
      const { authSession, authnParamsPublicKey } = await registerChallengeFn({
        data: email,
      })
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: b64urlToBuf(authnParamsPublicKey.challenge),
          rp: authnParamsPublicKey.rp,
          user: {
            id: b64urlToBuf(authnParamsPublicKey.user.id),
            name: authnParamsPublicKey.user.name,
            displayName: authnParamsPublicKey.user.displayName,
          },
          pubKeyCredParams:
            authnParamsPublicKey.pubKeyCredParams as PublicKeyCredentialParameters[],
          authenticatorSelection:
            authnParamsPublicKey.authenticatorSelection as AuthenticatorSelectionCriteria,
          timeout: authnParamsPublicKey.timeout,
        },
      })) as PublicKeyCredential | null
      if (!credential) throw new Error('No credential was created.')

      await getTokenFn({
        data: { authSession, credential: serializeCredential(credential) },
      })
      onSuccess()
    } catch (err) {
      onError(err)
    }
  }

  async function handleLogin() {
    setStatus({ kind: 'busy' })
    try {
      const { authSession, authnParamsPublicKey } = await loginChallengeFn()
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: b64urlToBuf(authnParamsPublicKey.challenge),
          rpId: authnParamsPublicKey.rpId,
          timeout: authnParamsPublicKey.timeout,
          userVerification:
            authnParamsPublicKey.userVerification as UserVerificationRequirement,
        },
      })) as PublicKeyCredential | null
      if (!credential) throw new Error('No credential was returned.')

      await getTokenFn({
        data: { authSession, credential: serializeCredential(credential) },
      })
      onSuccess()
    } catch (err) {
      onError(err)
    }
  }

  function onSuccess() {
    // Reload so the router picks up the freshly written session cookie and the
    // page swaps to the signed-in view.
    window.location.assign('/')
  }

  function onError(err: unknown) {
    setStatus({
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Card
        icon={<Fingerprint className="size-5" />}
        title="Register a passkey"
        description="Create a new user and enroll a passkey."
      >
        <div className="space-y-3">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={busy}
          />
          <Button onClick={handleRegister} disabled={busy || !email}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Fingerprint className="size-4" />
            )}
            Register passkey
          </Button>
        </div>
      </Card>

      <Card
        icon={<KeyRound className="size-5" />}
        title="Log in with a passkey"
        description="Sign in an existing user with their passkey."
      >
        <Button variant="secondary" onClick={handleLogin} disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          Log in with passkey
        </Button>
      </Card>

      {status.kind === 'error' && (
        <p className="sm:col-span-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {status.message}
        </p>
      )}
    </div>
  )
}

function SessionCard() {
  const user = useUser()
  return (
    <Card
      icon={<UserRound className="size-5" />}
      title="Session established"
      description="The passkey flow signed you in. These are your ID-token claims."
    >
      <Badge tone="green">
        <CheckCircle2 className="size-3.5" />
        Signed in
      </Badge>
      <CodeBlock>{JSON.stringify(user, null, 2)}</CodeBlock>
    </Card>
  )
}
