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

3. **Known Caveats and Phase 1 Roadmap**:
   - **Transcendental Functions**: `Math.sin`, `Math.cos`, and `Math.exp` can exhibit minor cross-platform floating-point discrepancies across different JavaScript runtime engines (V8, JavaScriptCore, SpiderMonkey) or hardware architectures.
   - **Phase 1 Mitigation**: From Phase 1 onward, any kinematic, angular, or sensor calculations will utilize a deterministic lookup table or polynomial approximation for trigonometric functions in `src/sim`.

### Consequences
- **Positive**: Complete reproducibility of training sessions, deterministic replay verification, instantaneous snapshot save/restore, and reliable automated regression testing.
- **Negative**: Developers cannot rely on standard JavaScript timing or random utilities; all stochastic behavior must thread through the deterministic `Rng` instance.
