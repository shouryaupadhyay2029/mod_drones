import { mkdirSync, writeFileSync } from 'fs';
import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { scoreSessionV2 } from '../src/sim/scoring/doctrine.js';

mkdirSync('docs/golden', { recursive: true });

const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
const bots = [
  { name: 'reference', fn: referenceOperator },
  { name: 'triggerHappy', fn: triggerHappyOperator },
];

for (const sc of scenarios) {
  for (const bot of bots) {
    const e = new Engine('s1', sc);
    while (!e.missionState.ended) {
      const cmds = bot.fn(e.getTraineeView());
      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }
    const report = scoreSessionV2({
      actors: e.actors,
      tracks: e.tracks,
      events: e.getEvents(),
      assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
    });
    const filename = `docs/golden/${sc}_${bot.name}_s1.json`;
    writeFileSync(filename, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`Generated ${filename}: total=${report.total}, subscores=${JSON.stringify(report.subscores)}`);
  }
}
