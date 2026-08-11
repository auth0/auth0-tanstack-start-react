import { auth0Server } from '@auth0/auth0-tanstack-start-react/server'

// The single Auth0 instance for this app. Reads configuration from environment
// variables (AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET,
// APP_BASE_URL). See .env.example.
export const auth0 = auth0Server()
