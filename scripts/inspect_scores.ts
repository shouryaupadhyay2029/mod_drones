import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

function runAndScore(scenario: string, seed: string) {
  const e = new Engine(seed, scenario);
  while (!e.missionState.ended && e.world.tick < 4800) {
    const cmds = referenceOperator(e.getTraineeView());
    for (const c of cmds) e.enqueueCommand(c);
    e.step();
  }
  const rep = scoreSession({
    actors: e.actors,
    tracks: e.tracks,
    events: e.getEvents(),
    assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
  });
  console.log(`=== ${scenario} (${seed}) ===`);
  console.log('Total score:', rep.total);
  console.log('Weighted mean:', rep.weightedMean);
  console.log('Penalties:', JSON.stringify(rep.penalties, null, 2));
  console.log('PerContact JSON:');
  console.log(JSON.stringify(rep.perContact, null, 2));
  console.log('Reasons:');
  for (const r of rep.reasons) {
    console.log('  ', r);
  }
}

runAndScore('city_edge_night', 's1');
runAndScore('ridge_runner', 's4');
runAndScore('city_edge_night', 's3');
runAndScore('city_edge_night', 's4');
