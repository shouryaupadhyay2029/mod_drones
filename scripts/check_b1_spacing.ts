import { generateScenario, Tier } from '../src/sim/scenarios/generator.js';
import { vDist } from '../src/sim/core/vec.js';

const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
let checkedPairs = 0;
let violations = 0;

for (const tier of tiers) {
  for (let s = 1; s <= 50; s++) {
    const seed = `swarm-spacing-${tier}-${s}`;
    const sc = generateScenario(seed, tier);
    const spawns = sc.spawns;

    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const s1 = spawns[i]!;
        const s2 = spawns[j]!;

        const tickDiff = Math.abs(s1.tick - s2.tick);
        // within the same 2 s (<= 40 ticks)
        if (tickDiff <= 40) {
          checkedPairs++;
          const dist = vDist(s1.pos, s2.pos);
          if (dist < 20) {
            violations++;
            console.log(`Violation in ${tier} ${seed}: s1=${s1.classId}@(${s1.pos.x.toFixed(1)}, ${s1.pos.y.toFixed(1)}) vs s2=${s2.classId}@(${s2.pos.x.toFixed(1)}, ${s2.pos.y.toFixed(1)}), dist=${dist.toFixed(2)}m, dt=${tickDiff} ticks`);
          }
        }
      }
    }
  }
}

console.log(`Checked pairs: ${checkedPairs}, Violations (<20m within 2s): ${violations}`);
if (violations === 0) {
  console.log('B1 SPACING CHECK PASSED SUCCESSFULLY!');
} else {
  process.exit(1);
}
