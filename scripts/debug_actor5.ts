import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

for (const s of ['s1', 's4']) {
  const e = new Engine(s, 'city_edge_night');
  console.log(`\n=== SCENARIO city_edge_night ${s} ===`);
  while (!e.missionState.ended && e.world.tick < 4800) {
    const view = e.getTraineeView();
    const act5 = e.actors.find((a) => a.id === 5);
    if (act5 && act5.state === 'active' && view.tick % 40 === 0) {
      const actDist = Math.sqrt(act5.pos.x**2 + act5.pos.y**2);
      const jamBusy = view.effectors.jammer.busyUntilTick > view.tick;
      const gunBusy = view.effectors.gun.busyUntilTick > view.tick;
      console.log(`Tick ${view.tick}: Actor 5 dist=${actDist.toFixed(1)}m, jammerBusy=${jamBusy}, gunBusy=${gunBusy}, gunAmmo=${view.effectors.gun.ammo}`);
    }
    const cmds = referenceOperator(view);
    for (const c of cmds) {
      if (c.type === 'ENGAGE_TRACK') {
        console.log(`  -> Tick ${view.tick} ENGAGE track=${c.payload?.trackId} effector=${c.payload?.effector}`);
      }
      e.enqueueCommand(c);
    }
    e.step();
  }
}
