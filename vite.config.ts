import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { version as pkgVersion } from './package.json';

// Emit dist/version.json at build time so /epixodic/version.json returns
// real JSON instead of the SPA-fallback index.html. The /services
// landing page on courthive.net fetches this to display the
// currently-deployed epixodic build. Same shape as TMX + courthive-console.
const BUILD_COMMIT = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();
const emitVersionJson = (): Plugin => ({
  name: 'epixodic-emit-version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source:
        JSON.stringify({ version: pkgVersion, commit: BUILD_COMMIT, builtAt: new Date().toISOString() }) + '\n',
    });
  },
});

// The service-worker source in public/sw.js carries a literal
// `__EPIXODIC_BUILD_COMMIT__` token that Vite would otherwise copy
// verbatim into dist/sw.js (anything in public/ is shipped as-is).
// This post-build hook rewrites that token to the actual commit
// short-SHA so the SW's CACHE_VERSION changes every build and the
// activate-time sweep can evict the previous cache. The SW bytes also
// change between builds, which forces browsers to install + activate
// the new worker instead of clinging to the old one indefinitely.
const stampServiceWorkerVersion = (): Plugin => ({
  name: 'epixodic-stamp-sw-version',
  apply: 'build',
  writeBundle(options) {
    const outDir = options.dir ?? 'dist';
    const swPath = path.join(outDir, 'sw.js');
    const original = readFileSync(swPath, 'utf8');
    const stamped = original.replaceAll('__EPIXODIC_BUILD_COMMIT__', BUILD_COMMIT);
    if (stamped !== original) writeFileSync(swPath, stamped);
  },
});

export default ({ mode }) => {
  // Load app-level env vars to node-level env vars.
  process.env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  const BASE_URL = (process.env.BASE_URL && `/${process.env.BASE_URL}/`) || '';

  return defineConfig({
    server: {
      port: 5182,
    },
    build: { sourcemap: true },
    plugins: [svelte(), emitVersionJson(), stampServiceWorkerVersion()],
    base: BASE_URL,
    test: {
      exclude: ['e2e/**', '**/node_modules/**', 'score-relay/**'],
    },
    resolve: {
      tsconfigPaths: true,
      // Ensure all imports of tods-competition-factory resolve to the local
      // linked copy (CourtHive/factory) rather than a transitive copy in
      // another dependency's node_modules (e.g. scoringVisualizations).
      alias: {
        'tods-competition-factory': path.resolve(import.meta.dirname, 'node_modules/tods-competition-factory'),
      },
    },
  });
};
