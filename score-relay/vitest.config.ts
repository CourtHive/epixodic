import { defineConfig } from 'vitest/config';

// Crowd-storage integration tests share the `crowd` Postgres schema and
// TRUNCATE the sessions table between tests, so test files cannot run
// in parallel against each other. Force a single fork to serialize.
export default defineConfig({
  test: {
    // Vitest 4: pool-specific options live alongside `pool` at top level.
    pool: 'forks',
    forks: { singleFork: true },
    // Also serialize within a fork so the 4 crowd test files share the
    // `crowd` schema cleanly without TRUNCATE racing.
    fileParallelism: false,
  },
});
