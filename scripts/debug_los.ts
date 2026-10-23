import { Engine } from '../src/sim/core/engine.js';
import { hasLineOfSight } from '../src/sim/model/terrain.js';

const e = new Engine('solv-veteran-29', 'proc:v1:veteran');
const mastPos = { x: 0, y: 0, z: 15 };

while (!e.missionState.ended && e.world.tick < 3550) {
  const act = e.actors.find((a) => a.id === 10);
  if (act && e.world.tick % 40 === 0) {
    const los = hasLineOfSight(mastPos, act.pos, e.terrain, 50);
    const h = e.terrain?.heightAt(act.pos.x, act.pos.y) ?? 0;
    const clutter = e.terrain?.clutterAt(act.pos.x, act.pos.y) ?? 0;
    const r = Math.sqrt(act.pos.x ** 2 + act.pos.y ** 2);
    console.log(`Tick ${e.world.tick}: r=${r.toFixed(0)}m, pos=(${act.pos.x.toFixed(0)}, ${act.pos.y.toFixed(0)}, ${act.pos.z.toFixed(0)}), terrainH=${h.toFixed(0)}, AGL=${(act.pos.z - h).toFixed(0)}, LOS=${los}, clutter=${clutter}`);
  }
  e.step();
}
