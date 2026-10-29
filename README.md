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
- `npm run preview`: Serve the production build locally to test Service Worker and offline caching.
- `npm run build`: Typecheck and produce the production Vite bundle.
- `npm test`: Run all acceptance test suites via Vitest.
- `npm run lint`: Run ESLint including determinism enforcement checks on `src/sim`.
- `npm run typecheck`: Run full TypeScript checks.
- `npm run typecheck:sim`: Typecheck `src/sim` strictly under `lib: ["ES2022"]` (no DOM).
- `npm run test:targets`: Run calibration targets suite.
- `npm run bench`: Run full benchmarking suite across bots, scenarios, and commander raids.

---

## Run offline / install as PWA

VAJRA is designed as an offline-first Progressive Web Application (PWA).

### Running Offline
1. **Build and Preview**:
   ```bash
   npm run build
   npm run preview
   ```
2. **First Load**: Open `http://localhost:5173/` in your browser. The Service Worker automatically precaches all application shell assets, scripts, stylesheets, and lightweight WebP backgrounds (~1.09 MB total).
3. **Go Offline**: Toggle your browser or device into Offline mode (e.g. Chrome DevTools Network -> Offline, or disconnect internet).
4. **Reload & Play**: Reload the page. The app loads instantly from cache. Missions execute inside local Web Workers, and all AAR session logs persist into local IndexedDB (`vajra-cuas`) without network connectivity.

### Installing as PWA
- In Chrome, Edge, or mobile browsers, click the **Install App** icon in the address bar or select **Install VAJRA** from the browser menu.
- The app installs as a standalone desktop/mobile window with native framing, cream theme branding (`#ded7ca`), and custom maskable icons.
