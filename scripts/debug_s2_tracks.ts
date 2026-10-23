import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';

const e = new Engine('s2', 'city_edge_night');
while (!e.missionState.ended && e.world.tick < 4800) {
  const cmds = referenceOperator(e.getTraineeView());
  for (const c of cmds) e.enqueueCommand(c);
  e.step();
}

console.log('Events for track/engagement:');
for (const ev of e.getEvents()) {
  if (ev.type.includes('ENGAGE') || ev.type.includes('CLASSIFY') || ev.type === 'TRACK_CONFIRMED' || ev.type === 'TRACK_DROPPED') {
    console.log(`Tick ${ev.tick}: ${ev.type}`, JSON.stringify(ev.payload));
  }
}

console.log('Tracks:');
for (const trk of e.tracks) {
  if (trk.actorId === 2) {
    console.log(`Track ${trk.trackId}: actorId=${trk.actorId}, state=${trk.state}, confirmedTick=${trk.confirmedTick}, classifyTick=${trk.classifyTick}, assessedClass=${trk.assessedClass}`);
  }
}
