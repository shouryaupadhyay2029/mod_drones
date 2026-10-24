import { Engine } from '../src/sim/core/engine.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

function runSet(prefix: string, count: number): number {
  let pass = 0;
  for (let s = 1; s <= count; s++) {
    const seed = `${prefix}-${s}`;
    const e = new Engine(seed, 'proc:v1:veteran');
    while (!e.missionState.ended) {
      const cmds = oracleStep(e.getTraineeView(), e);
      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }
    const rep = scoreSession(e.getEvents(), {
      actors: e.actors,
      tracks: e.tracks,
      events: e.getEvents(),
      assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
    });
    if (rep.total >= 90) pass++;
  }
  return pass;
}

async function main() {
  console.log('Testing Set 1 (cap-vet-1..30)...');
  const pass1 = runSet('cap-vet', 30);
  console.log(`Set 1: ${pass1}/30 (${((pass1 / 30) * 100).toFixed(1)}%) pass >= 90`);

  console.log('Testing Set 2 (cap-vet-b-1..30)...');
  const pass2 = runSet('cap-vet-b', 30);
  console.log(`Set 2: ${pass2}/30 (${((pass2 / 30) * 100).toFixed(1)}%) pass >= 90`);
}

main();
