import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 4800) {
  const cmds = referenceOperator(e.getTraineeView());
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}
console.log('Total tracks at end:', e.tracks.length);
for (const t of e.tracks) {
  console.log(`Track ${t.trackId}: actorId=${t.actorId} isGhost=${t.isGhost} state=${t.state} totalPlots=${t.totalPlots} lastDetected=${t.lastDetectedTick}`);
}
