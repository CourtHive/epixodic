import { svelte } from '@sveltejs/vite-plugin-svelte';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default ({ mode }) => {
  // Load app-level env vars to node-level env vars.
  process.env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  const BASE_URL = (process.env.BASE_URL && `/${process.env.BASE_URL}/`) || '';

  return defineConfig({
    build: { sourcemap: true },
    plugins: [svelte(), tsconfigPaths()],
    base: BASE_URL,
    resolve: {
      // Ensure all imports of tods-competition-factory resolve to the local
      // linked copy (CourtHive/factory) rather than a transitive copy in
      // another dependency's node_modules (e.g. scoringVisualizations).
      alias: {
        'tods-competition-factory': path.resolve(import.meta.dirname, 'node_modules/tods-competition-factory'),
      },
    },
  });
};
