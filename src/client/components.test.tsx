import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { SignedIn, SignedOut, HasOrg, AuthReady, AuthLoading } from './components.js'
import { Auth0TestProvider } from '../testing/index.js'

function renderWith(
  ui: React.ReactNode,
  props: { user?: Record<string, unknown>; isLoading?: boolean } = {},
) {
  return render(
    createElement(Auth0TestProvider, { ...props, children: ui }),
  )
}

describe('SignedIn / SignedOut', () => {
  it('SignedIn renders only when authenticated', () => {
    renderWith(createElement(SignedIn, { children: 'in' }), {
      user: { sub: 'auth0|1' },
    })
    expect(screen.queryByText('in')).not.toBeNull()
  })

  it('SignedOut renders only when unauthenticated and resolved', () => {
    renderWith(createElement(SignedOut, { children: 'out' }))
    expect(screen.queryByText('out')).not.toBeNull()
  })

  it('SignedOut hides while loading', () => {
    renderWith(createElement(SignedOut, { children: 'out' }), {
      isLoading: true,
    })
    expect(screen.queryByText('out')).toBeNull()
  })
})

describe('HasOrg', () => {
  it('renders children on org match, fallback otherwise', () => {
    renderWith(
      createElement(HasOrg, { orgId: 'org_1', fallback: 'no', children: 'yes' }),
      { user: { sub: 'x', org_id: 'org_1' } },
    )
    expect(screen.queryByText('yes')).not.toBeNull()

    renderWith(
      createElement(HasOrg, { orgId: 'org_9', fallback: 'no', children: 'yes' }),
      { user: { sub: 'x', org_id: 'org_1' } },
    )
    expect(screen.queryByText('no')).not.toBeNull()
  })
})

describe('AuthReady / AuthLoading', () => {
  it('AuthReady renders when resolved, AuthLoading does not', () => {
    renderWith(createElement(AuthReady, { children: 'ready' }), {
      user: { sub: 'x' },
    })
    expect(screen.queryByText('ready')).not.toBeNull()
  })

  it('AuthLoading renders while loading, AuthReady does not', () => {
    renderWith(createElement(AuthLoading, { children: 'loading' }), {
      isLoading: true,
    })
    expect(screen.queryByText('loading')).not.toBeNull()

    renderWith(createElement(AuthReady, { children: 'ready' }), {
      isLoading: true,
    })
    expect(screen.queryByText('ready')).toBeNull()
  })
})
