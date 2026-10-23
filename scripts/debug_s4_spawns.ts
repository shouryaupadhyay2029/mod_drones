import { Engine } from '../src/sim/core/engine.js';

const e = new Engine('s4', 'city_edge_night');
for (const s of e.scheduledSpawns) {
  console.log(`Spawn: tick=${s.tick}, class=${s.classId}, pos=(${s.pos.x.toFixed(1)}, ${s.pos.y.toFixed(1)}, ${s.pos.z.toFixed(1)}), speed=${s.speed}`);
}
