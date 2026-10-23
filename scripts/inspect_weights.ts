import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

const e = new Engine('s3', 'city_edge_night');
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

console.log('e.actors length:', e.actors.length);
for (const a of e.actors) {
  console.log(`  actor ${a.id}: ${a.classId}, state=${a.state}, hostile=${THREAT_LIBRARY[a.classId]?.hostile}`);
}

const hostiles = e.actors.filter((a) => THREAT_LIBRARY[a.classId]?.hostile);
const neutrals = e.actors.filter((a) => !THREAT_LIBRARY[a.classId]?.hostile);

let hostileEach = 0;
if (hostiles.length === 1) hostileEach = 0.6;
else if (hostiles.length === 2) hostileEach = 0.4;
else hostileEach = 0.8 / hostiles.length;

const totalHostile = hostileEach * hostiles.length;
const neutralEach = (1.0 - totalHostile) / neutrals.length;

console.log('hostileEach:', hostileEach, 'totalHostile:', totalHostile, 'neutralEach:', neutralEach);

for (const pc of rep.perContact) {
  const w = THREAT_LIBRARY[pc.classId]?.hostile ? hostileEach : neutralEach;
  console.log(`Contact ${pc.actorId} (${pc.classId}): contactTotal=${pc.contactTotal}, weight=${w}, contribution=${pc.contactTotal * w}`);
}
console.log('Total score:', rep.total, 'weightedMean:', rep.weightedMean);
