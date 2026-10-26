import { compareSessions, keyMoments } from '../src/sim/debrief/forkReview.js';
import { Engine } from '../src/sim/core/engine.js';
import { forkSession, replay } from '../src/sim/core/log.js';
import { Command, SessionLog, SimEvent } from '../src/sim/core/types.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { ScoreReportV2, scoreSessionV2 } from '../src/sim/scoring/doctrine.js';
import { SCORE_VERSION } from '../src/sim/scoring/doctrineConstants.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';

const SCENARIO_ID = 'dawn_intrusion';
const SEED = 's1';
const PARENT_ID = 'phase51-dawn-s1-parent';
const SESSION_STARTED_AT = Date.UTC(2026, 9, 26, 0, 0, 0);

export interface DemoSessionRecord {
  id: string;
  traineeId: string;
  unitId: string;
  startedAt: number;
  scenarioKey: string;
  tier: string;
  focus: string;
  seed: string;
  sessionLog: SessionLog;
  scoreVersion: string;
  report: ScoreReportV2;
  summary: {
    total: number;
    grade: ScoreReportV2['grade'];
    subscores: ScoreReportV2['subscores'];
    hostilesTotal: number;
    hostilesNeutralised: number;
    assetHit: boolean;
    durationTicks: number;
  };
  hash: string;
  parentId?: string;
  forkTick?: number;
  isFork?: boolean;
}

export interface ForkDemoResult {
  parent: DemoSessionRecord;
  noCommandFork: DemoSessionRecord;
  holdFireFork: DemoSessionRecord;
  firstNeutralEngagement: { tick: number; trackId: number; actorId: number; classId: string; effector: string };
  keyMoments: ReturnType<typeof keyMoments>;
  forkTick: number;
  scriptedNeutralEngagementCommand: Command;
  noCommandComparison: ReturnType<typeof compareSessions>;
  comparison: ReturnType<typeof compareSessions>;
  replayHashes: { noCommand: string; holdFire: string };
}

function finish(engine: Engine): void {
  while (!engine.missionState.ended && engine.world.tick < 4800) engine.step();
}

function score(engine: Engine): ScoreReportV2 {
  const events = engine.getEvents();
  return scoreSessionV2({
    actors: engine.actors,
    tracks: engine.tracks,
    events,
    assetHit: events.some((event) => event.type === 'ASSET_HIT'),
  });
}

function record(id: string, engine: Engine, report: ScoreReportV2, fork?: { parentId: string; tick: number }): DemoSessionRecord {
  const hostiles = engine.actors.filter((actor) => THREAT_LIBRARY[actor.classId].hostile);
  const events = engine.getEvents();
  return {
    id,
    traineeId: 'phase51-trainee',
    unitId: 'phase51-unit',
    startedAt: SESSION_STARTED_AT + (fork ? 1 : 0),
    scenarioKey: SCENARIO_ID,
    tier: 'scripted',
    focus: 'none',
    seed: SEED,
    sessionLog: engine.getSessionLog(),
    scoreVersion: SCORE_VERSION,
    report,
    summary: {
      total: report.total,
      grade: report.grade,
      subscores: report.subscores,
      hostilesTotal: hostiles.length,
      hostilesNeutralised: hostiles.filter((actor) => actor.state === 'neutralized').length,
      assetHit: events.some((event) => event.type === 'ASSET_HIT'),
      durationTicks: engine.world.tick,
    },
    hash: engine.getHash(),
    parentId: fork?.parentId,
    forkTick: fork?.tick,
    isFork: Boolean(fork),
  };
}

function neutralEngagement(engine: Engine, event: SimEvent): ForkDemoResult['firstNeutralEngagement'] | null {
  if (event.type !== 'ENGAGEMENT_STARTED' || typeof event.payload.trackId !== 'number') return null;
  const track = engine.tracks.find((item) => item.trackId === event.payload.trackId);
  const actor = track?.actorId === null || track?.actorId === undefined
    ? undefined
    : engine.actors.find((item) => item.id === track.actorId);
  if (!track || !actor || THREAT_LIBRARY[actor.classId].hostile) return null;
  return {
    tick: event.tick,
    trackId: track.trackId,
    actorId: actor.id,
    classId: actor.classId,
    effector: String(event.payload.effector ?? 'unknown'),
  };
}

export function runForkDemo(): ForkDemoResult {
  const original = new Engine(SEED, SCENARIO_ID);
  let scriptedNeutralEngagementCommand: Command | undefined;

  while (!original.missionState.ended && original.world.tick < 4800) {
    const view = original.getTraineeView();
    for (const command of triggerHappyOperator(view)) original.enqueueCommand(command);

    // Dawn Intrusion's trigger-happy bot engages hostile tracks in this seed, but
    // does not produce the requested neutral engagement. Add one recorded, explicit
    // jammer dispatch at the first confirmed neutral track inside illustrative range.
    if (!scriptedNeutralEngagementCommand) {
      const neutralTrack = original.tracks.find((track) => {
        if (track.state !== 'confirmed' || track.actorId === null) return false;
        const actor = original.actors.find((item) => item.id === track.actorId);
        if (!actor || THREAT_LIBRARY[actor.classId].hostile) return false;
        const rangeM = Math.sqrt(track.estimatedPos.x * track.estimatedPos.x + track.estimatedPos.y * track.estimatedPos.y);
        return rangeM <= 1500;
      });
      if (neutralTrack) {
        scriptedNeutralEngagementCommand = {
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: neutralTrack.trackId, effector: 'jammer' },
        };
        original.enqueueCommand(scriptedNeutralEngagementCommand);
      }
    }
    original.step();
  }

  if (!scriptedNeutralEngagementCommand) throw new Error('The scripted Dawn Intrusion run did not find an in-range neutral track.');
  const firstNeutralEngagement = original.getEvents().map((event) => neutralEngagement(original, event)).find((result) => result !== null) ?? undefined;
  if (!firstNeutralEngagement) throw new Error('The scripted run did not produce an engagement against a neutral contact.');

  const originalLog = original.getSessionLog();
  const forkTick = Math.max(0, firstNeutralEngagement.tick - 100);
  const { snapshot } = forkSession(originalLog, forkTick, PARENT_ID);

  const noCommandBranch = Engine.restore(snapshot);
  finish(noCommandBranch);

  const holdFireBranch = Engine.restore(snapshot);
  const holdFire: Command = {
    tick: forkTick,
    type: 'HOLD_FIRE',
    payload: { trackId: firstNeutralEngagement.trackId },
  };
  holdFireBranch.enqueueCommand(holdFire);
  finish(holdFireBranch);

  const parentReport = score(original);
  const noCommandReport = score(noCommandBranch);
  const holdFireReport = score(holdFireBranch);
  const parentRecord = record(PARENT_ID, original, parentReport);
  const noCommandRecord = record(`${PARENT_ID}-no-command`, noCommandBranch, noCommandReport, { parentId: PARENT_ID, tick: forkTick });
  const holdFireRecord = record(`${PARENT_ID}-hold-fire`, holdFireBranch, holdFireReport, { parentId: PARENT_ID, tick: forkTick });
  const noCommandComparison = compareSessions(parentReport, noCommandReport);
  const comparison = compareSessions(parentReport, holdFireReport);
  const noCommandHash = replay(noCommandRecord.sessionLog);
  const holdFireHash = replay(holdFireRecord.sessionLog);
  if (noCommandHash !== noCommandBranch.getHash()) throw new Error('No-command fork replay hash differs from live engine hash.');
  if (holdFireHash !== holdFireBranch.getHash()) throw new Error('HOLD_FIRE fork replay hash differs from live engine hash.');

  return {
    parent: parentRecord,
    noCommandFork: noCommandRecord,
    holdFireFork: holdFireRecord,
    firstNeutralEngagement,
    keyMoments: keyMoments(parentReport, originalLog),
    forkTick,
    scriptedNeutralEngagementCommand,
    noCommandComparison,
    comparison,
    replayHashes: { noCommand: noCommandHash, holdFire: holdFireHash },
  };
}
