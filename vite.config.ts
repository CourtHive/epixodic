import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv, type Plugin } from 'vite';
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

export default ({ mode }) => {
  // Load app-level env vars to node-level env vars.
  process.env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  const BASE_URL = (process.env.BASE_URL && `/${process.env.BASE_URL}/`) || '';

  return defineConfig({
    server: {
      port: 5182,
    },
    build: { sourcemap: true },
    plugins: [svelte(), emitVersionJson()],
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
