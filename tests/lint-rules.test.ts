import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

describe('ESLint Negative Rules Verification (src/sim & src/sim/core)', { timeout: 20000 }, () => {
  const eslint = new ESLint();

  async function lintSnippet(code: string, filePath: string) {
    const [result] = await eslint.lintText(code, { filePath });
    return result?.messages ?? [];
  }

  describe('src/sim/** banned non-deterministic math & operators', () => {
    const simPath = 'src/sim/core/math-lint-test.ts';

    it('reports error on Math.sin/cos/tan/atan/atan2/exp/log/pow/hypot', async () => {
      const mathFns = ['sin', 'cos', 'tan', 'atan', 'atan2', 'exp', 'log', 'pow', 'hypot'];
      for (const fn of mathFns) {
        const messages = await lintSnippet(`export const v = Math.${fn}(1);`, simPath);
        expect(
          messages.some((m) => m.message.includes('Cross-engine non-deterministic Math functions')),
          `Expected Math.${fn} to be reported as forbidden`
        ).toBe(true);
      }
    });

    it('reports error on ** exponentiation operator', async () => {
      const messages = await lintSnippet('export const v = 2 ** 3;', simPath);
      expect(messages.some((m) => m.message.includes('Exponentiation operator (**) is forbidden'))).toBe(true);
    });

    it('reports error on **= exponentiation assignment operator', async () => {
      const messages = await lintSnippet('let x = 2; x **= 3;', simPath);
      expect(messages.some((m) => m.message.includes('Exponentiation operator (**=) is forbidden'))).toBe(true);
    });
  });

  describe('src/sim/core/** restrictions', () => {
    const corePath = 'src/sim/core/forbidden-test.ts';

    it('reports error on Math.random', async () => {
      const messages = await lintSnippet('export const r = Math.random();', corePath);
      expect(messages.some((m) => m.message.includes('Math.random is forbidden'))).toBe(true);
    });

    it('reports error on Date.now', async () => {
      const messages = await lintSnippet('export const t = Date.now();', corePath);
      expect(messages.some((m) => m.message.includes('Date.now is forbidden'))).toBe(true);
    });

    it('reports error on performance.now', async () => {
      const messages = await lintSnippet('export const p = performance.now();', corePath);
      expect(messages.some((m) => m.message.includes('performance.now is forbidden'))).toBe(true);
    });

    it('reports error on new Date()', async () => {
      const messages = await lintSnippet('export const d = new Date();', corePath);
      expect(messages.some((m) => m.message.includes('new Date() is forbidden'))).toBe(true);
    });

    it('reports error on setTimeout in core', async () => {
      const messages = await lintSnippet('setTimeout(() => {}, 10);', corePath);
      expect(messages.some((m) => m.message.includes('setTimeout is forbidden in simulation core'))).toBe(true);
    });

    it('reports error on setInterval in core', async () => {
      const messages = await lintSnippet('setInterval(() => {}, 10);', corePath);
      expect(messages.some((m) => m.message.includes('setInterval is forbidden in simulation core'))).toBe(true);
    });

    it('reports error on importing from src/app', async () => {
      const messages = await lintSnippet("import { App } from '../../app/App.js';", corePath);
      expect(messages.some((m) => m.message.includes('src/sim must never import from src/app'))).toBe(true);
    });
  });

  describe('src/sim/worker/** restrictions & permissions', () => {
    const workerPath = 'src/sim/worker/forbidden-test.ts';

    it('reports error on Math.random in worker', async () => {
      const messages = await lintSnippet('export const r = Math.random();', workerPath);
      expect(messages.some((m) => m.message.includes('Math.random is forbidden'))).toBe(true);
    });

    it('reports error on Date.now in worker', async () => {
      const messages = await lintSnippet('export const t = Date.now();', workerPath);
      expect(messages.some((m) => m.message.includes('Date.now is forbidden'))).toBe(true);
    });

    it('reports error on performance.now in worker', async () => {
      const messages = await lintSnippet('export const p = performance.now();', workerPath);
      expect(messages.some((m) => m.message.includes('performance.now is forbidden'))).toBe(true);
    });

    it('reports error on new Date() in worker', async () => {
      const messages = await lintSnippet('export const d = new Date();', workerPath);
      expect(messages.some((m) => m.message.includes('new Date() is forbidden'))).toBe(true);
    });

    it('reports error on importing from src/app in worker', async () => {
      const messages = await lintSnippet("import { App } from '../../app/App.js';", workerPath);
      expect(messages.some((m) => m.message.includes('src/sim must never import from src/app'))).toBe(true);
    });

    it('allows setTimeout and setInterval in worker runner', async () => {
      const messagesTimeout = await lintSnippet('setTimeout(() => {}, 10);', workerPath);
      expect(messagesTimeout.some((m) => m.message.includes('setTimeout is forbidden'))).toBe(false);

      const messagesInterval = await lintSnippet('setInterval(() => {}, 10);', workerPath);
      expect(messagesInterval.some((m) => m.message.includes('setInterval is forbidden'))).toBe(false);
    });
  });
});
