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

- **As of 2026-10-25**, `HEAD` is `78fbbfb` (`feat(tracker): least-squares velocity fit over last <=5 plots (0.4)`). The tracker uses a least-squares velocity fit over up to five plots.
- The changelog ends at **0.7.0 / Phase 4A**. Phase 4B work is not recorded as a committed phase yet.
- The working tree already contains unrelated uncommitted modifications, deletions, and untracked files in scoring, tracker/radar, benchmark, golden, and UI areas. Their completion and verification status are not established here; preserve them and do not include them in documentation-only commits.

## Open issues

- The Phase 4B request remains to be completed and documented: scoring positive-ID gate and asset-hit cap/grades; tracker calibration target reporting without changing sensor noise; versioned benchmark reporting and bot doctrine documentation; local session persistence/rescoring; AAR analytics/dashboard; and deterministic adaptive selection.
- `tests/targets/` currently has a deleted tracker target file in the working tree, so the requested calibration target status needs review before claiming completion.
- No committed Phase 4B changelog entry or verified Phase 4B report is present as of this log.

## Future task entries

Append a dated section after each future item. Include its commit hash(es), what changed, verification/report references, and remaining open issues. Do not rewrite historical entries unless correcting them against repository evidence.
