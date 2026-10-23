import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

const e = new Engine('s2', 'city_edge_night');
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
console.log('City s2 total:', rep.total, 'weightedMean:', rep.weightedMean);
console.log('City s2 perContact:', JSON.stringify(rep.perContact, null, 2));
console.log('Reasons:', rep.reasons);
