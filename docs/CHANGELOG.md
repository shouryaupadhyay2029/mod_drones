# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - Phase 1B: Operator Console UI & Verification

### Added
- **Operator Console UI (`src/app/console/`)**:
  - `TopBar`: Mission clock, threat DEFCON badge, sim speed toggles (`1x`, `2x`, `4x`), and Autopilot driving `referenceOperator`.
  - `RadarScope` & `drawScope`: High-DPI HTML5 Canvas PPI scope with fading sweep wedge, range rings, effector rings (1000m gun, 1500m jammer), history trails, velocity vectors, and interactive plot selection.
  - `TrackTable` & `TrackDetail`: Tactical tracks table with hotkeys (`1`-`9`, `j`/`k`, `a`, `c`, `j`, `g`, `h`) and control panel with explicit disabled reasons.
  - `EffectorPanel` & `EventFeed`: Effector cooldown/target monitors and chronological event stream.
  - `DebriefScreen`: Post-mission score summary, breakdown, deductions, and timeline review with JSON copy.
  - `MissionSetup`: Scenario selection (`Dawn Intrusion`), custom seed input, and mission launcher.
  - `useMission`: Hook orchestrating worker lifecycle, command dispatch, and state synchronisation.
- **Worker Protocol Extensions (`src/sim/worker/protocol.ts`, `sim.worker.ts`)**:
  - `SET_SPEED` command supporting 1x, 2x, and 4x execution multipliers.
  - `ENQUEUE` command with optional `tick` parameter.
  - Streaming `VIEW` messages (at $\le 100$ms intervals and on discrete events).
  - Terminal `REPORT` messages containing the calculated `ScoreReport` and complete `SessionLog`.
- **ESLint UI Boundary Rule**:
  - Prohibits imports in `src/app` from `src/sim` except via the public entry barrel `src/sim/index.ts`.
- **Automated Verification Suites**:
  - `tests/geometry.test.ts`: Polar/pixel mapping, azimuth, ring radii, and contact picking.
  - `tests/worker-protocol.test.ts`: Deterministic headless worker lifecycle verification without wall-clock sleeps, scoring 100 on seed 1 and confirming absence of ground-truth leaks.
  - `tests/components.test.tsx`: Component unit tests for TopBar, TrackTable, TrackDetail, and DebriefScreen.
  - `scripts/screenshot-console.mjs`: Automated Puppeteer screenshot pipeline capturing `console-mid.png` and `console-debrief.png`.

### Changed
- **System Check Navigation**: Moved System Check dashboard to route `#/check` with updated document title.
- **Scoring Aggregation**: Resolved multi-track scoring bug by aggregating ack latency, classification, and engagement across all tracks associated with an actor.
- **Bird Departure Kinematics**: Removed artificial high-speed sprint; bird transitions immediately to `left_area` at `departTick` with natural radar track drop.

## [0.2.0] - Phase 1A: Single-Drone Mission Simulation, Radar, Effectors, Basic Scoring

### Changed
- **SessionLog formatVersion**: Bumped to version 2 to support self-contained snapshots and rich scenario/command models.
- **Engine Snapshots**: Made fully self-contained with `formatVersion`, `seed`, `scenarioId`, `world`, `tick`, full PRNG fork tree states, `pendingCommands`, `executedCommands`, and `eventLog`. `Engine.restore(snapshot)` updated to a single-argument interface.
- **Worker Pipeline Test**: Converted to fully deterministic stepping without wall-clock sleeps.

### Added
- **Deterministic Math (`src/sim/core/dmath.ts`)**: Polynomial approximations for `sin`, `cos`, `atan2` adhering to $\le 10^{-5}$ error for sin/cos and $\le 10^{-4}$ rad for atan2 without cross-engine transcendental drift.
- **3D Spatial Math (`src/sim/core/vec.ts`)**: Vector helpers and bearing calculations clockwise from North in $[0, 360)^\circ$.
- **Threat Library (`src/sim/model/threats.ts`)**: Generic training threat classes (`fpv_kamikaze`, `commercial_quad`, `fixed_wing_recon`, `bird`).
- **Actor & Kinematics (`src/sim/model/actors.ts`)**: Direct ingress, transit, wander, and neutralized flight profiles.
- **Radar System (`src/sim/systems/radar.ts`)**: Rotating antenna sweep sector, 4th-root radar cross section scaling, Irwin-Hall measurement noise, and tentative/confirmed/lost track lifecycle.
- **Engagement System (`src/sim/systems/effectors.ts`, `src/sim/systems/engagement.ts`)**: Jammer soft-kill and Gun burst hard-kill mechanics.
- **Mission "Dawn Intrusion" (`src/sim/scenarios/dawnIntrusion.ts`)**: Scripted three-contact dawn incursion with seeded spatial/timing jitter.
- **Trainee View (`src/sim/view/traineeView.ts`)**: Ground-truth-isolated situational awareness feed.
- **Scoring Engine (`src/sim/scoring/basic.ts`, `src/sim/scoring/constants.ts`)**: Traceable scoring based on detection latency, classification accuracy, and engagement decisions.
- **Automated Bots (`src/sim/bots/`)**: Reference operator, Idle operator, and Trigger-happy operator.
- **Headless Execution CLI (`scripts/headless.ts`)**: Multi-seed automated bot evaluation runner.

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
