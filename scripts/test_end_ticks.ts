import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';

const seeds = ['s1', 's2', 's3', 's4', 's5'];
for (const sc of ['dawn_intrusion', 'ridge_runner', 'city_edge_night']) {
  const endTicks: number[] = [];
  const spawnTicks: number[][] = [];
  for (const s of seeds) {
    const e = new Engine(s, sc);
    const spawns = e.scheduledSpawns.map((sp) => sp.tick);
    spawnTicks.push(spawns);
    while (!e.missionState.ended && e.world.tick < 4800) {
      const cmds = referenceOperator(e.getTraineeView());
      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }
    endTicks.push(e.world.tick);
  }
  const minEnd = Math.min(...endTicks);
  const maxEnd = Math.max(...endTicks);
  const span = maxEnd - minEnd;
  console.log(`${sc}: endTicks=[${endTicks.join(', ')}], span=${span} ticks`);
}
