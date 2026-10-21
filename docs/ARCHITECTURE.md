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

### Command Tick Stamping and Past-Tick Invariance (`engine.ts`)
- **Stamping on Ingestion**: When a command is submitted (e.g. while the simulation loop is actively running on the worker), `engine.enqueueCommand(command)` determines the target execution tick.
- **Past-Tick Invariant**: A command can **never** be scheduled for a tick that has already elapsed. The target tick is calculated as:
  `targetTick = Math.max(command.tick ?? this.world.tick, this.world.tick)`
  If a command specifies a past tick or invalid value, it is immediately and deterministically clamped forward to the engine's current tick (`this.world.tick`).
- **Log Permanence**: When the command executes on its designated tick, the exact execution tick is recorded in `executedCommands` and preserved in `SessionLog.commands`.
- **Replay Fidelity**: When `replay(sessionLog)` executes from tick 0, every command is queued at its recorded execution tick, guaranteeing 100% bit-parity between live and replayed runs.

### Web Worker Isolation (`worker/`, `simClient.ts`)
- Worker runs the engine off the main browser UI thread to prevent UI stutter during intensive simulation steps.
- Communication between main thread and worker is fully typed via `WorkerMessage` and `WorkerResponse` discriminated unions.

## 4. Phase 1A Architecture Additions

### Deterministic Math & Spatial Systems (`dmath.ts`, `vec.ts`)
- Polynomial approximations for trigonometric operations (`dSin`, `dCos`, `dAtan2`) using only basic arithmetic (`+ - * /`) and integer floor/abs. Guarantees cross-engine identical results without standard library transcendental precision variations.
- 3D spatial calculations with coordinates `{x: east, y: north, z: up}` in metres, and bearings in $[0, 360)^\circ$ clockwise from true North.

### Fixed System Execution Pipeline
Every tick in `Engine.step()` executes exactly five systems in fixed order:
1. `applyCommands`: Dispatches pending commands (`ACK_TRACK`, `CLASSIFY_TRACK`, `ENGAGE_TRACK`, `HOLD_FIRE`).
2. `behaviour`: Updates threat kinematics (direct ingress, waypoint transit, random wander, neutralized descent).
3. `radar`: Advances the rotating sector sweep ($9^\circ$/tick), calculates radar cross section detection probabilities via 4th-root scaling, injects Irwin-Hall measurement noise, smooths velocity estimates, and manages track lifecycles (tentative $\to$ confirmed $\to$ dropped).
4. `engagement`: Resolves active jammer (soft-kill vs RF links) and gun bursts (hard-kill at $\le 1000$m).
5. `missionRules`: Evaluates termination criteria (`asset_hit`, `all_resolved`, `time_limit`).

### Situational Awareness & Ground Truth Isolation (`traineeView.ts`)
- `getTraineeView()` projects the simulation state into a sanitized situational picture for trainee operators or automated bots.
- Absolute isolation: ground-truth flags (`hostile`, `truthClass`, `actorId`, `actors`) are stripped; only noisy radar tracks, effector status, and public simulation events are exposed.

### Scoring Engine (`scoring/basic.ts`)
- Computes comprehensive session scores ($[0, 100]$) weighted across:
  - Detection latency ($\le 3$s for full score).
  - Classification accuracy.
  - Engagement decisions and standoff distance ($>400$m).
- Incurs heavy deductions for collateral civilian quad engagement, bird engagement, wasted jamming cycles on non-RF targets, and asset hits.
