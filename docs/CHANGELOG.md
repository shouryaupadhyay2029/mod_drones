# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - Phase 0: Deterministic Simulation Foundation

### Added
- **Core PRNG (`src/sim/core/rng.ts`)**:
  - `mulberry32` generator accepting number or string seeds (hashed with `xmur3`).
  - Methods: `next()`, `int()`, `pick()`, `chance()`, `fork()`, `getState()`, `setState()`.
  - Non-destructive stream forking for sub-modules.
- **Fixed-Step Clock (`src/sim/core/clock.ts`)**:
  - Fixed simulation step: `TICK_RATE = 20` Hz, `DT = 0.05`s.
- **World & Kinematics (`src/sim/core/world.ts`)**:
  - Stable entity management with incremental ID assignment.
  - Linear velocity step integration.
- **Command Dispatch & Event Logging (`src/sim/core/types.ts`, `src/sim/core/log.ts`)**:
  - Scheduled command queues with tick-exact execution.
  - Append-only event stream.
  - `SessionLog` tracking and `replay()` verification function.
- **Snapshot & Restore (`src/sim/core/engine.ts`)**:
  - Full serializable state capture surviving JSON roundtripping.
  - Engine restoration continuing deterministically from any tick.
- **State Hashing (`src/sim/core/hash.ts`)**:
  - Canonical state serialization with sorted keys and 1e-6 float rounding.
  - 53-bit collision-resistant `cyrb53` state hash.
- **Web Worker Harness (`src/sim/worker/protocol.ts`, `src/sim/worker/sim.worker.ts`, `src/app/simClient.ts`)**:
  - Fully typed async messaging protocol (`INIT`, `START`, `PAUSE`, `STEP_N`, `ENQUEUE`, `GET_STATE`).
  - Client interface with subscription to state updates.
- **System Check UI (`src/app/App.tsx`)**:
  - Trainee simulator banner with open-source parameter notice.
  - Real-time tick, entity count, state hash, and tick rate monitoring.
  - Interactive "Spawn test entity", "Verify replay", and "Verify snapshot" pass/fail checks.
- **Determinism Enforcement & ADR-001 (`docs/DECISIONS.md`)**:
  - ESLint rules prohibiting `Math.random`, `Date.now`, `performance.now`, `new Date()`, and timers in `src/sim`.
  - Independent `tsconfig.sim.json` enforcing pure ES2022 with zero DOM APIs.
- **Comprehensive Vitest Suite**:
  - 8 core acceptance test suites verifying all determinism, forking, replay, and snapshot criteria.
