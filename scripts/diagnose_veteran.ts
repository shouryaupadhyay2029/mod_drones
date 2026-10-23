import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { generateScenario } from '../src/sim/scenarios/generator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

const failedSeeds = ['solv-veteran-2', 'solv-veteran-7', 'solv-veteran-8', 'solv-veteran-11'];

for (const seed of failedSeeds) {
  const sc = generateScenario(seed, 'veteran');
  console.log(`\n=================== ${seed} ===================`);
  console.log(`Tactic: ${sc.tactic}, EW: ${sc.environment.ewLevel}, Weather: ${sc.environment.weather}, Terrain: ${sc.environment.terrainKind}`);
  console.log(`Spawns count: ${sc.spawns.length}`);
  for (const sp of sc.spawns) {
    console.log(`  tick=${sp.tick}, class=${sp.classId}, speed=${sp.speed}, pos=(${Math.round(sp.pos.x)}, ${Math.round(sp.pos.y)}, ${Math.round(sp.pos.z)}), role=${sp.role}, group=${sp.groupId}`);
  }

  const e = new Engine(seed, 'proc:v1:veteran');
  while (!e.missionState.ended && e.world.tick < 4800) {
    const cmds = oracleStep(e.getTraineeView(), e);
    for (const c of cmds) e.enqueueCommand(c);
    e.step();
  }

  const rep = scoreSession({
    actors: e.actors,
    tracks: e.tracks,
    events: e.getEvents(),
    assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
  });

  console.log(`Outcome: ${e.missionState.reason}, Total: ${rep.total}, WeightedMean: ${rep.weightedMean}`);
  console.log('Penalties:', rep.penalties);
  console.log('EffectorUse:', rep.effectorUse);
  console.log('Events:');
  for (const ev of e.getEvents()) {
    if (ev.type === 'ASSET_HIT' || ev.type === 'DECOY_IMPACT' || ev.type === 'ENGAGEMENT_STARTED' || ev.type === 'ENGAGEMENT_RESOLVED' || ev.type === 'COMMAND_REJECTED' || ev.type === 'ENGAGEMENT_REJECTED') {
      console.log(`  Tick ${ev.tick}: ${ev.type}`, JSON.stringify(ev.payload));
    }
  }
}
