import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3000) {
  const view = e.getTraineeView();
  const trk = view.tracks.find((t) => t.trackId === 11);
  if (trk && (view.tick >= 1915 && view.tick <= 1930)) {
    console.log(`Tick: ${view.tick} Track 11:`, {
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
