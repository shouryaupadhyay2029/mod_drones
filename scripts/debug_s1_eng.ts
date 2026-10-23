import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';

const e = new Engine('s1', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 4800) {
  const view = e.getTraineeView();
  const cmds = referenceOperator(view);
  for (const c of cmds) {
    if (c.type === 'ENGAGE_TRACK' || c.type === 'CLASSIFY_TRACK') {
      console.log(`Tick ${view.tick}: ${c.type} track=${c.payload?.trackId} class=${c.payload?.assessedClass} effector=${c.payload?.effector}`);
    }
    e.enqueueCommand(c);
  }
  e.step();
  for (const evt of e.getEvents()) {
    if (evt.tick === e.world.tick) {
      console.log(`  Event @ ${evt.tick}: ${evt.type} payload=${JSON.stringify(evt.payload)}`);
    }
  }
}
