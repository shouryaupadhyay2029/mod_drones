# Standing Repository Rules

## Project

- VAJRA is an offline browser-based counter-drone **training simulator** built with React, Vite, and strict TypeScript; tests use Vitest.
- Use generic illustrative parameters only. Do not add real weapon control, real-world specifications, military unit names, or insignia.
- Build UI changes on the existing VAJRA cream theme.

## Simulation boundary and determinism

- `src/sim` is pure TypeScript: no DOM or browser APIs; no `Math.random`, `Date.now`, `performance.now`, or `new Date`; no `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan`, `Math.atan2`, `Math.exp`, `Math.log`, `Math.pow`, or `Math.hypot`; no `**` operator.
- No timers in `src/sim/core`.
- The simulation runs at a fixed 20 Hz, uses seeded RNG, and records event-sourced `SessionLog` data. Snapshot/restore and replay must reproduce hashes.
- `src/app` may import simulation code only through `src/sim/index.ts`.
- The trainee view must never expose ground truth.

## Commands

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:sim`
- `npm run build`
- `npm run bench`
- `npm run test:targets` — calibration targets; this command may fail.

## Work process and reporting

- Make one local commit per item. Never push.
- Never delete user files.
- Never loosen an assertion or call an unmet target PASS. Never tune scenarios or constants to the bot.
- Reports must reference committed benchmark files and state the scoring version.
- List every unrequested change under **Deviations**.
- Paste raw command output. If something cannot run (for example, screenshots without Chrome), say so; never fake results.
- Keep `docs/PROGRESS.md` current: append a dated section for each future task with commit hashes, work completed, and open issues.
