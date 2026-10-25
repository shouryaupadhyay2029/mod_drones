import { Engine } from '../core/engine.js';
import { SessionLog } from '../core/types.js';
import { ScoreReportV2, scoreSessionV2 } from './doctrine.js';

export interface RescoredSession {
  hash: string;
  report: ScoreReportV2;
}

/** Rebuild a mission from its recorded commands and score the final deterministic state. */
export function rescoreSession(sessionLog: SessionLog): RescoredSession {
  const engine = new Engine(sessionLog.seed, sessionLog.scenarioId);

  for (const command of sessionLog.commands) {
    engine.enqueueCommand({
      tick: command.tick,
      type: command.type,
      payload: { ...command.payload },
    });
  }

  while (!engine.missionState.ended && engine.world.tick < sessionLog.totalTicks) {
    engine.step();
  }

  const events = engine.getEvents();
  const report = scoreSessionV2({
    actors: engine.actors,
    tracks: engine.tracks,
    events,
    assetHit: events.some((event) => event.type === 'ASSET_HIT'),
  });

  return { hash: engine.getHash(), report };
}
