# Architectural and Simulation Design Decisions

## ADR-001: Determinism Constraints & Execution Model
- Pure simulation logic in `src/sim` strictly prohibits standard non-deterministic JavaScript primitives (`Math.random()`, `Date.now()`, `performance.now()`, `new Date()`, and timers).
- All simulation iterations over Maps, Sets, and Objects must use stable insertion order or explicitly sorted keys to prevent cross-engine object property traversal divergence.
- Deterministic math library (`dmath.ts`) provides minimax polynomial approximations for `sin`, `cos`, and `atan2` guaranteeing identical outputs across browser JS runtimes.

## ADR-002: Scenario Geometry & Transit Corridor Optimization

### Context
In Phase 1A Part B, mission termination criteria required missions to resolve via `all_resolved` before the 240 s (4,800 ticks) mission timeout. To achieve this, the bird was assigned a seeded departure tick ($t \in [120, 150]\text{ s}$) where it exits coverage, and the commercial quadcopter's transit path was adjusted.

### Code-Verified Parameters
- **Bird**: Spawns at $t \sim 200 \pm 100\text{ ticks}$ ($10 \pm 5\text{ s}$), range $1800 \pm 200\text{ m}$, bearing $40^\circ \pm 15^\circ$, altitude $80\text{ m}$, wander speed $9\text{ m/s}$, RCS $0.001\text{ m}^2$. At `departTick` ($2400 + \text{floor}(\text{rng} \times 600)$, i.e. $t \in [120, 150]\text{ s}$), state becomes `left_area`.
- **FPV Kamikaze**: Spawns at $t \sim 900 \pm 100\text{ ticks}$ ($45 \pm 5\text{ s}$), range $4000\text{ m}$, bearing $280^\circ \pm 15^\circ$ ($[265^\circ, 295^\circ]$), altitude $60\text{ m}$, direct ingress speed $30\text{ m/s}$, RCS $0.02\text{ m}^2$.
- **Commercial Quadcopter**: Spawns at $t \sim 400 \pm 100\text{ ticks}$ ($20 \pm 5\text{ s}$), altitude $90\text{ m}$, transit speed $12\text{ m/s}$, RCS $0.01\text{ m}^2$.
  - Original coordinates (`fa0e804`): Waypoint A = $(-4000, 1200 \pm 100, 90)$, Waypoint B = $(4000, 1200 \pm 100, 90)$. Total distance = $8000\text{ m}$.
  - Updated coordinates (`7b2c0ce`): Waypoint A = $(-1100, 1200 \pm 100, 90)$, Waypoint B = $(1100, 1200 \pm 100, 90)$. Total distance = $2200\text{ m}$.

### Transit Duration Rationale
At the previous $8,000\text{ m}$ transit distance and $12\text{ m/s}$ speed, the commercial quad required over $666\text{ s}$ ($13,333\text{ ticks}$) to transit, far exceeding the $240\text{ s}$ mission limit. Shortening the transit corridor to $2,200\text{ m}$ allows the quad to complete its run in $\approx 183.3\text{ s}$ ($\approx 3,667\text{ ticks}$), transiting across the radar coverage area and exiting cleanly (`left_area`) around tick 4070.

### True Cause of the 94 -> 100 Score Movement on Seeds s2 and s4
Empirical evaluation in the `fa0e804` worktree demonstrates that the loss of 6 points on seeds `s2` and `s4` was caused by **contact misclassification**, NOT detection latency or multi-track drops:
1. In `fa0e804`, the quad spawned at $X = -4000\text{ m}, Y \approx 1200\text{ m}$. Its initial bearing from the origin was $\text{atan2}(-4000, 1200) \approx 286.7^\circ$, placing it directly inside the Western threat sector ($[250^\circ, 310^\circ]$) used by `referenceOperator` to identify FPV strike threats.
2. Because the quad was closing towards the origin along $+X$ and initial radar velocity filtering had not yet settled, its initial estimated closing rate triggered the criterion `bearingDeg >= 250 && bearingDeg <= 310 && closingRateMps <= -18`.
3. Consequently, `referenceOperator` classified the civilian quad as `fpv_kamikaze`.
4. In `scoreSession`, contact scoring awarded full credit for detection ($1.0$, latency $0.05\text{ s}$) and decision ($1.0$, held fire outside engagement range), but $0.0$ for classification:
   $$\text{Contact Total} = 0.3 \times 1.0 + 0.3 \times 0.0 + 0.4 \times 1.0 = 0.70$$
   With contact weights $\text{bird} = 0.2$, $\text{quad} = 0.2$, $\text{fpv} = 0.6$:
   $$\text{Score} = (0.2 \times 1.0 + 0.2 \times 0.70 + 0.6 \times 1.0) \times 100 = 94$$
5. In commit `7b2c0ce`, updating Waypoint A to $X = -1100\text{ m}$ shifted the initial spawn bearing to $\text{atan2}(-1100, 1200) \approx 317.5^\circ$, placing it safely outside the $[250^\circ, 310^\circ]$ corridor. `referenceOperator` correctly classified it as `commercial_quad`, lifting classification score to $1.0$ and yielding $100$ total score on `s2` and `s4`.
6. This 94 -> 100 score change occurred in commit `7b2c0ce`, entirely **prior to** the multi-track scoring fix implemented in commit `4d3b7ba`.


## ADR-003: Operator Console Keyboard Navigation Specification
The keyboard shortcut mapping strictly implements the training console specification:

| Hotkey | Action | Scope / Context |
| :--- | :--- | :--- |
| `Tab` | Select next radar track | Active mission |
| `Shift + Tab` | Select previous radar track | Active mission |
| `Esc` | Deselect current track | Active mission |
| `A` | Acknowledge selected track | Track confirmed & unacked |
| `1` | Assess classification: Bird | Track selected |
| `2` | Assess classification: Civilian Quad | Track selected |
| `3` | Assess classification: FPV Strike Drone | Track selected |
| `4` | Assess classification: Fixed-Wing Recon | Track selected |
| `0` | Assess classification: Unknown | Track selected |
| `J` | Engage with Jammer (soft-kill) | Track selected & within 1500m |
| `G` | Engage with Gun (hard-kill) | Track selected & within 1000m |
| `H` | Issue Hold Fire directive | Track selected |
| `Space` | Toggle Pause / Resume | Active mission |
| `+` / `=` | Increase speed multiplier (1x -> 2x -> 4x) | Active mission |
| `-` / `_` | Decrease speed multiplier (4x -> 2x -> 1x) | Active mission |

Keys outside this specification (e.g. vim `j`/`k` for row navigation, `c` modal prompt, or numerical keys `5`-`9`) are intentionally omitted from `hotkeys.ts` to preserve strict single-key muscle memory for trainees during simulated high-stress threat inbound sequences.

## ADR-004: Contact Spawn Ranges, Altitude Representation & MSL Model

### Bird Spawn Range Rationale
In scenario mission design (e.g. `dawnIntrusion`), the avian contact is spawned at range $1.8 \pm 0.2\text{ km}$ ($1600\text{ m} - 2000\text{ m}$), substantially closer than the inbound hostile FPV drone (which spawns at $\sim 4.0\text{ km}$).
This deliberate operational design ensures that:
1. **Multi-Track Tactical Concurrency**: Trainees are immediately confronted with multiple simultaneous active tracks across distinct azimuth sectors rather than sequential, isolated target presentations.
2. **Behavioral Contrast & Discrimination**: The bird exhibits low speed ($4 - 14\text{ m/s}$), small radar cross section ($0.001\text{ m}^2$), and erratic pseudorandom wander trajectories. Spawning it at $1.8\text{ km}$ ensures it is detected and tracked concurrently with the high-speed ($30\text{ m/s}$) inbound threat, forcing the trainee to prioritize tracks using kinematic cues rather than proximity alone.

### MSL vs AGL Altitude Convention
- All actor altitude coordinates ($Z$) in the simulation world model represent height **Above Mean Sea Level (MSL)** in meters.
- Defended asset position is at MSL altitude $Z = 0\text{ m}$ with the radar mast at $Z = 15\text{ m}$ MSL.
- When procedural terrain is evaluated (Part B), the local Above Ground Level (AGL) height is computed dynamically as:
  $$\text{AGL}(x, y, z) = z - \text{terrainHeight}(x, y)$$
- Physical collision with terrain or surface clutter occurs if $\text{AGL}(x, y, z) \le 0\text{ m}$. Clutter degradation factors for radar detection are parameterized directly by this local AGL height.

## ADR-007: Phase 3A Swarm Tactics, Procedural Generator, and Effector Accounting

### 1. Swarm Formation Mechanics Without Boids
To maintain 100% deterministic cross-platform repeatability and eliminate unbounded computational complexity, swarm formations avoid multi-agent boids simulation. Instead, swarm tactics (`saturation`, `split`, `decoy_screen`) are computed via deterministic vector projections:
- A virtual swarm leader trajectory points directly toward the defended asset coordinate `(0, 0, 0)`.
- Individual swarm members receive lateral and longitudinal offset vectors perpendicular and parallel to the leader ingress bearing, parameterized with deterministic PRNG jitter.
- Terrain clearance ($\ge 20\text{ m}$ AGL) is enforced dynamically by clamping $Z \ge \text{terrain.heightAt}(x, y) + 20$.

### 2. Time-to-Impact Hostile Prioritization
Under swarm conditions with up to 16 concurrent hostile strikers, raw range is an inadequate threat metric (e.g. an FPV at 1200m traveling at 30 m/s reaches the asset in 40s, while a quad at 900m moving laterally may never hit). `referenceOperator` ranks all confirmed hostile threats by estimated time-to-impact ($\text{TTI} = \text{rangeM} / -\text{closingRateMps}$), engaging the most imminent threat first.

### 3. Decoy Drone & Fiber FPV Discrimination Rules
- `fpv_fiber`: Physical wire guidance removes all RF command and video telemetry. The passive RF detector categorizes it as `silent`. The reference bot detects this absence of RF emissions and directs hard-kill autocannon engagements rather than RF jamming, avoiding the -5 wasted jammer penalty.
- `decoy_drone`: Built to draw fire from defensive systems. It presents an RCS in the `medium` bucket ($0.05\text{ m}^2$) while remaining RF-silent. The reference bot assesses contacts with `rfStatus === 'silent'` and `rcsBucket === 'medium'` as `decoy_drone`, withholding fire to preserve ammunition and avoid the -3 decoy penalty.

### 4. Extended Operator Console Hotkeys
- `Shift + A`: Batches acknowledgments for all confirmed, unacknowledged tracks in chronological detection order.
- `N`: Instantly cycles focus to the next unclassified confirmed track ordered by proximity to the defended asset.
- `6` and `7`: Hotkey assignments for `fpv_fiber` ("FPV-type (no RF)") and `decoy_drone` ("Decoy / low-cost target").

## ADR-008: Neutral Generic Tactical Branding & Insignia Prohibition
- **Project Rule**: Strictly prohibit the use of real military unit names, national branch designations, or real-world military insignia (including Indian Air Force / IAF roundels, emblems, or heraldry).
- **Design Philosophy**: As an autonomous training and research simulator, all branding and visual assets must use neutral, generic illustrative symbols. The application mark is a geometric vector crosshair/octagonal shield representing generic air defense intercept concepts. Training project codenames (such as VAJRA) are treated as purely fictional designations with no real-world military attribution.

## ADR-009: Phase 3C Benchmark Discipline, Capacity Generator, Decoys, and RF Ambiguity

### 1. ridge_runner Hostile fixed_wing_recon Rationale
- **When**: Introduced during Phase 2B multi-threat expansion.
- **Why**: `ridge_runner` was authored to evaluate terrain masking and low-altitude radar shadowed ingress along ridgelines. Incorporating a high-altitude `fixed_wing_recon` hostile (altitude >= 160m, speed >= 20 m/s, medium RCS) alongside low-altitude terrain huggers tests the operator's ability to maintain dual-threat coverage: jamming low-altitude RF rotary threats while managing long-range standoff reconnaissance. A harmless bird in this slot would remove radar clutter/altitude discrimination pressure.

### 2. Full Scoring Weight Scheme
The session score weighted mean distributes total contact weight (1.0) dynamically between hostile and neutral contacts:
- Each hostile contact receives a fixed weight of $w_h = 0.40$.
- If $N_h$ hostiles are present:
  - If $N_h \times 0.40 \ge 1.0$ (or if no neutrals exist), each hostile receives weight $1.0 / N_h$, and neutral weight is 0.
  - If neutrals are present ($N_n > 0$) and $N_h \times 0.40 < 1.0$, the remaining weight pool $1.0 - (N_h \times 0.40)$ is divided equally among neutrals: $w_n = \frac{1.0 - (N_h \times 0.40)}{N_n}$.
- Total contact weights sum to exactly 1.0 across all actors.
- Final session score is computed as:
  $$\text{total} = \text{clamp}\left(0, 100, \text{round}\left(\sum_i (w_i \cdot \text{contactScore}_i) - \sum_k \text{penaltyPoints}_k\right)\right)$$
- Penalties include:
  - `ASSET_HIT`: -30
  - `FALSE_ENGAGEMENT` (ghost/clutter/neutral): -10
  - `ENGAGE_CIVILIAN_QUAD`: -10
  - `ENGAGE_DECOY`: -3
  - `WASTED_JAMMER_NON_RF`: -5

### 3. RF 'ambiguous' Status Rationale
- When two or more active tracks lie within $6.0^\circ$ of an RF emission line bearing, the passive RF direction-finding array cannot reliably resolve emitter attribution due to antenna beamwidth limits.
- Assigning `rfStatus = 'ambiguous'` and clearing `rfSignature` prevents erroneous jamming:
  - `referenceOperator` never fires the RF jammer at an ambiguous track (preventing the -5 wasted jammer penalty).
  - Inside gun range ($\le 1000\text{ m}$), the operator engages with kinetic autocannon.
  - Beyond 1000m, the operator waits or slews EO to visually resolve the ambiguous contact.

### 4. Capacity-Aware Scenario Generator Model
- Evaluates whether a generated swarm is mathematically solvable given effector service constraints:
  - Jammer: greedy service queue, 2.0 s dwell, $p = 0.85$, RF-controlled threats only.
  - Gun: greedy burst queue, 0.5 s per burst, $P_k$ from kinetic formula at 500m engagement range, maximum 20 bursts.
- $\text{capacityRatio} = \frac{\text{required service time}}{\text{available time before impact}}$.
- Procedural generator enforces tier limits:
  - Recruit / Operator: $\text{capacityRatio} \le 0.60$
  - Veteran: $\text{capacityRatio} \le 0.80$
  - Elite: Unconstrained
- Generator re-rolls up to 8 attempts; if still exceeding the tier limit, it systematically drops striker drones until the ratio complies.

## ADR-010: Phase 4A Doctrine Scoring v2, Observability Exclusion, Jammer Waiver, and ROE Cap

### 1. Observability Exclusion Rationale
- **Context**: In challenging terrain or dense clutter environments, certain actors may never produce a confirmed radar track due to terrain masking, low radar cross section at extreme range, or rapid departure.
- **Decision**: Actors that never produce at least one confirmed radar track are marked `observable: false` and placed into `unobservable: UnobservableContact[]`. They are strictly excluded from the session weighted mean calculation.
- **Rationale**: Operators should not be penalized for physical radar line-of-sight constraints or sensor geometry blind spots beyond operator control. Scoring evaluates tactical decision-making on observable tracks rather than penalizing unobservable reality.

### 2. Jammer Waiver Policy on Non-RF Targets
- **Context**: In multi-target swarm environments with passive RF line-of-bearing strobes, an operator may fire an RF jammer at a target that is ground-truth non-RF (such as `fpv_fiber` or `decoy_drone`) because an RF cue was present.
- **Decision**: When an operator engages a non-RF target with an RF jammer, the fit penalty is graded according to the track's perceived `rfStatus`:
  - `rfStatus === 'emitting'`: 0 pts penalty (1.0 fit score). Penalty waived (`cause: 'fit_wrong_jammer_emitting_waived'`, note: "waived (information_limited)").
  - `rfStatus === 'ambiguous'`: -2 pts penalty (0.6 fit score, `cause: 'fit_wrong_jammer_ambiguous'`).
  - `rfStatus === 'silent'`: -5 pts penalty (0.0 fit score, `cause: 'fit_wrong_jammer_silent'`).
- **Rationale**: If the sensor fusion system indicated an active RF strobe on the contact's bearing, the operator made a doctrinally sound decision based on available sensor information. Penalizing operators for sensor false correlations discourages aggressive soft-kill defense. Conversely, firing a jammer against a known RF-silent track represents procedural negligence.

### 3. Strict Rules of Engagement (ROE) Cap
- **Context**: Engaging civilian infrastructure or non-hostile civilian drones (`commercial_quad`) is a critical breach of air defense rules of engagement.
- **Decision**: In addition to the standard $-25$ mission penalty for engaging a civilian quadcopter, any engagement on a `commercial_quad` triggers `roeCapApplied = true` and caps the session total score at $\le 60$ (`ROE_CAP_SCORE = 60`).
- **Rationale**: High procedural efficiency in neutralizing hostile drones cannot compensate for engaging civilian contacts. Capping the score at 60 ensures that a session involving an ROE civilian violation cannot receive a passing/proficient grade regardless of swarm defense performance.

## ADR-011: Local Session Persistence and Adaptive Training
- **Decision**: Keep trainee, unit, session, and preferences data in browser IndexedDB. Store replayable event logs and scoring version so a saved session can be deterministically re-scored. Export/import uses JSON and merges records by stable IDs.
- **Decision**: Derive skill estimates from completed sessions with an EWMA and recommend only adjacent tiers. Focus modifiers are deterministic and constrained by existing tier ranges; prior scenario fingerprints are avoided where possible.
- **Rationale**: Training records remain on the device, reproducible across sessions, and explainable to the trainee. The adaptive system changes practice emphasis without modifying simulator ground truth or tier definitions.




