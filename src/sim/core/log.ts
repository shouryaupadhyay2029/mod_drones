import { Engine } from './engine.js';
import { SessionLog } from './types.js';

export function replay(log: SessionLog): string {
  const engine = new Engine(log.seed, log.scenarioId);

  for (let i = 0; i < log.commands.length; i++) {
    const cmd = log.commands[i];
    if (cmd) {
      engine.enqueueCommand({
        tick: cmd.tick,
        type: cmd.type,
        payload: { ...cmd.payload },
      });
    }
  }

  while (engine.world.tick < log.totalTicks) {
    engine.step();
  }

  return engine.getHash();
}
