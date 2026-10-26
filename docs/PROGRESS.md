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

## 2026-10-26 — Phase 5.1 verification and outcome clarity

- **Penalty constants** (`61383b8`): pinned Bird -5, civilian quad -25, decoy -3, and false track -5 in a regression test. The former “Engaged bird: -25” comparison image came from fabricated screenshot fixture data (the old capture script hard-coded that reason/value); it was not a scoring bug. Real output confirms the -25 penalty belongs to commercial/civilian quad engagements.
- **Real-engine fork demo** (`9a1a340`, helper cleanup `abaac73`): added `npm run fork-demo` and an integration test for Dawn Intrusion / s1. The run forks 100 ticks before the first neutral engagement, executes a no-command branch and a HOLD_FIRE branch, and verifies both replay hashes against their live fork hashes. Since `triggerHappyOperator` alone has no neutral engagement on this seed, the scripted harness records one explicit in-range jammer command after running the bot; this is disclosed in the demo output.
- **Compare wording** (`cbf220a`, unit formatting `b5bcf11`): neutral outcome reads `n/a (neutral)`; hostiles show the outcome text (“Neutralised at 689 m”, “Reached asset”, etc.), not a fractional outcome score. Outcome wording now distinguishes an impacted hostile. Updated the affected Ridge Runner trigger-happy golden; numeric scoring and `SCORE_VERSION` remain 2.2.
- **Fork scenario header** (`005ac59`): TopBar renders SANDBOX for a sandbox source log instead of defaulting to DAWN INTRUSION. A fork inherits its original scenario ID.
- **Real-session browser captures** (`797f471`): regenerated the key-moments, paused-fork banner, and comparison screenshots from the real-engine demo records, with the AAR scrubber positioned on the neutral engagement. Files: `docs/screenshots/phase51-real-key-moments.png`, `docs/screenshots/phase51-real-fork-banner.png`, `docs/screenshots/phase51-real-compare.png`.
- **Verification**: `npm test` — 25 files / 164 tests passed; lint, typecheck, simulator typecheck, and build passed. The real demo prints both compare JSON objects and their narrative; sample hashes are `169cecccba7e18` (no further commands) and `10d45a7e98d4d8` (HOLD_FIRE).
- **Scoring/bench**: no numeric scoring changes; score version remains 2.2. No benchmark file was generated.
- **Deviations**: the test harness adds the single explicit neutral jammer command because the requested bot-only seed run does not engage a neutral. The extension uses the real deterministic engine and is logged in the recorded session.
- **Open issues**: no Phase 5.1 issue known. Previously documented calibration target issues remain unchanged.

## 2026-10-26 — Phase 6A commander simulation and scoring

- **Step 0 AAR polish** (`33f8397`): comparison shows pre-clamp points and their delta beside clamped totals; repeated penalties are grouped in comparison and debrief; session labels include scenario, date, and short ID.
- **Single-site regression guard** (`23ecb9d`): committed-hash test covers all 45 scenario/bot/seed rows in `docs/benchmarks/019fdb1.txt`. Missile inventory defaults to zero; commander-specific options preserve legacy single-site defaults.
- **Abstract missile effector** (`0d8910e`): added the generic 3 km missile effector, inventory rejection/consumption, resolution and cycle timing, asset-hit counting, and per-engine mission-continuation options.
- **Commander simulation and scoring** (`dd0bacd`): deterministic generated multi-site raids and intel, site operator with ROE/missile authorization, event-sourced commands, reserve transfers, snapshot/replay, truth-free commander view, cost ledger, raid scoring (`raid-1.0`), causes, and hand-calculated tests.
- **Policy benchmark and target** (`e92afb3`): added passive, heuristic, missile-happy, and test-only oracle baselines; benchmark covers recruit/operator/veteran × four policies × 20 seeds. The 30-seed-per-tier ordering target is committed and remains failing; no policy, scenario, or score constants were tuned to force it.
- **Committed evidence** (`1321aa0`): benchmark report is `docs/benchmarks/e92afb3.txt`; reproducible sample log and score are `docs/benchmarks/commander-demo-operator-s1.json` (operator tier, seed `commander-demo-s1`, total 60 / Marginal, CER 20.6). The sample is capped at 4,800 ticks and still has one active actor, so it is an illustrative max-tick record rather than a fully resolved raid.
- **Verification**: `npm test` — 28 files / 174 tests passed. `npm run lint`, `npm run typecheck`, `npm run typecheck:sim`, and `npm run build` passed. The 45-hash single-site guard passed. `npm run bench` generated the committed report above. `npm run test:targets` — tracker passes (overall age-8 p90 6.07 m/s); legacy elite oracle mean fails at 94.15 > 90 and veteran reference mean fails at 34.95 < 55. Commander ordering successes / 30: recruit oracle≥heuristic 29, heuristic>missile-happy 29, heuristic>passive 0; operator 19/28/13; veteran 23/28/17.
- **Open issues / doubts**: commander ordering fails the required 24/30 thresholds, especially heuristic versus passive at recruit. The current sample JSON ends at the 4,800-tick cap with one active actor. Legacy Phase 4A target failures remain unchanged. Existing uncommitted user UI/Lenis edits and background assets were not staged or modified by Phase 6A commits.

## 2026-10-26 — Phase 6A.1 commander decision sensitivity and raid capacity

- **Capacity scarcity** (`a36074b`): the deterministic capacity check now returns per-site gun-burst and missile needs. Raid pools are derived from summed computed needs at scarcity 1.0 / 0.85 / 0.7 for recruit / operator / veteran; generated raids retain the computed per-site needs.
- **Resolution bound** (`3aaeaec`): generated schedules complete as `all_resolved` when unattended by tick 4,200; test coverage runs 20 seeds at each of the three tiers.
- **Oracle and target** (`be19558`, `cc49bbd`): test-only oracle prioritizes modeled main-effort gun need, fills other site needs, holds any surplus and missile stock at main effort, and authorizes missiles only there. The target uses the requested 27/30 oracle threshold, 24/30 heuristic threshold, and recruit ties. It remains unmet: oracle >= heuristic is recruit 30/30, operator 20/30, veteran 21/30; heuristic vs passive is recruit 29/30, operator 15/30, veteran 5/30. Bots/constants were not tuned to force these targets.
- **Sensitivity** (`52deff7`): `scripts/commander-sensitivity.ts` reproduces 20 raids per tier for allocation, missile authority, ROE, and reserve settings. `free` missile authority is sharply worse (operator mean 72.15 / CER 14.38; veteran 63.75 / CER 17.60) than `asset_threat` (91.25 / 1.51; veteran 78.00 / 6.18). Allocation varies only modestly under the shared heuristic reserve-retasking logic; ROE has no measured effect in these runs because the reference site operator's engagement decisions do not cross the tight-quality threshold. Reserve changes are small/mixed: 0/20/40% give operator totals 90.35/91.25/91.70 and veteran 79.40/78.00/75.90.
- **Resolved sample ledger** (`f53a7aa`): regenerated `docs/benchmarks/commander-demo-operator-s1.json`; heuristic commander finishes all sites at tick 2,929 with score 100, attacker destroyed 3.5, defender spent 0.2, CER 0.06.
- **Benchmark** (`64090b3`): generated `docs/benchmarks/cc49bbd.txt` with v1/v2.2 scripted results and raid results (raid score version 1.0).
- **Verification**: `npm test` — 28 files / 176 tests passed; lint, typecheck, simulator typecheck, and build passed. `npm run test:targets` fails the commander ordering target (operator 20/30 and veteran 21/30 versus 27/30; heuristic vs passive operator 15/30 and veteran 5/30 versus 24/30), plus pre-existing Phase 4A elite mean 94.15 > 90 and veteran reference mean 34.95 < 55. Tracker p90 age 8 remains 6.07 m/s overall.
- **Open issues / doubts**: commander ordering target remains unsatisfied. Heuristic-vs-passive would require changing the heuristic bot, which the phase instruction prohibits; oracle misses remain despite a capacity-aware test-only allocation. Existing Phase 4A calibration targets also remain failing. User UI/Lenis files and `bg.png` / `bg1.png` are still uncommitted and untouched by this phase.

## 2026-10-26 — Phase 6B commander leverage and interface

- **Step 0 fixes** (`9efd41d`): unattended sessions allocate 40% evenly and retain 60% as reserve, with missile authorization held. Allocation sensitivity runs disable reserve retasking. Missile CER counts qualifying prevented damage (20% of site value for a timely unsupported striker kill), asset-threat authorization checks the <10 s window and current cover, ROE postures now change engagement behavior, and raid grades use the four standard labels.
- **Scoring evidence/version** (`2fae7a7`): benchmark output labels commander scoring `raid-1.1`; doctrine scoring remains v2.2. Evidence is `docs/benchmarks/2fae7a7.txt`, committed in `ddccfc3`.
- **Sensitivity** (20 seeds per tier): allocation means total/preservation/CER for recruit/operator/veteran were even `100/100/.0445; 89.75/89.935/1.1705; 80.2/82.77/4.085`, by-intel `100/100/.0445; 89.3/89.385/1.614; 80.9/83.005/3.4475`, oracle `100/100/.046; 91.85/89.685/.755; 79.35/82.095/4.215`, all-main `100/100/.046; 91.35/89.685/.7225; 80.45/82.37/3.4475`, all-wrong `100/100/.0375; 92.15/89.585/.169; 79.15/82.04/4.3685`. Allocation effects are mixed and comparatively modest; they were not tuned.
- **Sensitivity continued**: missile auth hold `100/100/.052; 93.15/89.555/.1815; 89/80.4/.2245`; asset-threat `100/100/.052; 91.25/90.14/1.51; 77.3/84.735/6.2915`; free `100/100/.052; 72.15/90.275/14.381; 63.75/85.255/17.6015`. ROE tight `96.65/96.765/.039; 91.7/85.37/.076; 82.75/73.445/1.2445`; standard `100/100/.052; 91.25/90.14/1.51; 77.3/84.735/6.2915`; free `99.75/100/.066; 81.2/93.67/7.2095; 69.1/89.74/10.232`. Reserve 0% `100/100/.06; 90.35/90.445/1.7845; 78.4/84.205/6.244`; 20% `100/100/.052; 91.25/90.14/1.51; 77.3/84.735/6.2915`; 40% `100/100/.052; 91.7/92.145/1.3645; 74.7/87.16/8.0215`. Missile authorization and ROE are the clearest score levers. More reserve trades lower veteran preservation for a larger held pool.
- **Commander UI** (`1ebfad2`): added `#/commander`, planning with site intel/value, weighted resource sliders/reserve, per-site ROE/auth, live theatre map and inventory/status cards, reserve retasking/transfers, read-only trainee radar tracks, pause/speed/autopilot, score ledger/debrief, and completed-raid IndexedDB persistence tagged `mode: 'commander'`.
- **Per-site debrief detail** (`2f7f924`): expanded each disclosure to show all four `ScoreReportV2` subscores, grade, penalties, and commander causes.
- **Tests** (`2be8646`): added deterministic same-seed tight/free behavior, synthetic prevention/CER score arithmetic, standard-grade and view-leak checks, allocation conservation/tick-zero command checks, and setup/live/debrief markup checks.
- **Verification**: full `npm test` passed at 29 files / 180 tests before the final allocation-helper regression; the final focused Phase 6B + commander run passed 2 files / 13 tests. Lint, both typechecks, and production build passed. Build emits a large-chunk advisory (512.69 kB JS) but succeeds. `npm run bench` succeeds and writes the committed report above.
- **Calibration targets**: `npm run test:targets` has 3 failures among 7 tests. Commander target: recruit oracle>=heuristic 30/30, heuristic>passive 29/30; operator 20/30 and 14/30 (thresholds 27/24); veteran 20/30 and 4/30 (thresholds 27/24). Existing failures remain elite oracle mean 94.15 > 90 and veteran reference mean 34.95 < 55. Tracker passes at age-8 overall p90 6.07 m/s. No thresholds or bots were tuned.
- **Deviations / doubts**: Chrome is installed but Puppeteer failed to start it in this managed Windows session (`The user name or password is incorrect` / DevTools endpoint timeout); the in-app browser could not connect to the local preview. Requested screenshots were therefore not produced. Vitest is Node-only and has no jsdom dependency, so component checks use static rendering and pure command construction rather than jsdom event simulation. The missile-improvement regression uses the real scoring helpers with a synthetic high-value site calculation, not a full engine interception; end-to-end missile prevention attribution remains worth strengthening. Phase 6A commander ordering and Phase 4A calibration targets remain open.
