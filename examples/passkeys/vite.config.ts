import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    // This example consumes the SDK via `file:../..` (a symlink into the repo).
    // Dedupe these so Vite always resolves a single copy from THIS app, even
    // though the linked SDK has its own node_modules. This avoids duplicate
    // React / TanStack instances that would break SSR hydration.
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-router',
      '@tanstack/react-start',
    ],
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    // Fail fast if 3000 is taken instead of silently falling back to another
    // port, which would break the registered Auth0 callback URL.
    strictPort: true,
    // Passkeys require a custom domain (see the home page), so this app is
    // reached through a host other than localhost, often via an HTTPS tunnel.
    // Vite's dev server rejects unknown hosts by default; allow any host here so
    // you do not have to hardcode your specific domain. This is a local dev
    // convenience only, not something to ship in a real app.
    allowedHosts: true,
  },
})

export default config
