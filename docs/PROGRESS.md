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

- Phase 4B remains incomplete: local session persistence/rescoring, AAR analytics/dashboard, and deterministic adaptive selection have not been implemented.
- The legacy v1 procedural operator mean targets remain unmet for operator, veteran, and elite in the committed benchmark. The targets remain marked FAIL; no scenario or threshold was tuned.
- Phase 4B has no changelog release entry yet.

## Future task entries

Append a dated section after each future item. Include its commit hash(es), what changed, verification/report references, and remaining open issues. Do not rewrite historical entries unless correcting them against repository evidence.

## 2026-10-25 — Phase 4B Step 0

- **0.1–0.3 — Scoring v2.1** (`8b67b54`): Added positive-ID engagement penalties and effector-fit reduction, an asset-hit score cap, grade bands, report/golden updates, and focused scoring tests.
- **0.4 — Tracker calibration** (`78fbbfb`, existing commit): Least-squares velocity fit over the last five plots. Restored `tests/targets/tracker.test.ts` and `scripts/eval_speed_age.ts`; `npm run test:targets` passes, with overall age-8 p90 6.07 m/s and every class at or below 8.10 m/s.
- **0.5 — Benchmark reporting** (`a6cab28`, report artifact `c8ee714`): Benchmark includes v1/v2.1 scores and scoring-version provenance. Report: `docs/benchmarks/a6cab28.txt`. Determinism checks pass. Legacy v1 operator/veteran/elite means remain below their configured targets.
- **0.6 — Bot rules** (`45a7999`): Documented the general 300 m fallback and noted that no new seed-specific rule was introduced; the prior high-altitude reconnaissance cue remains documented.
- **Verification**: `npm test` (126 passed), lint, both typechecks, build, and `npm run test:targets` pass after the scoring fix.
- **Open issues**: Phase 4B persistence, AAR, and adaptive selection remain; legacy v1 procedural targets remain unmet. User UI/Lenis changes are still uncommitted and untouched by these commits.
