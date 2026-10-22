# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - Phase 2B: RF Detector, EO/IR Sensor, Day/Night Effects

### Added
- **Threat Library Additions (`src/sim/model/threats.ts`)**:
  - Physical size (`sizeM`), thermal signature (`thermalSignature`), and passive RF emission signature (`rfSignature`: 'none' | 'telemetry_link' | 'wideband_video' | 'long_range_link') across all threat classes.
  - `dawn_intrusion` scenario updated with `timeOfDay: 'dusk'`.
- **Passive RF Line-of-Bearing Detector (`src/sim/systems/rf.ts`)**:
  - Evaluates every 10 ticks (0.5 s) using isolated `rng.fork('rf')`.
  - Effective range $R_{\text{rf}} = 4500\text{ m} \times [1.0, 0.85, 0.65][\text{ew}] \times (\text{urban} ? 0.8 : 1.0)$.
  - 12-sample Irwin-Hall bearing noise with standard deviation $\sigma = 4^\circ \times (\text{urban} ? 1.5 : 1.0) \times [1.0, 1.3, 1.8][\text{ew}]$.
  - Line-of-sight clearance verification via terrain raymarching.
  - 5-second bearing strobe retention and dynamic track association (`emitting` if bearing strobe matches within $\pm 10^\circ$ in last 3s; `silent` if track age $>6$s, range $\le 0.8 R_{\text{rf}}$, clear LOS, and no matching strobe; else `unknown`).
- **EO/IR Turret Sensor (`src/sim/systems/eo.ts`)**:
  - Single-gimbal optical turret slewing at $2^\circ/\text{tick}$ toward target track bearing.
  - States: `idle`, `slewing`, and `locked`. Automatically emits `EO_LOST` event if locked track drops.
  - Command handling: `EO_LOCK { trackId }`, `EO_RELEASE {}`, and `EO_CHANNEL { channel: 'tv' | 'ir' }`.
  - True physical optics formulas calculating effective pixels (`effPixels = pixels * contrast`) across TV and IR channels under variable ambient light (day 1.0, dusk 0.6, night 0.05), atmospheric extinction, and rain attenuation.
  - Resolution levels: `identify` ($\ge 12$), `recognize` ($\ge 6$), `detect` ($\ge 2.5$), and `none` ($< 2.5$).
  - Probabilistic classification hints: 95% accuracy at `identify`, 90% accuracy at `recognize` (`multirotor` | `fixed_wing` | `bird`), and generic `object` at `detect`.
  - Normalized quality metric $\min(1, \text{effPixels} / 12)$ without exposing raw pixel counts to the view.
- **Reference Bot Sensor Fusion (`src/sim/bots/referenceOperator.ts`)**:
  - Automatic EO turret management: locks nearest unclassified confirmed track within 3.0 km and releases upon classification.
  - Multi-sensor fusion weights: EO identify hints (weight 1.0), RF link signatures (weight 0.85), EO recognize hints (weight 0.70), and observable kinematics fallback (weight 0.50).
- **Console UI Integration (`src/app/console/`)**:
  - Scope: Thin dotted RF lines of bearing fading over 5 seconds with emission signature tags.
  - Track Table: RF emission column (`EMIT`, `silent`, `—`).
  - Track Detail: RF emission signature display and EO turret lock toggle button.
  - EO Panel (`EoPanel.tsx`): HUD overlay with crosshairs, FLIR grey-green palette for night IR mode, procedural vector silhouettes for optical hints (multirotor, fixed-wing, bird, object), real-time quality/blur filtering, and channel toggle.
  - Hotkeys: `E` to toggle EO lock on selected track, `T` to toggle TV/IR channel.
- **Verification Suite**:
  - `tests/phase2b.test.tsx`: Acceptance test suite covering RF range monotonicity, Irwin-Hall noise sigma, RF track association, EO range equations, gimbal slew rate, command validation, privacy audit, snapshot/restore replay invariance, and bot performance benchmarks.

### Fixed
- **Step 0.1 Engine Mission End**: Restored engine completion rule requiring all spawned actors to resolve (`neutralized`, `impacted`, `left_area`), ensuring reference runs on dawn_intrusion run until full resolution (~4,100 ticks).
- **Step 0.2 Radar Ghost Model**: Configured rates per minute ($p = \text{ratePerMin}/120$) with 2-miss drop for tentative ghosts and confirmed ghost lifespans up to 6 sweeps with quality decay $0.25 \to 0.1$.
- **Step 0.3 Terrain Cleanup**: Removed `TerrainKind` string overload from `hasLineOfSight` to require explicit `TerrainMap`.

## [0.4.0] - Phase 2A: Environment, Terrain, Radar Degradation, Three Scenarios

### Added
- **Environment Model (`src/sim/model/environment.ts`)**:
  - `Environment` state containing `timeOfDay` ('day' | 'dusk' | 'night'), `weather` ('clear' | 'haze' | 'fog' | 'rain'), `visibilityKm`, `ewLevel` ('none' | 'light' | 'heavy'), and `terrainKind` ('rural' | 'hilly' | 'urban').
  - `TraineeView` includes sanitized `environment` omitting `ewLevel` (preventing ground-truth leakage).
- **Procedural Terrain System (`src/sim/model/terrain.ts`)**:
  - `generateTerrain(kind, rng, features)` returning `{ heightAt(x,y), clutterAt(x,y) }`.
  - Deterministic 3-octave lattice noise using `Math.imul` and standard cubic smoothstep interpolation.
  - Smooth asset vicinity flattening within 300m of radar origin.
  - Procedural rural, hilly, and urban height/clutter profiles, plus explicit ridge features (`TerrainFeature`).
  - Raymarching Line-of-Sight test (`hasLineOfSight`) with 50m sample steps and 5m terrain clearance threshold.
- **Radar Degradation & False Tracks (`src/sim/systems/radar.ts`)**:
  - Terrain line-of-sight masking blocking sweeps when terrain obstructs radar mast at `(0, 0, 15)`.
  - AGL clutter degradation reducing detection probability for low-altitude contacts ($\le 50$m full clutter, linear to 150m).
  - Atmospheric weather attenuation factors on radar range: clear 1.0, haze 0.97, rain 0.85, fog 0.95.
  - Electronic Warfare (EW) degradation: noise sigma multipliers `[1, 1.5, 2.5]` and detection probability multipliers `[1, 0.92, 0.8]`.
  - Radar ghost (false) track generation from `rng.fork('radar-ghost')` based on EW level and urban terrain with 1-3 rotation lifespans and jitter.
- **New Operational Scenarios (`src/sim/scenarios/`)**:
  - `ridge_runner`: Hilly terrain, day, haze, light EW, with an explicit 140m ridge at range 3.0 km along bearing 210 deg masking an inbound FPV until it crests the ridge.
  - `city_edge_night`: Dense urban clutter, night, rain, light EW, featuring dual hostile FPV ingress, standoff commercial quadcopter, dual birds, and radar clutter tracks.
  - Scenario registry in `src/sim/scenarios/index.ts` exporting `ScenarioDef` metadata.
- **Scoring Engine Generalisation (`src/sim/scoring/basic.ts`)**:
  - Hostility resolution dynamically derived from `THREAT_LIBRARY[classId].hostile`.
  - Dynamic contact weight pooling and normalization.
  - Multi-contact per-actor penalties (-25 civilian quad, -5 bird).
  - Engaging radar ghost false tracks penalizes -5 points ("Engaged false track").
- **Console UI Additions (`src/app/console/`)**:
  - `MissionSetup`: Scenario selection cards for Dawn Intrusion, Ridge Runner, and City Edge Night with environment tags and seed input.
  - `TopBar`: Real-time environment telemetry chips displaying time of day, weather, visibility, and terrain.
  - `classificationOptions`: Added 'clutter' option ("Clutter / false track") with hotkey '5'; renamed bird label to "Bird".
  - `DebriefScreen`: Displays scenario title, environment parameters, and false tracks observed vs engaged.
- **Verification Suites**:
  - `tests/phase2a.test.ts`: Automated tests covering all 10 acceptance criteria (terrain determinism, LOS masking, ridge masking effect, weather/EW/clutter degradation, ghost generation rates, zero ground-truth leakage, snapshot/restore determinism, generalized scoring, and bot benchmarks).
  - `scripts/headless.ts`: 45-run evaluation runner asserting reference bot $\ge 75$, idle bot $\le 30$ with asset hits, and trigger-happy bot penalty deductions.

### Changed
- **Reference Operator (`src/sim/bots/referenceOperator.ts`)**:
  - Removed scenario-specific bearing corridors. Classification now relies strictly on observable kinematic cues: speed, closing rate, heading error to asset, turn rate, altitude, and RCS bucket.
  - Requires `state === 'confirmed'` and `velocityValid === true` before classification or engagement.
  - Dynamic re-evaluation dispatches `commercial_quad` and `HOLD_FIRE` if a tentative threat exhibits non-threatening speed or crossing heading.
- **TraineeTrack (`src/sim/view/traineeView.ts`)**:
  - Added `velocityValid: boolean` (false until $\ge 2$ radar sweeps).
- **Single Viewport Console Layout (`src/app/console/`)**:
  - Fitted viewport to 100vh with `overflow: hidden` preventing page scrolling at 1366x768 and 1920x1080.
  - Automated canvas resize handling.

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
