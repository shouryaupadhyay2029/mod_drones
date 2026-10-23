import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s1', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3200) {
  const view = e.getTraineeView();
  const trk = view.tracks.find((t) => t.trackId === 18);
  if (trk && (view.tick >= 2915 && view.tick <= 2925)) {
    console.log(`Tick: ${view.tick} Track 18:`, {
      rangeM: trk.rangeM,
      speedMps: trk.speedMps,
      closingRateMps: trk.closingRateMps,
      bearingDeg: trk.bearingDeg,
      courseDeg: trk.courseDeg,
      rcsBucket: trk.rcsBucket,
      rfSignature: trk.rfSignature,
      rfStatus: trk.rfStatus
    });
  }
  const cmds = referenceOperator(view);
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}
