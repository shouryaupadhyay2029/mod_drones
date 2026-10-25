import { Engine } from '../core/engine.js';
import { SessionLog, SimEvent } from '../core/types.js';
import { DecisionNode, ScoreReportV2 } from '../scoring/doctrine.js';

export interface ContactComparison {
  actorId: number;
  classId: string;
  outcomeA: string;
  outcomeB: string;
  classificationA: string;
  classificationB: string;
  engagementA: string;
  engagementB: string;
}

export interface PenaltyDifference {
  reason: string;
  pointsA: number;
  pointsB: number;
  delta: number;
}

export interface SessionComparison {
  totalDelta: number;
  gradeChange: string;
  subscoreDeltas: ScoreReportV2['subscores'];
  perContact: ContactComparison[];
  penaltyDiff: PenaltyDifference[];
  narrative: string[];
}

export interface KeyMoment {
  tick: number;
  actorId: number;
  cause: string;
  forkTick: number;
  text: string;
}

const KEY_CAUSES = new Set([
  'engaged_neutral', 'late_engagement', 'missed_threat', 'wrong_effector',
  'misclassification', 'false_track_engaged',
]);

function contactNode(contact: ScoreReportV2['perContact'][number] | undefined, id: string): DecisionNode | undefined {
  return contact?.decisionPath.find((node) => node.id === id);
}

function nodeAnswer(contact: ScoreReportV2['perContact'][number] | undefined, id: string, fallback: string): string {
  return contactNode(contact, id)?.answer ?? fallback;
}

export function compareSessions(reportA: ScoreReportV2, reportB: ScoreReportV2): SessionComparison {
  const contacts = new Map<number, { a?: ScoreReportV2['perContact'][number]; b?: ScoreReportV2['perContact'][number] }>();
  for (const contact of reportA.perContact) contacts.set(contact.actorId, { a: contact });
  for (const contact of reportB.perContact) {
    const pair = contacts.get(contact.actorId) ?? {};
    pair.b = contact;
    contacts.set(contact.actorId, pair);
  }
  const perContact = [...contacts.entries()].sort(([a], [b]) => a - b).map(([actorId, pair]) => {
    const source = pair.b ?? pair.a!;
    return {
      actorId,
      classId: source.classId,
      outcomeA: nodeAnswer(pair.a, 'outcome', pair.a ? `Outcome score ${pair.a.outcome ?? '—'}` : 'No contact'),
      outcomeB: nodeAnswer(pair.b, 'outcome', pair.b ? `Outcome score ${pair.b.outcome ?? '—'}` : 'No contact'),
      classificationA: pair.a?.assessedClass ?? 'unknown',
      classificationB: pair.b?.assessedClass ?? 'unknown',
      engagementA: nodeAnswer(pair.a, 'effector_fit', 'No engagement'),
      engagementB: nodeAnswer(pair.b, 'effector_fit', 'No engagement'),
    };
  });
  const penaltyReasons = new Set([...reportA.penalties, ...reportB.penalties].map((penalty) => penalty.reason));
  const penaltyDiff = [...penaltyReasons].sort().flatMap((reason) => {
    const pointsA = reportA.penalties.filter((penalty) => penalty.reason === reason).reduce((sum, penalty) => sum + penalty.points, 0);
    const pointsB = reportB.penalties.filter((penalty) => penalty.reason === reason).reduce((sum, penalty) => sum + penalty.points, 0);
    return pointsA === pointsB ? [] : [{ reason, pointsA, pointsB, delta: pointsB - pointsA }];
  });
  const narrative = penaltyDiff.map((difference) => {
    const penalty = difference.pointsA - difference.pointsB;
    if (penalty > 0) {
      const actor = reportA.perContact.find((contact) => {
        const classLabel = contact.classId.replaceAll('_', ' ');
        return difference.reason.toLowerCase().includes(classLabel) && contact.decisionPath.some((node) => node.cause === 'engaged_neutral');
      });
      return `Holding fire${actor ? ` on T${actor.actorId}` : ''} avoided -${penalty}`;
    }
    return `Fork added a ${difference.reason} penalty (-${-penalty})`;
  });
  if (narrative.length === 0) narrative.push(reportB.total === reportA.total ? 'The fork produced no score change.' : 'The fork changed the score without changing penalty totals.');
  return {
    totalDelta: reportB.total - reportA.total,
    gradeChange: reportA.grade === reportB.grade ? 'unchanged' : `${reportA.grade} → ${reportB.grade}`,
    subscoreDeltas: {
      detection: reportB.subscores.detection - reportA.subscores.detection,
      classification: reportB.subscores.classification - reportA.subscores.classification,
      engagement: reportB.subscores.engagement - reportA.subscores.engagement,
      discipline: reportB.subscores.discipline - reportA.subscores.discipline,
    },
    perContact,
    penaltyDiff,
    narrative,
  };
}

function replayEvents(log: SessionLog): { events: readonly SimEvent[]; trackActors: Map<number, number> } {
  const engine = new Engine(log.seed, log.scenarioId, log.generatorAvoid ?? []);
  for (const command of log.commands) engine.enqueueCommand(command);
  engine.stepN(log.totalTicks);
  return {
    events: engine.getEvents(),
    trackActors: new Map(engine.tracks.filter((track) => track.actorId !== null).map((track) => [track.trackId, track.actorId!])),
  };
}

function momentTick(actorId: number, cause: string, log: SessionLog, events: readonly SimEvent[], trackActors: Map<number, number>): number {
  const trackIds = new Set([...trackActors].filter(([, owner]) => owner === actorId).map(([trackId]) => trackId));
  const eventTypes: Record<string, string[]> = {
    engaged_neutral: ['ENGAGEMENT_STARTED'], late_engagement: ['ENGAGEMENT_STARTED'],
    missed_threat: ['ASSET_HIT'], wrong_effector: ['ENGAGEMENT_STARTED'],
    misclassification: ['TRACK_CLASSIFIED'], false_track_engaged: ['ENGAGEMENT_STARTED'],
  };
  const event = events.find((item) => (eventTypes[cause] ?? []).includes(item.type) &&
    (item.payload.actorId === actorId || (typeof item.payload.trackId === 'number' && trackIds.has(item.payload.trackId)) ||
      (cause === 'false_track_engaged' && typeof item.payload.trackId === 'number' && !trackActors.has(item.payload.trackId))));
  if (event) return event.tick;
  const commandTypes: Record<string, string[]> = {
    engaged_neutral: ['ENGAGE_TRACK'], late_engagement: ['ENGAGE_TRACK'],
    missed_threat: [], wrong_effector: ['ENGAGE_TRACK'], misclassification: ['CLASSIFY_TRACK'],
    false_track_engaged: ['ENGAGE_TRACK'],
  };
  return log.commands.find((command) => (commandTypes[cause] ?? []).includes(command.type) &&
    typeof command.payload.trackId === 'number' && trackIds.has(command.payload.trackId))?.tick ?? log.totalTicks;
}

function momentText(cause: string, actorId: number): string {
  const texts: Record<string, string> = {
    engaged_neutral: `Neutral contact T${actorId} was engaged.`,
    late_engagement: `Threat T${actorId} was engaged late.`,
    missed_threat: `Threat T${actorId} reached the defended asset.`,
    wrong_effector: `The selected effector was a poor fit for T${actorId}.`,
    misclassification: `T${actorId} was classified incorrectly.`,
    false_track_engaged: `A false track was engaged for T${actorId}.`,
  };
  return texts[cause] ?? `Review the ${cause.replaceAll('_', ' ')} decision for T${actorId}.`;
}

export function keyMoments(report: ScoreReportV2, log: SessionLog): KeyMoment[] {
  const { events, trackActors } = replayEvents(log);
  const candidates: Array<{ actorId: number; cause: string; node: DecisionNode }> = [];
  for (const contact of report.perContact) {
    for (const node of contact.decisionPath) if (node.cause && KEY_CAUSES.has(node.cause)) candidates.push({ actorId: contact.actorId, cause: node.cause, node });
  }
  for (const contact of report.unobservable) {
    for (const node of contact.decisionPath) if (node.cause && KEY_CAUSES.has(node.cause)) candidates.push({ actorId: contact.actorId, cause: node.cause, node });
  }
  for (const node of report.missionDecisionPath) {
    if (node.cause === 'false_track_engaged' && !candidates.some((item) => item.cause === node.cause)) candidates.push({ actorId: 0, cause: node.cause, node });
  }
  const moments = candidates.map(({ actorId, cause }) => {
    const tick = momentTick(actorId, cause, log, events, trackActors);
    return { tick, actorId, cause, forkTick: Math.max(0, tick - 100), text: momentText(cause, actorId) };
  });
  moments.sort((a, b) => a.tick - b.tick || a.actorId - b.actorId || a.cause.localeCompare(b.cause));
  return moments.filter((moment, index) => moments.findIndex((item) => item.actorId === moment.actorId && item.cause === moment.cause) === index).slice(0, 5);
}
