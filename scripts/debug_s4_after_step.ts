import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3600) {
  const cmds = referenceOperator(e.getTraineeView());
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
  const tick = e.world.tick;
  for (const trk of e.tracks) {
    if (trk.lastDetectedTick === tick) {
      const act = e.actors.find((a) => a.id === trk.actorId);
      if (act?.classId === 'fpv_kamikaze') {
        const dist = Math.sqrt(trk.estimatedPos.x ** 2 + trk.estimatedPos.y ** 2);
        console.log(`Tick ${tick}: Track ${trk.trackId} (Actor ${act.id}): state=${trk.state} range=${dist.toFixed(1)}m speed=${Math.sqrt(trk.estimatedVel.x**2 + trk.estimatedVel.y**2).toFixed(1)}m/s acked=${trk.acked} assessed=${trk.assessedClass}`);
      }
    }
  }
}
