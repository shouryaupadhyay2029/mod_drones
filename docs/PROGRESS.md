# Project Progress

Historical summary from `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/BOT_RULES.md`, and Git history. Dates are commit dates. The changelog has no standalone release entries for 1B.1 or 3B; those summaries identify the corresponding follow-on commits.

## Delivered phases

- **2026-10-21 — Phase 0** (`dbd1590`): deterministic simulation foundation with seeded PRNG, fixed-step clock, event log, snapshots, restore, replay, state hashes, worker harness, and System Check UI.
- **2026-10-21–22 — Phase 1A** (`fa0e804`, `7b2c0ce`): single-drone mission simulation, radar, effectors, trainee-view isolation, basic scoring, scripted scenario completion, and multi-track scoring corrections.
- **2026-10-22 — Phase 1B** (`3228aba`): operator console and headless worker protocol, including radar, track controls, effectors, mission telemetry, and debrief UI.
- **2026-10-22 — Phase 1B.1 follow-on** (`76515eb`, `848653f`, `f26a8cd`, `1cc97f1`): track course/trails, command tick stamping, `src/app`/`src/sim` import-boundary checks, console sizing, and hotkey/navigation refinements. No separate 1B.1 entry exists in the changelog.
- **2026-10-22 — Phase 2A** (`8fc4de1`): environment and deterministic terrain, radar degradation and false tracks, three scripted scenarios, generalized scoring, and acceptance tests.
- **2026-10-22 — Phase 2B** (`d2f9db3`, `ea4905b`, `c8bbf29`, `b8d8852`, `af53f5b`): threat signatures, passive RF sensing, EO/IR turret, sensor-fusion bot behavior, console integration, and acceptance tests.
- **2026-10-22 — Phase 3A** (`2ccedfc`, `b431d11`, `73bd05c`, `83b28c4`): fiber and decoy classes, deterministic swarm tactics, procedural difficulty tiers and fingerprints, scoring/accounting, bot support, and acceptance tests.
- **2026-10-23 — Phase 3B follow-on** (`f37d055`, `1045ac4`, `dfe2e02`, `c01c0a9`): swarm spacing/jitter, neutral geometric branding, bot calibration, seed-variance coverage, and Phase 3B acceptance tests. No separate 3B release entry exists in the changelog.
- **2026-10-24 — Phase 3C** (`3e6e943`, `1584b15`, `3375b5c`, `516e9c7`): capacity-aware scenario generation, RF ambiguity handling, decoy discrimination, benchmark discipline, and acceptance tests/documentation.
- **2026-10-24 — Phase 4A** (`30db7b6`, `bbc9f5a`, `74d52d0`): doctrine scoring v2 with inspectable decision paths, observability exclusion, jammer waivers, ROE cap, and debrief scoring UI.

## Current state

- **As of 2026-10-25**, the tracker uses a least-squares velocity fit over up to five plots (`78fbbfb`). The restored age-8 p90 target passes at 6.07 m/s overall (limit 9 m/s).
- Phase 4B Step 0 scoring, benchmark, and bot-rule work is committed in `8b67b54`, `a6cab28`, `c8ee714`, and `45a7999`; benchmark evidence is `docs/benchmarks/a6cab28.txt`.
- The working tree still contains separate, uncommitted UI/Lenis changes and image assets. They were not included in the Phase 4B commits.

## Open issues

- Phase 4B persistence and AAR analytics are implemented and committed; adaptive logic and scenario focus generation are committed, while their Mission Setup UI integration remains uncommitted in a file that also contains user UI work.
- The legacy v1 procedural operator mean targets remain unmet for operator, veteran, and elite in the committed benchmark. The targets remain marked FAIL; no scenario or threshold was tuned.
- Phase 4B changelog and architecture notes are being added; final UI integration and screenshot verification remain open.

## Future task entries

Append a dated section after each future item. Include its commit hash(es), what changed, verification/report references, and remaining open issues. Do not rewrite historical entries unless correcting them against repository evidence.

## 2026-10-25 — Phase 4B Step 0

- **0.1–0.3 — Scoring v2.1** (`8b67b54`): Added positive-ID engagement penalties and effector-fit reduction, an asset-hit score cap, grade bands, report/golden updates, and focused scoring tests.
- **0.4 — Tracker calibration** (`78fbbfb`, existing commit): Least-squares velocity fit over the last five plots. Restored `tests/targets/tracker.test.ts` and `scripts/eval_speed_age.ts`; `npm run test:targets` passes, with overall age-8 p90 6.07 m/s and every class at or below 8.10 m/s.
- **0.5 — Benchmark reporting** (`a6cab28`, report artifact `c8ee714`): Benchmark includes v1/v2.1 scores and scoring-version provenance. Report: `docs/benchmarks/a6cab28.txt`. Determinism checks pass. Legacy v1 operator/veteran/elite means remain below their configured targets.
- **0.6 — Bot rules** (`45a7999`): Documented the general 300 m fallback and noted that no new seed-specific rule was introduced; the prior high-altitude reconnaissance cue remains documented.
- **Verification**: `npm test` (126 passed), lint, both typechecks, build, and `npm run test:targets` pass after the scoring fix.
- **Open issues**: Phase 4B persistence, AAR, and adaptive selection remain; legacy v1 procedural targets remain unmet. User UI/Lenis changes are still uncommitted and untouched by these commits.

## 2026-10-25 — Phase 4B Parts A–C progress

- **Part A — Local persistence** (`5b437cb`): IndexedDB profiles, units, replayable session storage, deterministic v2 rescoring, import/export/delete controls, and worker autosave integration.
- **Part B — AAR analytics** (`f15d32e`): roster, trainee, unit, and session views; trends, skill matrix, confusion matrix, readiness, sorting, and CSV export. Synthetic analytics tests pass.
- **Part C — Adaptive engine** (`bef673d`, `bd42dff`): EWMA skill estimates, tier recommendations, deterministic focus selection, focus-aware procedural generation, and persisted scenario fingerprints. Adaptive unit tests pass.
- **Current status**: The Mission Setup profile/recommendation controls and session-owner wiring are in the working tree but not committed because `MissionSetup.tsx` and `useMission.ts` contain user UI/Lenis edits. No user UI changes were staged in these commits.
- **Verification**: `npm test` (133 passed), lint, typecheck, simulator typecheck, and build pass. Tracker age-8 p90 passes (6.07 m/s overall). `npm run test:targets` remains FAIL on two pre-existing calibration targets: elite oracle mean 94.15 exceeds 90; veteran reference mean 34.95 is below 55. Neither assertion was changed.
- **Open issues**: Commit the adaptive Mission Setup integration with the user-owned hunks preserved, complete screenshots if Chrome is available, and finish any release documentation. Legacy calibration target failures remain open.

## 2026-10-25 — Phase 4B verification follow-up

- **Mission Setup commit**: `52e34a7` (`MissionSetup: adaptive controls + UI`); the complete file was committed as authorized.
- **Golden evidence**: regenerated goldens are committed in `8b67b54`; `docs/golden/ridge_runner_reference_s1.json` is tracked. Current tree is not clean: remaining files are user UI/Lenis assets and edits, plus a modified `src/sim/systems/radar.ts` (not a UI file).
- **Trigger-happy v2.1 totals**, seed order s1–s5: dawn_intrusion `0, 28, 28, 53, 0`; ridge_runner `0, 0, 0, 0, 0`; city_edge_night `0, 0, 0, 0, 0`. All are below 55.
- **Asset-hit example**: `dawn_intrusion`, seed `s1`, idle operator; `assetHit=true`, total `0`, grade `Unsatisfactory`, reason `Defended asset was hit: -30`.
- **Tracker p90 speed error (m/s)**, age order 3/5/8; before → after: bird `15.73/7.31/8.26` → `11.05/3.66/4.53`; fpv_kamikaze `18.39/13.08/11.51` → `14.01/6.12/6.30`; commercial_quad `12.39/8.17/9.32` → `10.88/4.15/4.44`; decoy_drone `24.06/16.22/14.59` → `19.23/8.83/8.10`; fpv_fiber `17.41/15.25/13.89` → `13.55/5.93/5.54`; ALL `17.64/12.72/11.51` → `13.90/6.02/6.07`. After sample counts by age: `1305/1248/1195` overall.
- **Benchmark source**: `docs/benchmarks/875007c.txt`; scripted score table has explicit `V1` and `V2.1` columns. Machine file remains committed and unchanged.
- **Verification outputs**: `npm test` 21 files / 137 tests pass; lint, typecheck, typecheck:sim, build pass. `npm run test:targets` has 2 failures: elite oracle mean 94.15 > 90 and veteran reference mean 34.95 < 55; tracker target passes at 6.07 m/s overall.

## 2026-10-25 — Phase 4C scoring and session review

- **F1 — Effector-range latency** (`2f604b8`): emits trainee-visible `TRACK_IN_RANGE` once per track and effector at the estimated 1,500 m jammer / 1,000 m gun boundary. Latency starts at the later of classification and range entry for the effector actually used.
- **F2 — Actor outcome** (`9b5c104`; strengthened by `f428de4`): outcome credit follows that actor’s neutralised state and distance. Another actor’s asset impact does not remove the neutralised actor’s outcome points.
- **F3 — Decision causes** (`4c5d673`): added the requested cause tags and cause table in `docs/ARCHITECTURE.md`; tests exercise every tag.
- **F4 — Score v2.2** (`3bf6189`, `f428de4`): updated `SCORE_VERSION`, exact 50 / Marginal asset-hit regression, actor-outcome points, and worker persistence expectation.
- **F5 — Goldens and benchmark** (`1f2fed7`, `019fdb1`, `b7252a4`): regenerated v2.2 goldens; corrected benchmark headers to print the live score version; generated and committed `docs/benchmarks/019fdb1.txt` from clean commit `019fdb1`. Ridge Runner reference s1 remains 100 / Proficient.
- **AAR replay** (`8936fb7`): added `createReplay` with 100-tick snapshots, deterministic backward/forward seeking, detached frames, actor trails, terrain/clutter grid, and LOS radar shadow grid. The AAR session view now has the terrain map, range rings, true/estimated positions, ghost markers, event markers/list, score causes, keyboard/timeline controls, play speeds, and shadow-altitude slider. Debrief can open the synchronized flight review. The replay import rule restricts `createReplay` to `src/app/aar/**`.
- **Verification**: `npm test` passes (22 files, 147 tests); lint, typecheck, simulator typecheck, and build pass. `npm run test:targets` keeps its two existing calibration failures (elite oracle mean 94.15 > 90; veteran reference mean 34.95 < 55); the restored tracker target passes at 6.07 m/s overall. Browser screenshot: `docs/screenshots/phase4c-session-review.png`; seek timing sample: six seeks averaging 13.13 ms on the local ridge-runner fixture.
- **Open issues**: calibration targets remain unmet and unchanged. Existing UI/Lenis files and `bg.png`/`bg1.png` remain as separate uncommitted user work.
- **Adaptive synthetic cases**: new trainee → recruit/none; 80,85,90 with no recent asset hits → veteran/none; 30,35 → operator/none; weak decoy classification at 35, n=3, confidence=.60 → operator/decoys. Returned rationales are pasted in the verification record.

## 2026-10-25 — Phase 5 branching practice and comparison

- **Deterministic fork logs** (`d9ef542`): bumped the log format to v3, migrated old logs, and added `forkSession` with pre-command-at-tick semantics and parent log truncation.
- **Fork worker initialization** (`42b7f93`): added `INIT_FROM_FORK`; fork sessions restore at the requested tick, start paused, and continue through the normal worker protocol.
- **Pure AAR analysis** (`ce04035`): added `compareSessions` and up-to-five `keyMoments` with five-second rewind ticks.
- **Storage and scoring isolation** (`ee52a0e`): migrated IndexedDB v1 records to v2 fork metadata; fork sessions are excluded from analytics and adaptive recommendations.
- **Review and practice UI** (`4720941`): added key-moment and command fork actions, current-tick fork action, paused fork banner with return link, comparison view, original/fork path overlay, and nested fork rows with a separate what-if count. Fork reports save parent/tick metadata and open comparison.
- **Verification**: `npm test` — 24 files / 160 tests passed; lint, typecheck, simulator typecheck, and production build passed. Fork identity matrix covers 10 seeded ticks x 3 scenarios x 2 tier fixtures; worker test confirms changed commands diverge and fresh fork-log replay matches the live fork. Screenshots: `docs/screenshots/phase5-key-moments.png`, `docs/screenshots/phase5-fork-banner.png`, and `docs/screenshots/phase5-compare.png`.
- **Scoring/bench**: scoring was unchanged; no benchmark file was generated.
- **Open issues**: existing calibration target failures documented under Phase 4C remain unchanged. No Phase 5-specific issue is known.
