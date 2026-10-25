import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { noLiveReplayImport } from './scripts/eslint-rules/no-live-replay-import.js';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    plugins: { vajra: { rules: { 'no-live-replay-import': noLiveReplayImport } } },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/sim/**',
                '**/src/sim/**',
                '!**/sim/index.js',
                '!**/sim/index.ts',
                '!**/sim/index',
              ],
              message: 'src/app may import from src/sim ONLY via src/sim/index.ts.',
            },
          ],
        },
      ],
      'vajra/no-live-replay-import': 'error',
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'performance',
          message: 'Do not use performance in src/sim. Use tick counter for simulation time.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Math.random is forbidden in src/sim. Use seeded Rng.',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'Date.now is forbidden in src/sim. Use tick counter.',
        },
        {
          selector: "MemberExpression[object.name='performance'][property.name='now']",
          message: 'performance.now is forbidden in src/sim. Use tick counter.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'new Date() is forbidden in src/sim. Simulation time is deterministic.',
        },
        {
          selector:
            "MemberExpression[object.name='Math'][property.name=/^(sin|cos|tan|atan|atan2|exp|log|pow|hypot)$/]",
          message:
            'Cross-engine non-deterministic Math functions (sin, cos, tan, atan, atan2, exp, log, pow, hypot) are forbidden in src/sim. Use dmath.ts.',
        },
        {
          selector: "BinaryExpression[operator='**']",
          message:
            'Exponentiation operator (**) is forbidden in src/sim due to cross-engine discrepancies. Use multiplication or deterministic helpers.',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: 'Exponentiation operator (**=) is forbidden in src/sim.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*/app/*', '**/app/**', '../*app/**', '../app/**'],
              message: 'src/sim must never import from src/app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/sim/core/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Math.random is forbidden in src/sim. Use seeded Rng.',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'Date.now is forbidden in src/sim. Use tick counter.',
        },
        {
          selector: "MemberExpression[object.name='performance'][property.name='now']",
          message: 'performance.now is forbidden in src/sim. Use tick counter.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'new Date() is forbidden in src/sim. Simulation time is deterministic.',
        },
        {
          selector:
            "MemberExpression[object.name='Math'][property.name=/^(sin|cos|tan|atan|atan2|exp|log|pow|hypot)$/]",
          message:
            'Cross-engine non-deterministic Math functions (sin, cos, tan, atan, atan2, exp, log, pow, hypot) are forbidden in src/sim. Use dmath.ts.',
        },
        {
          selector: "BinaryExpression[operator='**']",
          message:
            'Exponentiation operator (**) is forbidden in src/sim due to cross-engine discrepancies. Use multiplication or deterministic helpers.',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: 'Exponentiation operator (**=) is forbidden in src/sim.',
        },
        {
          selector: "CallExpression[callee.name='setTimeout']",
          message: 'setTimeout is forbidden in simulation core.',
        },
        {
          selector: "CallExpression[callee.name='setInterval']",
          message: 'setInterval is forbidden in simulation core.',
        },
      ],
    },
  }
);
