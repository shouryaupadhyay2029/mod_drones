import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';

const e = new Engine('s2', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 4800) {
  const view = e.getTraineeView();
  const trk = view.tracks.find((t) => t.trackId === 1 || t.trackId === 2);
  const cmds = referenceOperator(view);
  for (const c of cmds) {
    if (c.type === 'CLASSIFY_TRACK' || c.type === 'ENGAGE_TRACK') {
      console.log(`Tick ${view.tick}: Command`, JSON.stringify(c));
      console.log('   Track state:', JSON.stringify(trk));
      console.log('   EO state:', JSON.stringify(view.eo));
    }
    e.enqueueCommand(c);
  }
  e.step();
}
