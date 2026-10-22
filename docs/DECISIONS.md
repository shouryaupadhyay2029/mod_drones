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
