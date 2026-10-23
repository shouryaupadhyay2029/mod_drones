import { Engine } from '../src/sim/core/engine.js';
import { hasLineOfSight } from '../src/sim/model/terrain.js';
import { vec3 } from '../src/sim/core/vec.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3600) {
  const act5 = e.actors.find((a) => a.id === 5);
  if (act5 && act5.state === 'active' && e.world.tick % 40 === 0) {
    const los = hasLineOfSight(vec3(0, 0, 0), act5.pos, e.terrain);
    console.log(`Tick ${e.world.tick}: dist=${Math.sqrt(act5.pos.x**2 + act5.pos.y**2).toFixed(1)}m, z=${act5.pos.z.toFixed(1)}m, LOS=${los}`);
  }
  e.step();
}
