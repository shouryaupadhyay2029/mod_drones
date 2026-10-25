import { describe, expect, it } from 'vitest';
import { SessionRecord, TraineeRecord } from '../src/app/storage/db.js';
import { confusionMatrix, skillMatrix, trendSeries, unitReadiness, unitSessionsCsv } from '../src/app/aar/analytics.js';

function session(id: string, traineeId: string, startedAt: number, total: number): SessionRecord {
  const contact = {
    actorId: 1,
    classId: 'bird' as const,
    weight: 1,
    observable: true,
    d: total / 100,
    c: total / 100,
    e: total / 100,
    contactTotal: total / 100,
    totalScore: total,
    decisionPath: [],
    assessedClass: total >= 80 ? 'bird' as const : 'unknown' as const,
    latency: total / 100,
    fit: total / 100,
  };
  const report = {
    total,
    grade: total < 50 ? 'Unsatisfactory' as const : total < 70 ? 'Marginal' as const : total < 85 ? 'Competent' as const : 'Proficient' as const,
    weightedMean: total,
    subscores: { detection: total, classification: total, engagement: total, discipline: total },
    perContact: [contact],
    unobservable: [],
    penalties: [],
    roeCapApplied: false,
    reasons: [],
  };
  return {
    id,
    traineeId,
    unitId: 'unit-1',
    startedAt,
    scenarioKey: 'dawn_intrusion',
    tier: 'scripted',
    focus: 'none',
    seed: id,
    sessionLog: { formatVersion: 1, seed: id, scenarioId: 'dawn_intrusion', commands: [], totalTicks: 1 },
    scoreVersion: '2.1',
    report,
    summary: {
      total,
      grade: report.grade,
      subscores: report.subscores,
      hostilesTotal: 1,
      hostilesNeutralised: total >= 70 ? 1 : 0,
      assetHit: total < 40,
      durationTicks: 1,
    },
    hash: id,
  };
}

describe('AAR pure analytics', () => {
  it('returns ordered trend points and bounded skill values with direction', () => {
    const sessions = [session('s1', 't1', 1, 20), session('s2', 't1', 2, 40), session('s3', 't1', 3, 80)];
    expect(trendSeries(sessions, 'total', 2).map((point) => point.value)).toEqual([40, 80]);
    const matrix = skillMatrix(sessions, 3);
    expect(matrix.detection_latency).toEqual({ value: 46.7, n: 3, trend: 'up' });
    expect(matrix.classification.bird).toEqual({ value: 46.7, n: 3, trend: 'up' });
    expect(matrix.classification.decoy_drone.n).toBe(0);
  });

  it('builds an assessed versus true classification matrix including unknown', () => {
    const sessions = [session('s1', 't1', 1, 90), session('s2', 't1', 2, 20)];
    const matrix = confusionMatrix(sessions);
    const bird = matrix.labels.indexOf('bird');
    const unknown = matrix.labels.indexOf('unknown');
    expect(matrix.total).toBe(2);
    expect(matrix.counts[bird]?.[bird]).toBe(1);
    expect(matrix.counts[bird]?.[unknown]).toBe(1);
  });

  it('excludes what-if forks from training analytics and exports', () => {
    const parent = session('parent', 't1', 1, 70);
    const fork = { ...session('fork', 't1', 2, 100), isFork: true };
    expect(trendSeries([parent, fork], 'total', 10).map((point) => point.value)).toEqual([70]);
    expect(confusionMatrix([parent, fork]).total).toBe(1);
    expect(unitReadiness([{ id: 't1', callsign: 'Trainee', unitId: 'unit-1', createdAt: 0 }], [parent, fork], 'unit-1', 10).mean).toBe(70);
    expect(unitSessionsCsv([parent, fork], []).split('\r\n')).toHaveLength(2);
  });

  it('calculates unit readiness, 7-day participation, and >1.5 SD outliers', () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    const trainees: TraineeRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      callsign: `Trainee ${i}`,
      unitId: 'unit-1',
      createdAt: 0,
    }));
    const sessions = [
      session('low', 't0', now - 1000, 0),
      ...['t1', 't2', 't3', 't4'].map((id, i) => session(`high-${i}`, id, now - 900 + i, 80)),
      session('outside-window', 't0', now - 8 * 24 * 60 * 60 * 1000, 100),
    ];
    const result = unitReadiness(trainees, sessions, 'unit-1', now);
    expect(result.mean).toBe(74);
    expect(result.traineesAbove70Pct).toBe(80);
    expect(result.participation7Days).toBe(5);
    expect(result.trainees.find((trainee) => trainee.traineeId === 't0')?.outlier).toBe(true);
  });

  it('exports stable CSV columns and safely quotes trainee data', () => {
    const data = session('s1', 't1', 1, 90);
    const csv = unitSessionsCsv([data], [{ id: 't1', callsign: '=SUM(A1:A2)', unitId: 'unit-1', createdAt: 0 }]);
    expect(csv.split('\r\n')[0]).toBe('"callsign","date","scenario","tier","focus","grade","total","asset_hit"');
    expect(csv).toContain('"\'=SUM(A1:A2)"');
    expect(csv).toContain('"Proficient","90","false"');
  });
});
