import { Engine } from '../src/sim/core/engine.js';
import { hasLineOfSight } from '../src/sim/model/terrain.js';
import { vec3 } from '../src/sim/core/vec.js';
import { DEG_TO_RAD, dCos, dSin } from '../src/sim/core/dmath.js';

const e = new Engine('s4', 'city_edge_night');
const rad = 120 * DEG_TO_RAD;
for (let r = 3500; r >= 200; r -= 100) {
  const p = vec3(r * dSin(rad), r * dCos(rad), 60);
  const los = hasLineOfSight(vec3(0, 0, 0), p, e.terrain);
  console.log(`Range ${r}m: LOS=${los}`);
}
