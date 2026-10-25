import { ThreatClassId } from '../../sim/index.js';
import { SessionRecord, TraineeRecord } from '../storage/db.js';

export type AarMetric = 'total' | 'detection' | 'classification' | 'engagement' | 'discipline';
export type TrendDirection = 'up' | 'down' | 'steady';
export type ClassificationSkillClass =
  | 'bird'
  | 'commercial_quad'
  | 'fpv_kamikaze'
  | 'fpv_fiber'
  | 'decoy_drone';

export interface TrendPoint {
  sessionId: string;
  startedAt: number;
  value: number;
}

export interface SkillValue {
  value: number;
  n: number;
  trend: TrendDirection;
}

export interface SkillMatrix {
  detection_latency: SkillValue;
  classification: Record<ClassificationSkillClass, SkillValue>;
  engagement_latency: SkillValue;
  effector_fit: SkillValue;
  fire_discipline: SkillValue;
  asset_defence: SkillValue;
}

export interface ConfusionMatrix {
  labels: Array<ThreatClassId | 'unknown'>;
  counts: number[][];
  total: number;
}

export interface TraineeReadiness {
  traineeId: string;
  callsign: string;
  sessionsUsed: number;
  meanLastFive: number;
  participation7Days: number;
  outlier: boolean;
}

export interface UnitReadiness {
  unitId: string;
  mean: number;
  traineesAbove70Pct: number;
  weakestSkill: string;
  participation7Days: number;
  trainees: TraineeReadiness[];
}

const CLASSIFICATION_CLASSES: readonly ClassificationSkillClass[] = [
  'bird',
  'commercial_quad',
  'fpv_kamikaze',
  'fpv_fiber',
  'decoy_drone',
];

const CONFUSION_LABELS: Array<ThreatClassId | 'unknown'> = [
  'fpv_kamikaze',
  'fpv_fiber',
  'fixed_wing_recon',
  'commercial_quad',
  'decoy_drone',
  'bird',
  'clutter',
  'unknown',
];

function ordered(sessions: readonly SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
}

function metricValue(session: SessionRecord, metric: AarMetric): number {
  if (metric === 'total') return session.report.total;
  return session.report.subscores[metric];
}

export function trendSeries(
  sessions: readonly SessionRecord[],
  metric: AarMetric,
  window: number
): TrendPoint[] {
  const count = Math.max(0, Math.floor(window));
  if (count === 0) return [];
  return ordered(sessions)
    .slice(-count)
    .map((session) => ({
      sessionId: session.id,
      startedAt: session.startedAt,
      value: metricValue(session, metric),
    }));
}

function trendOf(values: readonly number[]): TrendDirection {
  const split = Math.floor(values.length / 2);
  if (values.length < 2 || split === 0) return 'steady';
  const oldMean = values.slice(0, split).reduce((sum, value) => sum + value, 0) / split;
  const recent = values.slice(split);
  const recentMean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  if (recentMean - oldMean > 2) return 'up';
  if (oldMean - recentMean > 2) return 'down';
  return 'steady';
}

function skillValue(samples: readonly number[]): SkillValue {
  if (samples.length === 0) return { value: 0, n: 0, trend: 'steady' };
  const value = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  return { value: Math.round(value * 10) / 10, n: samples.length, trend: trendOf(samples) };
}

function contactLatency(reportValue: number | undefined): number | undefined {
  return reportValue === undefined ? undefined : reportValue * 100;
}

function classificationSample(
  session: SessionRecord,
  classId: ClassificationSkillClass
): number[] {
  return session.report.perContact
    .filter((contact) => contact.classId === classId)
    .map((contact) => contact.c * 100);
}

function assetDefenceSample(session: SessionRecord): number | undefined {
  if (session.summary.hostilesTotal === 0) return undefined;
  if (session.summary.assetHit) return 0;
  return (session.summary.hostilesNeutralised / session.summary.hostilesTotal) * 100;
}

export function skillMatrix(sessions: readonly SessionRecord[], lastN: number): SkillMatrix {
  const selected = ordered(sessions).slice(-Math.max(0, Math.floor(lastN)));
  const detection: number[] = [];
  const engagement: number[] = [];
  const effectorFit: number[] = [];
  const discipline: number[] = [];
  const assetDefence: number[] = [];
  const classification = Object.fromEntries(
    CLASSIFICATION_CLASSES.map((classId) => [classId, [] as number[]])
  ) as Record<ClassificationSkillClass, number[]>;

  for (const session of selected) {
    for (const contact of session.report.perContact) {
      detection.push(contact.d * 100);
      const latency = contactLatency(contact.latency);
      if (latency !== undefined) engagement.push(latency);
      const fit = contactLatency(contact.fit);
      if (fit !== undefined) effectorFit.push(fit);
    }
    for (const classId of CLASSIFICATION_CLASSES) {
      classification[classId].push(...classificationSample(session, classId));
    }
    discipline.push(session.report.subscores.discipline);
    const defence = assetDefenceSample(session);
    if (defence !== undefined) assetDefence.push(defence);
  }

  return {
    detection_latency: skillValue(detection),
    classification: Object.fromEntries(
      CLASSIFICATION_CLASSES.map((classId) => [classId, skillValue(classification[classId])])
    ) as Record<ClassificationSkillClass, SkillValue>,
    engagement_latency: skillValue(engagement),
    effector_fit: skillValue(effectorFit),
    fire_discipline: skillValue(discipline),
    asset_defence: skillValue(assetDefence),
  };
}

export function confusionMatrix(sessions: readonly SessionRecord[]): ConfusionMatrix {
  const index = new Map(CONFUSION_LABELS.map((label, i) => [label, i]));
  const counts = CONFUSION_LABELS.map(() => CONFUSION_LABELS.map(() => 0));
  let total = 0;
  for (const session of sessions) {
    for (const contact of session.report.perContact) {
      const trueIndex = index.get(contact.classId);
      const assessedIndex = index.get(contact.assessedClass ?? 'unknown');
      if (trueIndex === undefined || assessedIndex === undefined) continue;
      const row = counts[trueIndex];
      if (row) row[assessedIndex] = (row[assessedIndex] ?? 0) + 1;
      total++;
    }
    for (const contact of session.report.unobservable) {
      const trueIndex = index.get(contact.classId);
      const unknownIndex = index.get('unknown');
      if (trueIndex === undefined || unknownIndex === undefined) continue;
      const row = counts[trueIndex];
      if (row) row[unknownIndex] = (row[unknownIndex] ?? 0) + 1;
      total++;
    }
  }
  return { labels: [...CONFUSION_LABELS], counts, total };
}

export function unitReadiness(
  trainees: readonly TraineeRecord[],
  sessions: readonly SessionRecord[],
  unitId: string,
  now: number
): UnitReadiness {
  const memberIds = new Set(trainees.filter((trainee) => trainee.unitId === unitId).map((t) => t.id));
  const unitSessions = sessions.filter((session) => session.unitId === unitId && memberIds.has(session.traineeId));
  const perTrainee = trainees
    .filter((trainee) => trainee.unitId === unitId)
    .map((trainee) => {
      const traineeSessions = ordered(unitSessions.filter((session) => session.traineeId === trainee.id));
      const recent = traineeSessions.slice(-5);
      const meanLastFive = recent.length === 0
        ? 0
        : recent.reduce((sum, session) => sum + session.summary.total, 0) / recent.length;
      const participation7Days = traineeSessions.filter((session) => session.startedAt >= now - 7 * 24 * 60 * 60 * 1000).length;
      return {
        traineeId: trainee.id,
        callsign: trainee.callsign,
        sessionsUsed: recent.length,
        meanLastFive: Math.round(meanLastFive * 10) / 10,
        participation7Days,
        outlier: false,
      };
    });
  const means = perTrainee.filter((trainee) => trainee.sessionsUsed > 0).map((trainee) => trainee.meanLastFive);
  const mean = means.length === 0 ? 0 : means.reduce((sum, value) => sum + value, 0) / means.length;
  const variance = means.length === 0
    ? 0
    : means.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / means.length;
  const standardDeviation = Math.sqrt(variance);
  const outlierLimit = mean - 1.5 * standardDeviation;
  for (const trainee of perTrainee) {
    trainee.outlier = trainee.sessionsUsed > 0 && standardDeviation > 0 && trainee.meanLastFive < outlierLimit;
  }

  const skillSessions = perTrainee.flatMap((trainee) =>
    ordered(unitSessions.filter((session) => session.traineeId === trainee.traineeId)).slice(-5)
  );
  const matrix = skillMatrix(skillSessions, skillSessions.length);
  const skillEntries: Array<[string, SkillValue]> = [
    ['detection_latency', matrix.detection_latency],
    ...CLASSIFICATION_CLASSES.map((classId) => [`classification_${classId}`, matrix.classification[classId]] as [string, SkillValue]),
    ['engagement_latency', matrix.engagement_latency],
    ['effector_fit', matrix.effector_fit],
    ['fire_discipline', matrix.fire_discipline],
    ['asset_defence', matrix.asset_defence],
  ];
  const weakest = skillEntries.filter(([, value]) => value.n > 0).sort((a, b) => a[1].value - b[1].value)[0];
  const usedMeans = perTrainee.filter((trainee) => trainee.sessionsUsed > 0);

  return {
    unitId,
    mean: Math.round(mean * 10) / 10,
    traineesAbove70Pct: usedMeans.length === 0
      ? 0
      : Math.round((usedMeans.filter((trainee) => trainee.meanLastFive >= 70).length / usedMeans.length) * 1000) / 10,
    weakestSkill: weakest?.[0] ?? 'no data',
    participation7Days: unitSessions.filter((session) => session.startedAt >= now - 7 * 24 * 60 * 60 * 1000).length,
    trainees: perTrainee.sort((a, b) => a.meanLastFive - b.meanLastFive),
  };
}

export function unitSessionsCsv(
  sessions: readonly SessionRecord[],
  trainees: readonly TraineeRecord[]
): string {
  const callsigns = new Map(trainees.map((trainee) => [trainee.id, trainee.callsign]));
  const rows = [
    ['callsign', 'date', 'scenario', 'tier', 'focus', 'grade', 'total', 'asset_hit'],
    ...sessions.map((session) => [
      callsigns.get(session.traineeId) ?? session.traineeId,
      new Date(session.startedAt).toISOString(),
      session.scenarioKey,
      session.tier,
      session.focus,
      session.summary.grade,
      String(session.summary.total),
      String(session.summary.assetHit),
    ]),
  ];
  const escapeField = (value: string) => {
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}
