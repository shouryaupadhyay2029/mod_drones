# Architectural Decision Records (ADRs)

## ADR-001: Strict Determinism in Simulation Core

### Status
Accepted

### Context
The MoD Drone & Counter-Drone Threat Simulation Trainer is an offline, browser-based training simulator. For effective evaluation, scoring, after-action reviews (AAR), and distributed multiplayer or fork-and-replay branching, the simulation must be 100% deterministic:
Given the same seed and sequence of scheduled commands, any run on any compliant JavaScript engine must yield the exact same simulation states and state hashes down to the bit.

### Decision
1. **Forbidden Primitives in `src/sim`**:
   - `Math.random`: Must never be used. All pseudorandom numbers must originate from `Rng` (`mulberry32` with `xmur3` seeding).
   - `Date.now`, `new Date()`, `performance.now`: Must never be used in simulation logic. Simulation time is measured exclusively as an integer tick counter.
   - `setTimeout`, `setInterval`: Strictly forbidden in `src/sim/core`. Real-world wall-clock timers must never drive or influence simulation progression.
   - Unordered iteration: Iteration over unordered structures (`Set`, `Map`) is permitted only when insertion order is rigorously guaranteed and documented; ordered arrays with incremental numeric IDs are preferred.
   - Imports: `src/sim` must never import anything from `src/app` or browser DOM APIs.

2. **Automated Enforcement**:
   - ESLint rules (`no-restricted-globals`, `no-restricted-syntax`, `no-restricted-imports`) enforce these prohibitions statically on all files under `src/sim/**`.
   - `tsconfig.sim.json` compiles `src/sim` with `lib: ["ES2022"]` strictly without DOM or browser types, preventing accidental leakage of DOM APIs.

3. **Determinism Audit & Collection Iteration**:
   - `src/sim/core/hash.ts` (`Object.keys(record).filter(...).sort()`): Iteration order is deterministic because `Object.keys()` is filtered and immediately sorted lexicographically via `.sort()` before mapping, guaranteeing identical key order regardless of engine insertion history.
   - `src/sim/core/rng.ts` (`Object.keys(states).sort()`): Iteration order is deterministic because keys are sorted lexicographically before iteration.
   - `src/sim/core/rng.ts` (`new Map<string, Rng>()`): Fork map keys are serialized in `getAllForkStates()` by sorting them explicitly (`Array.from(this.forks.keys()).sort()`), ensuring iteration order does not depend on insertion history.
   - `src/sim/worker/sim.worker.ts` (`setInterval`): Allowed exclusively in worker execution runner to drive the fixed-tick loop (`context.setInterval(stepLoop, 1000 / TICK_RATE)`); simulation logic in `src/sim/core` contains zero timers.

4. **Phase 1A Deterministic Math & Transcendental Functions**:
   - `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan`, `Math.atan2`, `Math.exp`, `Math.log`, `Math.pow`, `Math.hypot`, and the exponentiation operator (`**`) are strictly banned across all of `src/sim/**` via ESLint rules.
   - All angular and trigonometric calculations in `src/sim` are provided by `src/sim/core/dmath.ts`, using minimax polynomials with range reduction (+, -, *, / only).
   - `Math.sqrt`, `Math.abs`, `Math.min`, `Math.max`, and `Math.floor` are verified IEEE-754 compliant and permitted in `src/sim`.

### Consequences
- **Positive**: Complete reproducibility of training sessions, deterministic replay verification, instantaneous snapshot save/restore, and reliable automated regression testing.
- **Negative**: Developers cannot rely on standard JavaScript timing or random utilities; all stochastic behavior must thread through the deterministic `Rng` instance.


## ADR-002: Commercial Quad Transit Geometry and Reference Score Behavior

### Status
Accepted

### Context
In Phase 1A, the scripted scenario "Dawn Intrusion" spawns a commercial quadcopter at $t \approx 20\text{ s}$ traversing a lateral transit corridor passing $\approx 1.2\text{ km}$ from the defended asset.

### Decision
The commercial quadcopter transit flight path in `src/sim/scenarios/dawnIntrusion.ts` was updated from initial/terminal coordinates of `vec3(-4000, quadStandoffY, 90)` $\to$ `vec3(4000, quadStandoffY, 90)` to `vec3(-1100, quadStandoffY, 90)` $\to$ `vec3(1100, quadStandoffY, 90)`.

### Rationale
At the previous 8,000 m transit distance and 12 m/s cruise speed, the commercial quad required over 666 seconds (13,333 simulation ticks) to complete its transit—greatly exceeding the scenario's 240-second (4,800 ticks) mission timeout. Consequently, the commercial quad could never exit the operational sector naturally, preventing the mission rules engine from ever evaluating an `all_resolved` completion. Adjusting the path length to 2,200 m allows the quad to traverse the designated corridor in $\approx 183\text{ seconds}$ ($\approx 3,660\text{ ticks}$), transiting across the radar scope and exiting the operational sector cleanly before the scenario limit.

### Reference Score Movement on Seeds s2 and s4
On seeds s2 and s4, the previous spawn coordinate at $X = -4000\text{ m}$ placed the quad at an initial slant range of $>4.1\text{ km}$. For a small commercial quad with reference RCS of $0.01\text{ m}^2$, radar detection probability ($P_d$) at $>4\text{ km}$ is near the sensitivity boundary, which caused intermittent tentative blips, missed sweeps, and occasional delayed track confirmation. Because the reference operator acknowledges tracks upon confirmation, this fringe detection jitter caused acknowledgment latency on seeds s2 and s4 to slip just outside the $\le 3.0\text{ s}$ perfect detection window, reducing the contact detection sub-score and resulting in overall scores of 94. With the updated path starting at $X = -1100\text{ m}$ (range $\approx 1.6\text{ km}$), the quad appears well within high-confidence detection range, confirming consistently on the second sweep and enabling immediate acknowledgment within the 3.0 s threshold (yielding 100 on all seeds). This change was enacted solely to ensure physically consistent transit flight times and clean sector exit mechanics, and was not designed or tuned to manipulate scoring thresholds.
