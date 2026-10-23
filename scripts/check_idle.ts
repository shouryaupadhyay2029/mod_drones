import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

for (const sc of ['dawn_intrusion', 'ridge_runner', 'city_edge_night']) {
  const e = new Engine('s1', sc);
  while (!e.missionState.ended && e.world.tick < 4800) {
    const cmds = idleOperator(e.getTraineeView());
    for (const c of cmds) e.enqueueCommand(c);
    e.step();
  }
  const rep = scoreSession({
    actors: e.actors,
    tracks: e.tracks,
    events: e.getEvents(),
    assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
  });
  console.log(`=== ${sc} s1 idle ===`);
  console.log(`total: ${rep.total}, weightedMean: ${rep.weightedMean}`);
  console.log('penalties:', rep.penalties);
  console.log('perContact:');
  for (const pc of rep.perContact) {
    console.log(`  actor ${pc.actorId} (${pc.classId}): contactTotal=${pc.contactTotal}, decision=${pc.decisionScore}`);
  }
}
