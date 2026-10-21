# Architecture Overview: Phase 0 Foundation

## 1. System Intent
The MoD Drone & Counter-Drone Threat Simulation Trainer provides an offline, browser-based training environment for asset defense against single drones and coordinated swarms.
The simulation strictly employs generic, open-source parameters without real-world weapon controls or classified specifications.

Phase 0 establishes the **deterministic simulation core**, state snapshotting/restoring, session logging, replay verification, and a Web Worker isolation harness.

## 2. Structural Layering

```
src/
├── sim/                     # Pure simulation logic (zero DOM, zero React)
│   ├── core/
│   │   ├── rng.ts           # Mulberry32 PRNG + xmur3 string hashing + stream forking
│   │   ├── hash.ts          # Deterministic state hashing (cyrb53 canonical hashing)
│   │   ├── clock.ts         # Fixed-step constants (TICK_RATE = 20 Hz, DT = 0.05s)
│   │   ├── types.ts         # Core simulation data contracts (Command, Event, Entity, WorldState)
│   │   ├── world.ts         # World state container and entity kinematic integration
│   │   ├── engine.ts        # Simulation engine (step, dispatch, snapshot, restore)
│   │   └── log.ts           # Append-only SessionLog and deterministic replay function
│   ├── worker/
│   │   ├── protocol.ts      # Strongly-typed worker messaging contracts
│   │   └── sim.worker.ts    # Web Worker execution harness for the Engine
│   └── index.ts             # Public export surface of sim
├── app/                     # React UI (System Check Page)
│   ├── main.tsx             # React entrypoint
│   ├── App.tsx              # System Check dashboard and verification controls
│   └── simClient.ts         # SimClient RPC/Event bridge to the Web Worker
└── shared/
    └── version.ts           # LOG_FORMAT_VERSION = 1
```

## 3. Core Subsystems

### Deterministic Seeded PRNG (`rng.ts`)
- Core algorithm: `mulberry32` 32-bit generator.
- String seeds are hashed to 32-bit seeds via `xmur3`.
- Supports state serialization (`getState()`, `setState()`).
- Independent stream branching via `fork(label: string)`: derives an isolated child PRNG from `(currentState, label)` without mutating the parent PRNG state or sequence.

### Fixed-Step Simulation Clock (`clock.ts`)
- `TICK_RATE = 20` ticks per second (50ms delta).
- `DT = 1 / 20 = 0.05`.
- Simulation advances purely in discrete ticks (`tick: number`). Wall-clock time never enters simulation state.

### State Serialization & Hashing (`hash.ts`)
- To ensure cross-run and cross-platform verification, `stateHash(world, rngState)` formats world state with sorted keys and rounds floating-point numbers to `1e-6` precision.
- Hashed using a high-performance 53-bit collision-resistant hash (`cyrb53`) formatted as a fixed-length hexadecimal string.

### Snapshot and Restore (`engine.ts`)
- `Engine.snapshot()` outputs a plain JSON-serializable representation of:
  - World state (tick, entities, nextEntityId)
  - Pending future commands
  - PRNG state
  - Event log length
- `Engine.restore(snapshot)` hydrates an engine to continue execution with identical outcomes.

### Session Logging and Replay (`log.ts`)
- Every scheduled command is stored in `SessionLog` (`formatVersion`, `seed`, `scenarioId`, `commands`, `totalTicks`).
- `replay(sessionLog)` constructs a fresh `Engine`, schedules logged commands at their designated ticks, advances the simulation through `totalTicks`, and returns the final state hash.
- Guaranteed: `liveRun.hash === replay(liveRun.sessionLog)`.

### Web Worker Isolation (`worker/`, `simClient.ts`)
- Worker runs the engine off the main browser UI thread to prevent UI stutter during intensive simulation steps.
- Communication between main thread and worker is fully typed via `WorkerMessage` and `WorkerResponse` discriminated unions.
