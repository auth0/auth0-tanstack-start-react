import { defineConfig } from 'tsup'

// One package, five independently tree-shakeable entry points.
// Each sub-path is its own bundle so client code never pulls in server code
// (and vice-versa) — the bundle boundary is enforced by the exports map.
export default defineConfig([
  {
    entry: {
      'client/index': 'src/client/index.ts',
      'server/index': 'src/server/index.ts',
      // Dedicated minimal entry for the request middleware. Its only static
      // import is `createMiddleware` (client-safe); all server-only work is
      // lazy-loaded inside the handler. Importing THIS (not the /server barrel)
      // from a client-compiled file like `start.ts` never pulls in node-only
      // code (start-server-core / node:async_hooks).
      'server/middleware': 'src/server/request-middleware.ts',
      'testing/index': 'src/testing/index.ts',
      'errors/index': 'src/errors/index.ts',
      'types/index': 'src/types/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    // Peers and the foundational SDK are externalized, never inlined.
    external: [
      'react',
      'react-dom',
      '@tanstack/react-router',
      '@tanstack/react-start',
      '@tanstack/start-server-core',
      '@auth0/auth0-server-js',
    ],
  },
])
