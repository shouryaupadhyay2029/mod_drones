import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { Engine } from '../src/sim/core/engine.js';

const e = new Engine('solv-veteran-29', 'proc:v1:veteran');
while (!e.missionState.ended && e.world.tick < 4800) {
  const view = e.getTraineeView();
  const trk = e.tracks.find((t) => t.actorId === 10);
  const act = e.actors.find((a) => a.id === 10);
  if (act && view.tick % 40 === 0 && act.pos) {
    const range = Math.sqrt(act.pos.x ** 2 + act.pos.y ** 2);
    if (range < 2000) {
      console.log(`Tick ${view.tick}: Actor 10 range=${range.toFixed(1)}m, track state=${trk?.state}, trkId=${trk?.trackId}, rangeM=${trk?.rangeM.toFixed(1)}`);
    }
  }
  const cmds = oracleStep(view, e);
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}
console.log('Final events for Actor 10 / Track:');
for (const ev of e.getEvents()) {
  if (ev.payload?.actorId === 10 || ev.payload?.trackId === 10) {
    console.log(`  Tick ${ev.tick}: ${ev.type}`, JSON.stringify(ev.payload));
  }
}
