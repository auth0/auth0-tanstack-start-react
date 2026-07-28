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
    // though the linked SDK has its own node_modules — avoids duplicate React /
    // TanStack instances that would break SSR hydration.
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-router',
      '@tanstack/react-start',
      '@tanstack/react-query',
    ],
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
