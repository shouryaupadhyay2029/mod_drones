import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3300) {
  const tick = e.world.tick;
  for (const trk of e.tracks) {
    if (trk.lastDetectedTick === tick) {
      const act = e.actors.find((a) => a.id === trk.actorId);
      if (act?.classId === 'fpv_kamikaze') {
        console.log(`Tick ${tick}: Track ${trk.trackId} (Actor ${act.id} ${act.classId}): state=${trk.state} range=${trk.rangeM.toFixed(1)}m speed=${trk.speedMps?.toFixed(1)}m/s`);
      }
    }
  }
  const cmds = referenceOperator(e.getTraineeView());
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}
