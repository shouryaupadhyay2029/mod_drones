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
