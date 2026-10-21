# MoD Drone & Counter-Drone Threat Simulation Trainer

> **TRAINING SIMULATION — generic open-source parameters only.**
> This is an offline, browser-based training simulator designed for asset defense training against drones and swarms (detect, classify, decide, get scored, review). It does not contain or interface with real weapon control systems or classified military specifications.

---

## Phase 0: Deterministic Foundation

Phase 0 implements the pure, deterministic simulation core, event logging, snapshotting/restoring, session replay verification, Web Worker isolation, and a System Check control dashboard.

### Core Principles
- **100% Determinism**: Same seed + same command sequence produces bit-identical states across any run.
- **Fixed-Step Clock**: Runs at 20 Hz (`DT = 0.05s`). Tick count is integer-only; wall-clock time is never used inside the simulation core.
- **Pure Simulation Layer**: `src/sim` has zero dependencies on React, the DOM, or browser timing APIs.
- **State Hashing & Replay Verification**: Real-time canonical state hashing with float rounding and full session replaying to verify deterministic parity.

---

## Project Structure

```text
src/
  sim/                      <- Pure simulation logic (ES2022 only, no DOM)
    core/
      rng.ts                <- Mulberry32 PRNG with xmur3 seeding & non-destructive forking
      hash.ts               <- Canonical state serialization & cyrb53 state hashing
      clock.ts              <- Fixed-step clock constants (TICK_RATE = 20, DT = 0.05)
      types.ts              <- Command, Event, Entity, WorldState, Snapshot types
      world.ts              <- World container and linear kinematics
      engine.ts             <- Simulation Engine (step, snapshot, restore)
      log.ts                <- SessionLog builder & deterministic replay function
    worker/
      protocol.ts           <- Typed message protocol between main thread and worker
      sim.worker.ts         <- Web Worker host running Engine
    index.ts                <- Public export interface
  app/
    main.tsx                <- React entrypoint
    App.tsx                 <- System Check verification dashboard
    simClient.ts            <- Main-thread worker client
  shared/
    version.ts              <- Shared version constants (LOG_FORMAT_VERSION = 1)
docs/
  ARCHITECTURE.md           <- Architectural overview & component designs
  DECISIONS.md              <- Architectural Decision Records (ADR-001 Determinism)
  CHANGELOG.md              <- Phase release history
tsconfig.json              <- Full workspace TypeScript configuration
tsconfig.sim.json          <- Simulation typecheck configuration (ES2022 only, no DOM)
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Installation
```bash
npm install
```

### Available Scripts
- `npm run dev`: Launch the Vite development server with the System Check page.
- `npm run build`: Typecheck and produce the production Vite bundle.
- `npm test`: Run all acceptance test suites via Vitest.
- `npm run lint`: Run ESLint including determinism enforcement checks on `src/sim`.
- `npm run typecheck`: Run full TypeScript checks.
- `npm run typecheck:sim`: Typecheck `src/sim` strictly under `lib: ["ES2022"]` (no DOM).
