import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
const seeds = ['s1', 's2', 's3', 's4', 's5'];

for (const sc of scenarios) {
  for (const s of seeds) {
    const e = new Engine(s, sc);
    while (!e.missionState.ended) {
      const cmds = referenceOperator(e.getTraineeView());
      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }
    if (e.missionState.reason !== 'all_resolved') {
      console.log(`FAILED: ${sc} ${s} -> reason: ${e.missionState.reason}, tick: ${e.world.tick}`);
    } else {
      console.log(`PASSED: ${sc} ${s} -> all_resolved, tick: ${e.world.tick}`);
    }
  }
}
