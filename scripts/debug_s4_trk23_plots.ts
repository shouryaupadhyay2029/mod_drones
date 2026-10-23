import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3300) {
  const cmds = referenceOperator(e.getTraineeView());
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
  const tick = e.world.tick;
  for (const trk of e.tracks) {
    if (trk.trackId === 23 && trk.lastDetectedTick === tick) {
      console.log(`Plot @ tick ${tick}: range=${Math.sqrt(trk.estimatedPos.x**2 + trk.estimatedPos.y**2).toFixed(1)}m, state=${trk.state}, plots=${trk.totalPlots}`);
    }
  }
}
