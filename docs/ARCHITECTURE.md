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

## 7. Phase 2B Architecture Additions: Passive RF Detector & EO/IR Turret

### Threat Physical & Sensor Signatures (`src/sim/model/threats.ts`)
- `bird`: size $0.3\text{ m}$, thermal $0.2$, RF `'none'`
- `commercial_quad`: size $0.5\text{ m}$, thermal $0.6$, RF `'telemetry_link'`
- `fpv_kamikaze`: size $0.35\text{ m}$, thermal $0.8$, RF `'wideband_video'`
- `fixed_wing_recon`: size $2.0\text{ m}$, thermal $0.7$, RF `'long_range_link'`
- `clutter`: size $0.1\text{ m}$, thermal $0.1$, RF `'none'`

### Passive RF Line-of-Bearing Detector (`src/sim/systems/rf.ts`)
- **Execution Interval**: Evaluated every 10 ticks ($0.5\text{ s}$) across all active `rfControlled` actors in deterministic ID order.
- **RNG Stream**: `rng.fork('rf')`.
- **Effective Range**:
  $$R_{\text{rf}} = 4500\text{ m} \times [1.0, 0.85, 0.65][\text{ewIndex}] \times (\text{urban} ? 0.8 : 1.0)$$
- **Line-of-Sight Masking**: Requires clear terrain line-of-sight from radar mast $(0, 0, 15)\text{ m}$ to actor.
- **Detection Probability**: $P_{\text{det}} = 0.90$ within $R_{\text{rf}}$.
- **Line of Bearing & Noise**:
  - Truth bearing from origin $(0, 0, 0)$.
  - 12-sample unit Irwin-Hall Gaussian noise with $\sigma = 4.0^\circ \times (\text{urban} ? 1.5 : 1.0) \times [1.0, 1.3, 1.8][\text{ewIndex}]$.
- **RF Signature Reception**:
  - Probability of true signature: $P = [0.90, 0.80, 0.65][\text{ewIndex}]$; fallback to `'unknown_link'`.
- **Temporal Buffer & View Exposure**:
  - Buffer stores lines for $5\text{ s}$ ($100\text{ ticks}$).
  - `TraineeView.rf.lines`: array of `{ bearingDeg, ageS, signature }`. Zero ground truth actor IDs or coordinates.
- **Radar Track Association**:
  - `'emitting'`: matched bearing line within $\pm 10^\circ$ of track estimated bearing arrived in last $3\text{ s}$ ($60\text{ ticks}$).
  - `'silent'`: track age $> 6\text{ s}$ ($120\text{ ticks}$), estimated range $\le 0.8 \times R_{\text{rf}}$, clear LOS, and zero matching RF lines in last $3\text{ s}$.
  - `'unknown'`: default state for young or distant tracks.

### Electro-Optical / Infrared (EO/IR) Turret (`src/sim/systems/eo.ts`)
- **Gimbal Mechanics**: Single gimbal slewing at $2^\circ/\text{tick}$ ($40^\circ/\text{s}$) toward the target track's estimated bearing.
  - Slew error $|\theta_{\text{err}}| \le 2^\circ \implies \text{'locked'}$; otherwise $\text{'slewing'}$.
  - Zero readings while slewing.
  - If locked track drops, disengages to `'idle'` and emits `EO_LOST`.
- **Control Commands**:
  - `EO_LOCK { trackId: number }`: slew and track specified contact.
  - `EO_RELEASE {}`: release turret to idle.
  - `EO_CHANNEL { channel: 'tv' | 'ir' }`: switch sensor wavelength channel. Default: `tv` for day/dusk, `ir` for night.
- **Optics Formulas** (computed every 10 ticks while locked):
  - True geometric scale: $\text{pixels} = \text{sizeM} \times 30000 / \text{trueRange}$.
  - Ambient illumination: $\text{light} = \{ \text{day}: 1.0, \text{dusk}: 0.6, \text{night}: 0.05 \}$.
  - TV Channel transmission and contrast:
    $$\tau_{\text{tv}} = \frac{1}{1 + \frac{\text{range}}{\text{visibilityKm} \times 1000 \times 0.5}}, \quad C_{\text{tv}} = \text{light} \times \tau_{\text{tv}}$$
  - IR Channel transmission and contrast:
    $$\tau_{\text{ir}} = \frac{1}{1 + \frac{\text{range}}{\text{visibilityKm} \times 1000 \times 1.5}} \times (\text{rain} ? 0.8 : 1.0), \quad C_{\text{ir}} = \text{thermalSignature} \times \tau_{\text{ir}} \times (\text{day} ? 0.8 : 1.0)$$
  - Effective resolution: $\text{effPixels} = \text{pixels} \times \text{contrast}$.
- **Resolution Level Thresholds**:
  - $\text{effPixels} \ge 12 \implies \text{'identify'}$
  - $\text{effPixels} \ge 6 \implies \text{'recognize'}$
  - $\text{effPixels} \ge 2.5 \implies \text{'detect'}$
  - else $\implies \text{'none'}$
- **Classification Hints**:
  - `identify`: exact threat class with $95\%$ accuracy; random other class with $5\%$ error.
  - `recognize`: airframe class (`'multirotor'` for quad/FPV, `'fixed_wing'`, `'bird'`) with $90\%$ accuracy.
  - `detect`: generic `'object'`.
- **Trainee View Contract**:
  - Exposes `{ state, lockedTrackId, channel, level, hint, quality = min(1, effPixels/12) }`.
  - Raw `effPixels` is strictly withheld.

## 6. Phase 3A Architecture Additions: Swarms, Procedural Generator, Difficulty Tiers

### New Threat Classes (`src/sim/model/threats.ts`)
- **`fpv_fiber`**: Wire/fiber-guided strike drone.
  - RCS: $0.02\text{ m}^2$ (small bucket), physical size: $0.35\text{ m}$, thermal: $0.8$, speed: $20-30\text{ m/s}$, altitude: $20-80\text{ m}$.
  - RF Characteristics: `rfControlled: false`, `rfSignature: 'none'`.
  - Tactical implication: RF-silent on passive detectors; immune to RF jammer soft-kill. Trainee must employ hard-kill autocannon. Jammer usage incurs wasted non-RF penalty (-5).
- **`decoy_drone`**: Aerodynamic decoy and signature imitator.
  - RCS: $0.05\text{ m}^2$ (medium bucket), physical size: $1.2\text{ m}$, thermal: $0.3$, speed: $20-30\text{ m/s}$, altitude: $40-100\text{ m}$.
  - RF Characteristics: `rfControlled: false`, `rfSignature: 'none'`.
  - Tactical implication: Mimics inbound strikers on radar. Does zero asset damage. At $\le 25\text{ m}$ of the asset it impacts harmlessly with `DECOY_IMPACT` (not an asset hit). Trainee must identify via medium RCS / optical cues and withhold fire to preserve ammo and avoid decoy engagement penalty (-3).

### Swarm Tactical Formations (`src/sim/scenarios/swarm.ts`)
Formations are computed deterministically without boids algorithms using leader-follower vector mathematics and seeded jitter:
- **`saturation`**: All swarm members attack from a single bearing sector ($\pm 12^\circ$ spread, $40-80\text{ m}$ lateral spacing) compressed within a $20-40\text{ s}$ arrival window.
- **`split`**: Pincer ingress from two bearings separated by $70^\circ - 120^\circ$. The secondary group is delayed by $10-25\text{ s}$.
- **`decoy_screen`**: Decoys fly $500-900\text{ m}$ ahead of armed strikers along the same bearing, with strikers trailing by $12-20\text{ s}$.
- **Terrain Following**: All waypoints and offsets clamp altitude $\ge 20\text{ m}$ AGL using the procedural terrain elevation map.

### Procedural Generator & Difficulty Tiers (`src/sim/scenarios/generator.ts`)
- **Version**: `GEN_VERSION = 1`.
- **API**: `generateScenario(seed, tier, avoid?)` creates dynamic environments, spawn schedules, and deterministic fingerprints.
- **Scenario ID Format**: `proc:v1:<tier>` (e.g. `proc:v1:veteran`). Integrated into snapshot/restore and replay harnesses.
- **Fingerprinting**: 32-bit FNV-1a hash over `(version, tactic, classCounts, quantizedBearings30Deg, environment)`. Up to 8 re-rolls on avoid collision.
- **Tier Configuration**:
  - `recruit`: 1-2 strikers, 0 decoys, 0 fiber share, 1-2 civilians. Rural/hilly, clear day, EW none. Single threat ingress.
  - `operator`: 3-5 strikers, 0-1 decoys, $\le 25\%$ fiber share, 1-2 civilians. Clear/fog, day/dusk, EW none/light. Small saturation or split swarms.
  - `veteran`: 6-10 strikers, 1-3 decoys, $\le 40\%$ fiber share, 1-3 civilians. Any environment, EW light/heavy. Multi-axis split and decoy screens.
  - `elite`: 10-16 strikers, 2-4 decoys, $\le 50\%$ fiber share, 0-2 civilians. Any environment, EW heavy. Coordinated multi-axis swarm with pop-up striker wave after $t=150\text{ s}$ at close range ($1000-1300\text{ m}$).

### Effector Accounting & Scoring (`src/sim/scoring/basic.ts`)
- **`ScoreReport.effectorUse`**:
  - `gunBurstsFired`: Count of `ENGAGEMENT_STARTED` with `effector === 'gun'`.
  - `jammerCycles`: Count of `ENGAGEMENT_STARTED` with `effector === 'jammer'`.
  - `killsPerEffector`: `{ gun, jammer }` for verified hits on active hostile targets.
  - `wastedEngagements`: `{ ghost, decoy, neutral }` separating clutter/ghost engagements, decoy hits, and neutral quad/bird engagements.
- **Penalties & Partial Credit**:
  - Decoy engagement: -3 points (`ENGAGE_DECOY`).
  - Wasted jammer on non-RF target: -5 points (`WASTED_JAMMER_NON_RF`).
  - Classification credit: 1.0 for exact class match; 0.5 for cross-assessing between hostile FPV variants (`fpv_kamikaze` $\leftrightarrow$ `fpv_fiber`); 0.0 otherwise.

## 7. Phase 3C Architecture Additions: Capacity Model, RF Ambiguity, Decoy Discrimination

### Capacity-Aware Procedural Generator (`src/sim/scenarios/capacity.ts`)
- **Capacity Model (`capacityCheck`)**:
  - Analytical greedy service queue evaluating whether a generated swarm is mathematically solvable.
  - Kinematics: For each hostile striker, computes entrance times into jammer envelope ($R_{\text{jam}} = 1500\text{ m}$), autocannon envelope ($R_{\text{gun}} = 1000\text{ m}$), and asset impact time $t_{\text{impact}} = t_{\text{spawn}} + d_0 / v$.
  - Jammer Queue: 2.0 s dwell cycle, $p = 0.85$ neutralization probability, RF-controlled threats only.
  - Gun Queue: 0.5 s burst cycle, $P_k$ computed from range formula at 500m engagement range ($P_k = 0.35$ for fast strikers), 20-burst ammunition limit.
  - Ratio Calculation: $\text{capacityRatio} = \max\left(\max_i \frac{\text{finish}_i - t_{\text{gun}, i}}{t_{\text{impact}, i} - t_{\text{gun}, i}}, \frac{\text{burstsUsed}}{20}\right)$.
  - Tier Limits:
    - `recruit`: $\le 0.60$
    - `operator`: $\le 0.60$
    - `veteran`: $\le 0.80$
    - `elite`: Unconstrained ($\infty$)
  - Generator integration: re-rolls up to 8 attempts; if still above tier limit, sequentially drops strikers until the ratio complies.

### Direction-Finding RF Ambiguity (`src/sim/systems/rf.ts`)
- **Co-Bearing Resolution**:
  - When two or more active radar tracks have bearings within $6.0^\circ$ of a detected RF emitter line bearing, the RF direction-finding system cannot uniquely resolve which airframe is transmitting.
  - Both tracks receive `rfStatus = 'ambiguous'`, and `rfSignature` is withheld.
  - Trainee View and Console: Track table displays amber `AMBIG` tag; Detail panel indicates `AMBIGUOUS (CO-BEARING)`.
  - Operator Bot Rule: `referenceOperator` never jams an ambiguous track (preventing false jammer expenditure); it uses gun when threat enters $\le 1000\text{ m}$, otherwise waits or tracks with EO.



