import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

for (const s of ['s1', 's4']) {
  const e = new Engine(s, 'city_edge_night');
  while (!e.missionState.ended && e.world.tick < 4800) {
    const cmds = referenceOperator(e.getTraineeView());
    for (const c of cmds) e.enqueueCommand(c);
    e.step();
  }
  const rep = scoreSession({
    actors: e.actors,
    tracks: e.tracks,
    events: e.getEvents(),
    assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
  });
  console.log(`=== city_edge_night ${s} ===`);
  console.log('Score:', rep.total, 'WeightedMean:', rep.weightedMean);
  console.log('Reasons:', rep.reasons);
  console.log('PerContact:', JSON.stringify(rep.perContact, null, 2));
}
