import { Engine } from '../src/sim/core/engine.js';

const e = new Engine('s4', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 3300) {
  for (const trk of e.tracks) {
    if (trk.actorId === 2 && trk.lastDetectedTick === e.world.tick) {
      console.log(`Plot @ tick ${e.world.tick}: range=${trk.rangeM.toFixed(1)}m, bearing=${trk.bearingDeg.toFixed(1)}°, speed=${trk.speedMps?.toFixed(1)}m/s`);
    }
  }
  e.step();
}
