import { Engine } from '../src/sim/core/engine.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';

const e = new Engine('cap-vet-11', 'proc:v1:veteran');
while (!e.missionState.ended) {
  const currentTick = e.world.tick;
  const cmds = oracleStep(e.getTraineeView(), e);
  for (const c of cmds) e.enqueueCommand(c);
  e.step();

  const act10 = e.actors.find((a) => a.id === 10);
  if (act10 && currentTick % 200 === 0) {
    const trks = e.tracks.filter((t) => t.actorId === 10);
    console.log(currentTick, 'act10 pos:', Math.round(act10.pos.x), Math.round(act10.pos.y), Math.round(act10.pos.z), 'tracks:', trks.map(t => `${t.trackId}:${t.state}:${t.acked}:${t.assessedClass}`));
  }
}
