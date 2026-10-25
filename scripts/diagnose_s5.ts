import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

// Check when actor 5 spawns and its range over time
const e1 = new Engine('s5', 'city_edge_night');
const spawnHistory: Array<{tick: number, range: number}> = [];

while (!e1.missionState.ended) {
  const view = e1.getTraineeView();
  referenceOperator(view); // just call to gather
  
  const a5 = e1.actors.find(a => a.id === 5);
  if (a5 && a5.state === 'active') {
    const range = Math.sqrt(a5.pos.x**2 + a5.pos.y**2 + a5.pos.z**2);
    if (spawnHistory.length === 0 || spawnHistory[spawnHistory.length-1].range - range > 50) {
      spawnHistory.push({ tick: e1.world.tick, range });
    }
  }
  e1.step();
}

console.log('Actor 5 range history (samples):');
for (const h of spawnHistory) {
  console.log(`  tick ${h.tick}: range ${h.range.toFixed(0)} m`);
}

// Now check tracks for actor 5
const e2 = new Engine('s5', 'city_edge_night');
while (!e2.missionState.ended) {
  const view = e2.getTraineeView();
  referenceOperator(view);
  
  for (const t of e2.tracks) {
    if (t.actorId === 5 && t.state !== 'dropped') {
      console.log(`  tick ${e2.world.tick}: Track ${t.trackId} for actor 5 visible, state=${t.state}, plots=${t.totalPlots}, range=${t.estimatedPos ? Math.sqrt(t.estimatedPos.x**2+t.estimatedPos.y**2).toFixed(0) : '?'}`);
    }
  }
  e2.step();
}
