import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { vec3 } from '../src/sim/core/vec.js';
import { Actor } from '../src/sim/model/actors.js';
import { ThreatClassId } from '../src/sim/model/threats.js';
import { Track } from '../src/sim/model/tracks.js';
import { SimEvent } from '../src/sim/core/types.js';
import {
  computeClassificationScore,
  computeDetectionScore,
  computeOutcomeScore,
  getJammerFitPenalty,
  gradeForScore,
  scoreSessionV2,
} from '../src/sim/scoring/doctrine.js';
import { GroundTruthSummary } from '../src/sim/scoring/basic.js';

function createMockActor(id: number, classId: ThreatClassId, state: 'active' | 'neutralized' = 'active', neutralizedDist?: number): Actor {
  return {
    id,
    classId,
    pos: vec3(0, 500, 50),
    vel: vec3(0, -25, 0),
    state,
    neutralizedDistanceToAsset: neutralizedDist,
    trajectory: { kind: 'constant_velocity' },
    history: [],
  };
}

function createMockTrack(
  trackId: number,
  actorId: number,
  state: 'tentative' | 'confirmed' = 'confirmed',
  opts?: Partial<Track>
): Track {
  return {
    trackId,
    actorId,
    state,
    estimatedPos: vec3(0, 500, 50),
    estimatedVel: vec3(0, -25, 0),
    lastDetectedTick: 100,
    firstSeenTick: 0,
    consecutiveHits: 5,
    consecutiveMisses: 0,
    totalPlots: 5,
    rcsBucket: 'small',
    measuredRcs: 0.02,
    quality: 0.9,
    acked: false,
    engagementStatus: 'none',
    headingChangeRateSmoothed: 0,
    lastSweepChecked: 100,
    ...opts,
  };
}

describe('Doctrine Scoring v2 Decision Tree Tests', () => {
  it('11. v2.1 positive-ID gate halves first fit and penalizes each pre-classification engagement', () => {
    const actor = createMockActor(1, 'fpv_kamikaze', 'neutralized', 500);
    const track = createMockTrack(1, 1, 'confirmed', {
      assessedClass: 'fpv_kamikaze',
      classifyTick: 120,
    });
    const events: SimEvent[] = [
      { tick: 100, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'gun', rangeM: 500 } },
      { tick: 110, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'gun', rangeM: 500 } },
      { tick: 120, type: 'TRACK_CLASSIFIED', payload: { trackId: 1, assessedClass: 'fpv_kamikaze' } },
      { tick: 121, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'gun', rangeM: 500 } },
    ];

    const report = scoreSessionV2({ actors: [actor], tracks: [track], events });
    const fitNode = report.perContact[0]?.decisionPath.find((node) => node.id === 'effector_fit');

    expect(report.perContact[0]?.fit).toBeCloseTo(0.4, 5);
    expect(fitNode?.cause).toBe('engaged_unclassified');
    expect(fitNode?.note).toContain('fit x0.5');
    expect(report.penalties.filter((penalty) => penalty.reason.includes('before it was classified')))
      .toEqual([
        { reason: 'Engaged hostile (fpv_kamikaze) before it was classified: -5', points: 5 },
        { reason: 'Engaged hostile (fpv_kamikaze) before it was classified: -5', points: 5 },
      ]);
  });

  it('uses the later of classification and effector range entry as the latency origin', () => {
    const actor = createMockActor(1, 'fpv_kamikaze', 'neutralized', 800);
    const track = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 0,
      acked: true,
      ackTick: 0,
      assessedClass: 'fpv_kamikaze',
      classifyTick: 10,
    });
    const report = scoreSessionV2({
      actors: [actor],
      tracks: [track],
      events: [
        { tick: 100, type: 'TRACK_IN_RANGE', payload: { trackId: 1, effector: 'jammer' } },
        { tick: 160, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'jammer' } },
      ],
    });
    expect(report.perContact[0]?.firstEngagementLatencySec).toBe(3);
    expect(report.perContact[0]?.decisionPath.find((node) => node.id === 'engagement_latency')?.points).toBe(11);
  });

  it('records each trainee-visible effector range crossing once per track', () => {
    const engine = new Engine('range-events-s1', 'dawn_intrusion');
    while (!engine.missionState.ended && engine.world.tick < 4800) engine.step();
    const rangeEvents = engine.getEvents().filter((event) => event.type === 'TRACK_IN_RANGE');
    const eventKeys = rangeEvents.map((event) => `${String(event.payload?.trackId)}:${String(event.payload?.effector)}`);
    expect(new Set(eventKeys).size).toBe(eventKeys.length);
    expect(engine.getTraineeView().events.some((event) => event.type === 'TRACK_IN_RANGE')).toBe(true);
    expect(rangeEvents.every((event) => ['jammer', 'gun'].includes(String(event.payload?.effector)))).toBe(true);
  });

  it('12. v2.1 mission failure cap and score grade bands', () => {
    const actor = createMockActor(1, 'bird');
    const track = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 0,
      acked: true,
      ackTick: 0,
      assessedClass: 'bird',
      classifyTick: 0,
    });
    const report = scoreSessionV2({
      actors: [actor],
      tracks: [track],
      events: [{ tick: 20, type: 'ASSET_HIT', payload: { actorId: 1 } }],
      assetHit: true,
    });

    expect(report.total).toBe(50);
    expect(report.grade).toBe('Marginal');
    expect(gradeForScore(49)).toBe('Unsatisfactory');
    expect(gradeForScore(50)).toBe('Marginal');
    expect(gradeForScore(69)).toBe('Marginal');
    expect(gradeForScore(70)).toBe('Competent');
    expect(gradeForScore(84)).toBe('Competent');
    expect(gradeForScore(85)).toBe('Proficient');
  });

  // 1. Unit: detection linear interpolation
  it('1. Unit: detection linear interpolation (<=3s => 1.0, 11.5s => 0.5, 20s => 0.0, never acked => 0.0)', () => {
    expect(computeDetectionScore(3.0)).toBe(1.0);
    expect(computeDetectionScore(2.0)).toBe(1.0);
    expect(computeDetectionScore(11.5)).toBeCloseTo(0.5, 4);
    expect(computeDetectionScore(20.0)).toBe(0.0);
    expect(computeDetectionScore(25.0)).toBe(0.0);
    expect(computeDetectionScore(undefined)).toBe(0.0);

    // End-to-end via scoreSessionV2
    const actor = createMockActor(1, 'fpv_kamikaze');
    // Acked in 3.0s (60 ticks after confirmed at tick 20)
    const track1 = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 20,
      acked: true,
      ackTick: 80, // (80 - 20) / 20 = 3.0s
    });
    const res1 = scoreSessionV2({
      actors: [actor],
      tracks: [track1],
      events: [],
    });
    expect(res1.perContact[0]?.d).toBe(1.0);

    // Acked in 11.5s (230 ticks after confirmed at tick 20)
    const track2 = createMockTrack(2, 1, 'confirmed', {
      confirmedTick: 20,
      acked: true,
      ackTick: 250, // 230 / 20 = 11.5s
    });
    const res2 = scoreSessionV2({
      actors: [actor],
      tracks: [track2],
      events: [],
    });
    expect(res2.perContact[0]?.d).toBeCloseTo(0.5, 3);

    // Acked at 20s
    const track3 = createMockTrack(3, 1, 'confirmed', {
      confirmedTick: 20,
      acked: true,
      ackTick: 420, // 400 / 20 = 20.0s
    });
    const res3 = scoreSessionV2({
      actors: [actor],
      tracks: [track3],
      events: [],
    });
    expect(res3.perContact[0]?.d).toBe(0.0);

    // Never acked
    const track4 = createMockTrack(4, 1, 'confirmed', {
      confirmedTick: 20,
      acked: false,
    });
    const res4 = scoreSessionV2({
      actors: [actor],
      tracks: [track4],
      events: [],
    });
    expect(res4.perContact[0]?.d).toBe(0.0);
  });

  // 2. Unit: outcome distance bands
  it('2. Unit: outcome distance bands (>=400m => 1.0, 300m => 0.5, 199m => 0.0)', () => {
    expect(computeOutcomeScore(true, 400)).toBe(1.0);
    expect(computeOutcomeScore(true, 500)).toBe(1.0);
    expect(computeOutcomeScore(true, 300)).toBe(0.5);
    expect(computeOutcomeScore(true, 200)).toBe(0.5);
    expect(computeOutcomeScore(true, 199)).toBe(0.0);
    expect(computeOutcomeScore(false, 500)).toBe(0.0);
    expect(computeOutcomeScore(true, 500)).toBe(1.0);

    const actor400 = createMockActor(1, 'fpv_kamikaze', 'neutralized', 450);
    const track = createMockTrack(1, 1, 'confirmed');
    const res400 = scoreSessionV2({
      actors: [actor400],
      tracks: [track],
      events: [],
    });
    expect(res400.perContact[0]?.outcome).toBe(1.0);

    const actor300 = createMockActor(2, 'fpv_kamikaze', 'neutralized', 300);
    const track300 = createMockTrack(2, 2, 'confirmed');
    const res300 = scoreSessionV2({
      actors: [actor300],
      tracks: [track300],
      events: [],
    });
    expect(res300.perContact[0]?.outcome).toBe(0.5);

    const actor199 = createMockActor(3, 'fpv_kamikaze', 'neutralized', 199);
    const track199 = createMockTrack(3, 3, 'confirmed');
    const res199 = scoreSessionV2({
      actors: [actor199],
      tracks: [track199],
      events: [],
    });
    expect(res199.perContact[0]?.outcome).toBe(0.0);
  });

  it('keeps a neutralised contact outcome when another hostile hits the asset', () => {
    const neutralized = createMockActor(1, 'fpv_kamikaze', 'neutralized', 500);
    const impacted = createMockActor(2, 'fpv_kamikaze', 'active');
    const result = scoreSessionV2({
      actors: [neutralized, impacted],
      tracks: [createMockTrack(1, 1), createMockTrack(2, 2)],
      events: [{ tick: 200, type: 'ASSET_HIT', payload: { actorId: 2 } }],
    });

    expect(result.perContact.find((contact) => contact.actorId === 1)?.outcome).toBe(1.0);
    expect(result.perContact.find((contact) => contact.actorId === 2)?.outcome).toBe(0.0);
  });

  // 3. Unit: FPV family classification
  it('3. Unit: FPV family classification (fpv_kamikaze vs fpv_fiber = 0.5, vs commercial_quad = 0.0)', () => {
    expect(computeClassificationScore('fpv_kamikaze', 'fpv_kamikaze')).toBe(1.0);
    expect(computeClassificationScore('fpv_fiber', 'fpv_kamikaze')).toBe(0.5);
    expect(computeClassificationScore('fpv_kamikaze', 'fpv_fiber')).toBe(0.5);
    expect(computeClassificationScore('commercial_quad', 'fpv_kamikaze')).toBe(0.0);
    expect(computeClassificationScore(undefined, 'fpv_kamikaze')).toBe(0.0);
  });

  // 4. Unit: jammer waiver matrix
  it('4. Unit: jammer waiver matrix (emitting = 0 waived, ambiguous = -2, silent = -5)', () => {
    expect(getJammerFitPenalty('emitting')).toBe(0);
    expect(getJammerFitPenalty('ambiguous')).toBe(-2);
    expect(getJammerFitPenalty('silent')).toBe(-5);
    expect(getJammerFitPenalty('unknown')).toBe(-5);

    // End-to-end check in scoreSessionV2:
    // Non-RF target is fpv_fiber
    const fiberActor = createMockActor(1, 'fpv_fiber');

    // Case 1: emitting at fire => waived (0 pts penalty)
    const trackEmitting = createMockTrack(1, 1, 'confirmed', { rfStatus: 'emitting' });
    const eventsEmitting: SimEvent[] = [
      { tick: 50, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'jammer' } },
    ];
    const resEmitting = scoreSessionV2({
      actors: [fiberActor],
      tracks: [trackEmitting],
      events: eventsEmitting,
    });
    expect(resEmitting.penalties.some((p) => p.reason.includes('Jammer deployed'))).toBe(false);

    // Case 2: ambiguous at fire => -2 penalty
    const trackAmbiguous = createMockTrack(2, 1, 'confirmed', { rfStatus: 'ambiguous' });
    const eventsAmbiguous: SimEvent[] = [
      { tick: 50, type: 'ENGAGEMENT_STARTED', payload: { trackId: 2, effector: 'jammer' } },
    ];
    const resAmbiguous = scoreSessionV2({
      actors: [fiberActor],
      tracks: [trackAmbiguous],
      events: eventsAmbiguous,
    });
    const penAmbiguous = resAmbiguous.penalties.find((p) => p.reason.includes('Jammer deployed'));
    expect(penAmbiguous).toBeDefined();
    expect(penAmbiguous?.points).toBe(2);

    // Case 3: silent at fire => -5 penalty
    const trackSilent = createMockTrack(3, 1, 'confirmed', { rfStatus: 'silent' });
    const eventsSilent: SimEvent[] = [
      { tick: 50, type: 'ENGAGEMENT_STARTED', payload: { trackId: 3, effector: 'jammer' } },
    ];
    const resSilent = scoreSessionV2({
      actors: [fiberActor],
      tracks: [trackSilent],
      events: eventsSilent,
    });
    const penSilent = resSilent.penalties.find((p) => p.reason.includes('Jammer deployed'));
    expect(penSilent).toBeDefined();
    expect(penSilent?.points).toBe(5);
  });

  // 5. Unit: ROE cap
  it('5. Unit: ROE cap (if civilian_quad engaged, total <= 60)', () => {
    // 1 hostile contact with perfect score (would normally yield 100)
    const hostile = createMockActor(1, 'fpv_kamikaze', 'neutralized', 500);
    const hostileTrack = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 10,
      acked: true,
      ackTick: 30, // 1s
      classifyTick: 40,
      assessedClass: 'fpv_kamikaze',
    });
    const hostileEvents: SimEvent[] = [
      { tick: 50, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'jammer' } },
    ];

    // 1 civilian quad engaged (triggers -25 penalty + ROE cap 60)
    const civilian = createMockActor(2, 'commercial_quad');
    const civilianTrack = createMockTrack(2, 2, 'confirmed', {
      confirmedTick: 10,
      acked: true,
      ackTick: 30,
      assessedClass: 'commercial_quad',
    });
    const civilianEvents: SimEvent[] = [
      { tick: 60, type: 'ENGAGEMENT_STARTED', payload: { trackId: 2, effector: 'gun' } },
    ];

    const res = scoreSessionV2({
      actors: [hostile, civilian],
      tracks: [hostileTrack, civilianTrack],
      events: [...hostileEvents, ...civilianEvents],
    });

    expect(res.roeCapApplied).toBe(true);
    expect(res.total).toBeLessThanOrEqual(60);
  });

  // 6. Unit: asset hit -30
  it('6. Unit: asset hit -30 penalty applied once even with multiple hits', () => {
    const hostile1 = createMockActor(1, 'fpv_kamikaze');
    const hostile2 = createMockActor(2, 'fpv_kamikaze');
    const t1 = createMockTrack(1, 1, 'confirmed');
    const t2 = createMockTrack(2, 2, 'confirmed');

    const events: SimEvent[] = [
      { tick: 100, type: 'ASSET_HIT', payload: { actorId: 1 } },
      { tick: 120, type: 'ASSET_HIT', payload: { actorId: 2 } },
    ];

    const res = scoreSessionV2({
      actors: [hostile1, hostile2],
      tracks: [t1, t2],
      events,
      assetHit: true,
    });

    const assetPenalties = res.penalties.filter((p) => p.reason.includes('Asset was hit') || p.reason.includes('asset was hit'));
    expect(assetPenalties.length).toBe(1);
    expect(assetPenalties[0]?.points).toBe(30);
  });

  // 7. Unit: neutral exclusion from weighted mean
  it('7. Unit: neutral exclusion from weighted mean (unobservable neutral does not affect score)', () => {
    // Observable hostile
    const hostile = createMockActor(1, 'fpv_kamikaze', 'neutralized', 450);
    const hostileTrack = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 10,
      acked: true,
      ackTick: 30,
      assessedClass: 'fpv_kamikaze',
    });
    const hostileEvents: SimEvent[] = [
      { tick: 50, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'jammer' } },
    ];

    const summaryWithoutNeutral: GroundTruthSummary = {
      actors: [hostile],
      tracks: [hostileTrack],
      events: hostileEvents,
    };
    const resA = scoreSessionV2(summaryWithoutNeutral);

    // Add unobservable neutral (state is tentative, never reached confirmed)
    const neutral = createMockActor(2, 'bird');
    const tentativeTrack = createMockTrack(2, 2, 'tentative');

    const summaryWithNeutral: GroundTruthSummary = {
      actors: [hostile, neutral],
      tracks: [hostileTrack, tentativeTrack],
      events: hostileEvents,
    };
    const resB = scoreSessionV2(summaryWithNeutral);

    // Weighted mean and total must be identical because unobservable contact is excluded
    expect(resB.weightedMean).toBe(resA.weightedMean);
    expect(resB.total).toBe(resA.total);
    expect(resB.unobservable.length).toBe(1);
    expect(resB.unobservable[0]?.actorId).toBe(2);
    expect(resB.unobservable[0]?.reason).toBe('unobservable');
  });

  // 8. Purity
  it('8. Purity: scoreSessionV2 called twice with same input returns identical output', () => {
    const hostile = createMockActor(1, 'fpv_kamikaze', 'neutralized', 350);
    const track = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 20,
      acked: true,
      ackTick: 100,
      assessedClass: 'fpv_kamikaze',
    });
    const events: SimEvent[] = [
      { tick: 120, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'gun' } },
    ];

    const summary: GroundTruthSummary = {
      actors: [hostile],
      tracks: [track],
      events,
    };

    const out1 = scoreSessionV2(summary);
    const out2 = scoreSessionV2(summary);

    expect(out1).toEqual(out2);
  });

  // 9. Monotonicity
  it('9. Monotonicity: improving a sub-component never lowers total', () => {
    const actorBase = createMockActor(1, 'fpv_kamikaze', 'neutralized', 250); // half outcome
    const trackSlowAck = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 20,
      acked: true,
      ackTick: 220, // 10s latency
      assessedClass: 'commercial_quad', // wrong class
    });
    const events: SimEvent[] = [
      { tick: 240, type: 'ENGAGEMENT_STARTED', payload: { trackId: 1, effector: 'gun' } },
    ];

    const resBase = scoreSessionV2({
      actors: [actorBase],
      tracks: [trackSlowAck],
      events,
    });

    // 1. Improve detection (ack faster)
    const trackFastAck = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 20,
      acked: true,
      ackTick: 40, // 1s latency
      assessedClass: 'commercial_quad',
    });
    const resFastAck = scoreSessionV2({
      actors: [actorBase],
      tracks: [trackFastAck],
      events,
    });
    expect(resFastAck.total).toBeGreaterThanOrEqual(resBase.total);

    // 2. Improve classification (correct class)
    const trackCorrectClass = createMockTrack(1, 1, 'confirmed', {
      confirmedTick: 20,
      acked: true,
      ackTick: 40,
      assessedClass: 'fpv_kamikaze',
    });
    const resCorrectClass = scoreSessionV2({
      actors: [actorBase],
      tracks: [trackCorrectClass],
      events,
    });
    expect(resCorrectClass.total).toBeGreaterThanOrEqual(resFastAck.total);

    // 3. Improve outcome (neutralized at > 400m)
    const actorFarOut = createMockActor(1, 'fpv_kamikaze', 'neutralized', 500);
    const resFarOut = scoreSessionV2({
      actors: [actorFarOut],
      tracks: [trackCorrectClass],
      events,
    });
    expect(resFarOut.total).toBeGreaterThanOrEqual(resCorrectClass.total);
  });

  // 10. Golden JSON comparison
  it('10. Golden JSON comparison: 3 scenarios x {reference, triggerHappy} on s1 matches docs/golden/*.json', () => {
    const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
    const bots = [
      { name: 'reference', fn: referenceOperator },
      { name: 'triggerHappy', fn: triggerHappyOperator },
    ];

    for (const sc of scenarios) {
      for (const bot of bots) {
        const e = new Engine('s1', sc);
        while (!e.missionState.ended) {
          const cmds = bot.fn(e.getTraineeView());
          for (const c of cmds) e.enqueueCommand(c);
          e.step();
        }
        const report = scoreSessionV2({
          actors: e.actors,
          tracks: e.tracks,
          events: e.getEvents(),
          assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
        });

        const goldenPath = `docs/golden/${sc}_${bot.name}_s1.json`;
        if (existsSync(goldenPath)) {
          const golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
          expect(report, `${sc}/${bot.name} report`).toEqual(golden);
        }
      }
    }
  });
});
