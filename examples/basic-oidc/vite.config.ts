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
    // port. The Auth0 Allowed Callback / Logout URLs are registered for
    // http://localhost:3000, so a drifting port would break the login redirect.
    strictPort: true,
  },
})

export default config
