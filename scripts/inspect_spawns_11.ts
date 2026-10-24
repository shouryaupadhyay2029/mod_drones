import { generateScenario } from '../src/sim/scenarios/generator.js';

const sc = generateScenario('cap-vet-11', 'veteran');
console.log('Spawns for cap-vet-11:');
for (const s of sc.spawns) {
  const d0 = Math.round(Math.sqrt(s.pos.x * s.pos.x + s.pos.y * s.pos.y + s.pos.z * s.pos.z));
  console.log(`tick=${s.tick} (${(s.tick/20).toFixed(1)}s) classId=${s.classId} role=${s.role} speed=${s.speed?.toFixed(1)} dist=${d0}m`);
}
