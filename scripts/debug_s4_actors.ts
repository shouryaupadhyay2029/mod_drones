import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 4800) {
  const view = e.getTraineeView();
  const cmds = referenceOperator(view);
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}

for (const actor of e.actors) {
  console.log(`Actor ${actor.id} (${actor.classId}): state=${actor.state} neutDist=${actor.neutralizedDistanceToAsset?.toFixed(1)}m`);
  const trks = e.tracks.filter((t) => t.actorId === actor.id);
  for (const t of trks) {
    console.log(`  Track ${t.trackId}: assessed=${t.assessedClass} firstPlot=${t.firstDetectedTick} lastPlot=${t.lastDetectedTick}`);
  }
}
