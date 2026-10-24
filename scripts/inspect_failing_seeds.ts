import { Engine } from '../src/sim/core/engine.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

for (let s = 1; s <= 30; s++) {
  const seed = `cap-vet-${s}`;
  const e = new Engine(seed, 'proc:v1:veteran');
  while (!e.missionState.ended) {
    const cmds = oracleStep(e.getTraineeView(), e);
    for (const c of cmds) e.enqueueCommand(c);
    e.step();
  }
  const rep = scoreSession(e.getEvents(), {
    actors: e.actors,
    tracks: e.tracks,
    events: e.getEvents(),
    assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
  });
  if (rep.total < 90) {
    console.log(`Failed seed ${seed}: total=${rep.total}, weightedMean=${rep.weightedMean}, penalties=${JSON.stringify(rep.penalties)}`);
  }
}
