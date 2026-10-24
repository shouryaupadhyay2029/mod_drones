import { Engine } from '../src/sim/core/engine.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';

const e = new Engine('cap-vet-11', 'proc:v1:veteran');
while (!e.missionState.ended) {
  const cmds = oracleStep(e.getTraineeView(), e);
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}

console.log('Events in cap-vet-11:');
for (const ev of e.getEvents()) {
  if (ev.type === 'ASSET_HIT' || ev.type === 'ENGAGEMENT_RESOLVED' || ev.type === 'MISSION_END') {
    console.log(ev.tick, ev.type, JSON.stringify(ev.payload));
  }
}
