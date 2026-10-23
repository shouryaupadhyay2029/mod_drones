import { computeHeadingErrorToAsset, referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';

const e = new Engine('s2', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 4800) {
  const view = e.getTraineeView();
  const trk = view.tracks.find((t) => t.trackId === 11);
  if (trk && view.tick >= 2477 && view.tick <= 2525) {
    const headingError = computeHeadingErrorToAsset(trk) ?? 180;
    console.log(`Tick ${view.tick}: speed=${trk.estimatedSpeedMps}, closing=${trk.closingRateMps}, headingErr=${headingError}, assessed=${trk.assessedClass}, engStatus=${trk.engagementStatus}`);
  }
  const cmds = referenceOperator(view);
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}
