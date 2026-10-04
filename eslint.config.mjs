// eslint.config.mjs
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      sonarjs,
    },
    rules: {
      // Reasonable TS baseline (you can tighten later)
      // `_`-prefix marks a deliberately-unused binding. `argsIgnorePattern` alone only covers
      // function parameters, so the same convention failed on a destructured binding
      // (`const { point: _omit, ...rest } = update` — the omit-a-key idiom). `ignoreRestSiblings`
      // is the option built for that idiom; `varsIgnorePattern` extends `_` to plain locals.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // SonarJS recommended rules
      ...sonarjs.configs.recommended.rules,
      'sonarjs/cognitive-complexity': ['warn', 30],

      // Disabled sonarjs v4 rules — intentional patterns in this codebase
      'sonarjs/void-use': 'off', // Svelte 5 `void version` reactive dependency idiom
      'sonarjs/no-nested-conditional': 'off', // nested ternaries are used throughout
      'sonarjs/todo-tag': 'off', // TODOs are tracked, not lint errors
      'sonarjs/no-commented-code': 'off', // commented code retained intentionally
      'sonarjs/no-alphabetical-sort': 'off', // .sort() on string arrays is correct
      'sonarjs/prefer-regexp-exec': 'off', // .match() is fine for simple patterns
      'sonarjs/argument-type': 'off', // false positives on .includes() with string arrays
      // Redundant with @typescript-eslint/no-unused-vars above, which is the authoritative
      // rule here because it honours this repo's `_`-prefix / rest-sibling conventions.
      // Unused bindings are still caught — and now actually gate, since `pnpm lint` runs
      // --max-warnings 0, which promotes that rule's `warn` to a build failure.
      'sonarjs/no-unused-vars': 'off',
    },
  },
];
