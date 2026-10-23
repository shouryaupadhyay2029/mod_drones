import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

// Test across 600 missions: 200 per scripted scenario (seeds 1 to 200)
const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
let minIntervalTicks = 999999;
let violations = 0;
let totalPlotsChecked = 0;

for (const sc of scenarios) {
  for (let s = 1; s <= 200; s++) {
    const seed = `spacing-${sc}-${s}`;
    const e = new Engine(seed, sc);

    // Track plot ticks per trackId
    const lastPlotTickPerTrack = new Map<number, number>();

    while (!e.missionState.ended && e.world.tick < 4800) {
      const cmds = referenceOperator(e.getTraineeView());
      for (const c of cmds) e.enqueueCommand(c);

      // Check plot updates before step
      e.step();

      // Check tracks in engine
      for (const trk of e.tracks) {
        if (trk.state === 'dropped') continue;
        const prevTick = lastPlotTickPerTrack.get(trk.trackId);
        if (prevTick !== undefined && trk.lastDetectedTick !== prevTick) {
          const interval = trk.lastDetectedTick - prevTick;
          totalPlotsChecked++;
          if (interval < minIntervalTicks) minIntervalTicks = interval;
          if (interval < 38) {
            violations++;
            console.log(`Violation in ${sc} ${seed} track ${trk.trackId}: interval=${interval} ticks (${interval * 0.05}s)`);
          }
        }
        lastPlotTickPerTrack.set(trk.trackId, trk.lastDetectedTick);
      }
    }
  }
}

console.log(`Over 600 missions: total plots=${totalPlotsChecked}, minIntervalTicks=${minIntervalTicks} (${minIntervalTicks * 0.05}s), violations (<1.9s)=${violations}`);
