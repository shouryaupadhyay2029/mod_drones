import { generateScenario } from '../src/sim/scenarios/generator.js';
import { capacityCheck } from '../src/sim/scenarios/capacity.js';

for (const s of [10, 11, 25, 29]) {
  const seed = `cap-vet-${s}`;
  const sc = generateScenario(seed, 'veteran');
  console.log(`${seed}: capacityRatio = ${capacityCheck(sc.spawns).toFixed(3)}`);
}
