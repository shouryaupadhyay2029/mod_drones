import { describe, expect, it } from 'vitest';
import { keyMoments, compareSessions, ScoreReportV2, SessionLog } from '../src/sim/index.js';

function report(overrides: Partial<ScoreReportV2> = {}): ScoreReportV2 {
  return {
    total: 80,
    grade: 'Competent',
    weightedMean: 80,
    subscores: { detection: 80, classification: 75, engagement: 70, discipline: 100 },
    perContact: [{
      actorId: 4, classId: 'bird', weight: 1, observable: true, d: 1, c: 0, e: 0,
      contactTotal: 0.25, totalScore: 25, assessedClass: 'fpv_kamikaze', outcome: 0, fit: 0, latency: 0,
      decisionPath: [{ id: 'rules_of_engagement', question: 'ROE?', answer: 'Engaged bird', points: 0, maxPoints: 55, cause: 'engaged_neutral' }],
    }],
    unobservable: [],
    penalties: [{ reason: 'Engaged wildlife (bird): -5', points: 5 }],
    roeCapApplied: false,
    reasons: [],
    missionDecisionPath: [],
    ...overrides,
  };
}

function fixtureLog(): SessionLog {
  return { formatVersion: 3, seed: 'key-moments', scenarioId: 'sandbox', commands: [], totalTicks: 120, forkOf: undefined };
}

describe('fork review analytics', () => {
  it('compares totals, grades, subscores, contacts, penalties, and explanatory narrative', () => {
    const original = report();
    const fork = report({
      total: 94,
      grade: 'Proficient',
      subscores: { detection: 80, classification: 100, engagement: 90, discipline: 100 },
      perContact: [{ ...original.perContact[0]!, assessedClass: 'bird', outcome: 1, fit: 1, latency: 1, decisionPath: [] }],
      penalties: [],
    });
    const result = compareSessions(original, fork);
    expect(result.totalDelta).toBe(14);
    expect(result.gradeChange).toBe('Competent → Proficient');
    expect(result.subscoreDeltas).toEqual({ detection: 0, classification: 25, engagement: 20, discipline: 0 });
    expect(result.perContact[0]).toMatchObject({ actorId: 4, classificationA: 'fpv_kamikaze', classificationB: 'bird' });
    expect(result.penaltyDiff).toEqual([{ reason: 'Engaged wildlife (bird): -5', pointsA: 5, pointsB: 0, delta: -5 }]);
    expect(result.narrative).toContain('Holding fire on T4 avoided -5');
    expect(result.perContact[0]?.outcomeA).toBe('n/a (neutral)');
  });

  it('shows meaningful hostile outcomes and n/a for neutral contacts', () => {
    const original = report({ perContact: [
      { ...report().perContact[0]!, actorId: 1, classId: 'fpv_kamikaze', decisionPath: [{ id: 'outcome', question: 'Outcome?', answer: 'Reached asset', points: 0, maxPoints: 33, cause: 'missed_threat' }] },
      { ...report().perContact[0]!, actorId: 2, classId: 'commercial_quad', decisionPath: [] },
    ] });
    const result = compareSessions(original, original);
    expect(result.perContact.map((contact) => [contact.actorId, contact.outcomeA])).toEqual([
      [1, 'Reached asset'],
      [2, 'n/a (neutral)'],
    ]);
  });

  it('returns at most five ordered cause moments and a fork point five seconds earlier', () => {
    const base = report();
    const causes = ['misclassification', 'wrong_effector', 'late_engagement', 'missed_threat', 'false_track_engaged', 'engaged_neutral'];
    const moments = keyMoments(report({
      perContact: causes.map((cause, index) => ({
        ...base.perContact[0]!,
        actorId: index + 1,
        decisionPath: [{ id: cause, question: cause, answer: cause, points: 0, maxPoints: 1, cause }],
      })),
    }), fixtureLog());
    expect(moments).toHaveLength(5);
    expect(moments.every((moment) => moment.forkTick === Math.max(0, moment.tick - 100))).toBe(true);
    expect(moments.map((moment) => moment.cause)).toEqual(causes.slice(0, 5));
  });

  it('returns no key moments when the report has no listed decision causes', () => {
    expect(keyMoments(report({ perContact: [{ ...report().perContact[0]!, decisionPath: [] }] }), fixtureLog())).toEqual([]);
  });
});
