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
├── app/                     # React UI (System Check Page & Console UI)
│   ├── main.tsx             # React entrypoint
│   ├── App.tsx              # System Check dashboard and verification controls
│   ├── routes/
│   │   └── ConsolePage.tsx  # Operator Console root view
│   ├── console/             # Operator Console components (Radar, TrackTable, Debrief, etc.)
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

## 5. Phase 1B Architecture Additions: Operator Console & Headless Protocol

### Operator Console UI Layer (`src/app/console/`)
- Pure presentation layer communicating with the background simulation engine exclusively through `SimClient` and the Web Worker protocol.
- **Strict Boundary Enforcement**: ESLint rules forbid `src/app` from importing any internals of `src/sim` except via the public contract barrel `src/sim/index.ts`. Zero direct access to simulation ground truth, world state, or hidden actor kinematics.
- **TopBar**: Telemetry indicators (mission clock, threat condition DEFCON 1..5, simulation speed controls 1x/2x/4x, pause/resume, and Autopilot toggle driving `referenceOperator`).
- **Radar Scope (`RadarScope.tsx`, `drawScope.ts`)**: Canvas PPI display featuring device-pixel-ratio scaling, range rings (500m to 3000m), rotating radar beam wedge with fading phosphor persistence, effector coverage rings (gun 1000m, jammer 1500m), history trails, velocity predictor vectors, and clickable track selection. Contact symbols and colors are strictly keyed to trainee assessed classification (`pending` = amber, `hostile` = red, `civilian` = green, `bird` = gray).
- **Track Table & Track Detail (`TrackTable.tsx`, `TrackDetail.tsx`)**: Tabular contact summary with hotkey shortcuts (`1`-`9`, `j`/`k`), status badges, and actionable control panel (ACK, Classify, Jam, Gun, Hold Fire) with explicit disabled-state justifications.
- **Effector Panel & Event Feed (`EffectorPanel.tsx`, `EventFeed.tsx`)**: Real-time effector status monitors (cooldowns, burst durations, target locks) and chronological mission events log.
- **Debrief Screen (`DebriefScreen.tsx`)**: Comprehensive post-mission report displaying total score, breakdown sub-scores (detection, classification, engagement, collateral, standoff), rule deductions with timestamps, timeline analysis, and JSON export/copy capabilities.

### Headless Worker Messaging Protocol (`src/sim/worker/protocol.ts`)
- **`INIT`**: Initializes an engine with specified scenario (`dawn_intrusion`) and seed.
- **`SET_SPEED`**: Adjusts tick pacing multiplier (`1x`, `2x`, `4x`) in the worker run loop.
- **`ENQUEUE`**: Submits operator commands with optional target `tick`.
- **`VIEW`**: Worker streams `TraineeView` payloads at $\le 100$ms intervals (every 2 ticks) and immediately upon command execution or discrete mission events.
- **`REPORT`**: On mission termination (`asset_hit`, `all_resolved`, `time_limit`), worker computes `ScoreReport` using `scoreSession` and emits `ScoreReport` together with the complete `SessionLog`.

## 6. Phase 2A Architecture Additions: Environment, Terrain & Radar Degradation

### Environment Model (`environment.ts`)
- Configurable operational environment attached directly to `WorldState`:
  - `timeOfDay`: `'day' | 'dusk' | 'night'`
  - `weather`: `'clear' | 'fog' | 'rain'`
  - `visibilityKm`: Optical baseline ($10\text{ km}$ clear, $5\text{ km}$ rain, $2\text{ km}$ fog)
  - `ewLevel`: Electronic warfare interference level (`'none' | 'light' | 'heavy'`)
  - `terrainKind`: Procedural surface profile (`'rural' | 'hilly' | 'urban'`)
- **Trainee Isolation**: `TraineeView.environment` exposes `{ timeOfDay, weather, visibilityKm, terrainKind }`. `ewLevel` is withheld to prevent direct inspection, requiring operators to infer jamming levels from radar degradation.

### Procedural Deterministic Terrain (`terrain.ts`)
- 2D integer lattice hash using 32-bit `Math.imul` arithmetic without transcendental functions.
- Bicubic smoothstep interpolation ($3t^2 - 2t^3$) across three octaves ($800\text{ m}$, $300\text{ m}$, $100\text{ m}$) covering $[-8000, 8000]\text{ m}$.
- Smooth asset flattening: within $300\text{ m}$ of origin $(0, 0)$, terrain height flattens smoothly to $0\text{ m}$ MSL, seating the asset at $0\text{ m}$ and radar mast at $(0, 0, 15)\text{ m}$ MSL.
- Profiles:
  - `rural`: $15\text{ m}$ base amplitude, clutter $0.1 - 0.3$.
  - `hilly`: $120\text{ m}$ base amplitude, clutter $0.2 - 0.5$, plus explicit ridge feature at range $2.0 - 2.5\text{ km}$ along bearing $270^\circ - 300^\circ$ with peak elevation $\ge 80\text{ m}$ enabling terrain masking.
  - `urban`: $25\text{ m}$ base amplitude, clutter $0.6 - 0.9$, with discrete $+30\text{ m}$ to $+60\text{ m}$ structural blocks.

### Radar Degradation & Ghost Tracking (`radar.ts`)
1. **Terrain Line-of-Sight (LOS)**: Raymarch from radar mast $(0, 0, 15)$ to target position sampled every $50\text{ m}$. If the ray dips below the terrain surface, detection is masked ($P_d = 0$).
2. **Surface Clutter**: Evaluates local Above-Ground-Level altitude $\text{AGL} = z - h(x, y)$. If $\text{AGL} < 40\text{ m}$:
   $$P_{d,\text{eff}} = P_d \times \left(1 - c(x, y) \times \left(1 - \frac{\text{AGL}}{40}\right)\right)$$
3. **Atmospheric Attenuation**: Weather scales effective range $R_{\text{eff}}$ by $0.85$ in rain and $0.95$ in fog.
4. **Electronic Warfare Interference**:
   - Noise $\sigma = (15 + 0.005 \cdot r) \times \text{ewNoiseMult}$ ($1.5\times$ for light, $2.5\times$ for heavy).
   - Detection probability $P_d = P_d \times \text{ewPdMult}$ ($0.85\times$ for light, $0.60\times$ for heavy).
5. **Ghost Tracks**: Stream `rng.fork('radar-ghost')` generates transient radar false tracks (clutter blips) with range $800 - 3500\text{ m}$, wander speeds $2 - 6\text{ m/s}$, initial quality $0.25$, and lifetime $3 - 8$ sweeps. Engaging ghost tracks incurs a $-5$ penalty in scoring.

