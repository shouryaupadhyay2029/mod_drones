import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s1', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3300) {
  const view = e.getTraineeView();
  const cmds = referenceOperator(view);
  for (const c of cmds) {
    if (c.type === 'CLASSIFY_TRACK') {
      const trk = e.tracks.find((t) => t.trackId === c.payload?.trackId);
      if (trk && trk.actorId === 2) {
        console.log(`Tick ${view.tick}: Classify Actor 2 (track ${trk.trackId}) as ${c.payload?.assessedClass}`);
      }
    }
    e.enqueueCommand(c);
  }
  e.step();
}
