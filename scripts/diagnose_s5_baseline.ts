import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

// Test with baseline code (plots >= 2)
const e2 = new Engine('s5', 'city_edge_night');
while (!e2.missionState.ended) {
  const view = e2.getTraineeView();
  const cmds = referenceOperator(view);
  for (const c of cmds) e2.enqueueCommand(c);
  
  for (const t of e2.tracks) {
    if (t.actorId === 5 && t.state !== 'dropped') {
      console.log(`  tick ${e2.world.tick}: Track ${t.trackId} for actor 5, state=${t.state}, plots=${t.totalPlots ?? t.consecutiveHits}, eng=${t.engagementStatus}`);
    }
  }
  e2.step();
}
console.log('Result:', e2.missionState.reason, 'tick:', e2.world.tick);
