import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { scoreSessionV2 } from '../src/sim/scoring/doctrine.js';

const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'] as const;
const bots = [
  { name: 'reference', run: referenceOperator },
  { name: 'triggerHappy', run: triggerHappyOperator },
] as const;

for (const scenario of scenarios) {
  for (const bot of bots) {
    const engine = new Engine('s1', scenario);
    while (!engine.missionState.ended) {
      for (const command of bot.run(engine.getTraineeView())) engine.enqueueCommand(command);
      engine.step();
    }

    const events = engine.getEvents();
    const report = scoreSessionV2({
      actors: engine.actors,
      tracks: engine.tracks,
      events,
      assetHit: events.some((event) => event.type === 'ASSET_HIT'),
    });
    const target = resolve(`docs/golden/${scenario}_${bot.name}_s1.json`);
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`${scenario}/${bot.name}: ${report.total} ${report.grade} -> ${target}`);
  }
}
