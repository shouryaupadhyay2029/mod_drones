import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

for (const seed of ['solv-veteran-10', 'solv-veteran-12']) {
  const e = new Engine(seed, 'proc:v1:veteran');
  while (!e.missionState.ended && e.world.tick < 4800) {
    const cmds = oracleStep(e.getTraineeView(), e);
    for (const c of cmds) e.enqueueCommand(c);
    e.step();
  }
  const rep = scoreSession({
    actors: e.actors,
    tracks: e.tracks,
    events: e.getEvents(),
    assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
  });
  console.log(`${seed}: Total=${rep.total}, WeightedMean=${rep.weightedMean}, Reasons:`, rep.reasons);
}
