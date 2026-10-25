import { Engine } from '../src/sim/core/engine.js';
import { vLen } from '../src/sim/core/vec.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

export interface SpeedSample {
  classId: string;
  error: number;
}

export function measureSpeedErrors(seedsCount = 20): Record<string, { median: number; p90: number; count: number }> {
  const samplesByClass: Record<string, number[]> = {};

  for (let s = 1; s <= seedsCount; s++) {
    const seed = `speed-eval-${s}`;
    const engine = new Engine(seed, 'proc:v1:veteran');

    while (!engine.missionState.ended && engine.world.tick < 4800) {
      const view = engine.getTraineeView();
      const cmds = referenceOperator(view);
      for (const cmd of cmds) engine.enqueueCommand(cmd);

      // Collect speed error for every confirmed track that has velocity
      for (const trk of view.tracks) {
        if (trk.state === 'confirmed' && trk.velocityValid && trk.speedMps !== undefined) {
          const simTrk = engine.tracks.find((t) => t.trackId === trk.trackId);
          if (simTrk && !simTrk.isGhost) {
            const actor = engine.actors.find((a) => a.id === simTrk.actorId);
            if (actor) {
              const trueSpeed = vLen(actor.vel);
              const err = Math.abs(trk.speedMps - trueSpeed);
              if (!samplesByClass[actor.classId]) {
                samplesByClass[actor.classId] = [];
              }
              samplesByClass[actor.classId]!.push(err);
            }
          }
        }
      }

      engine.step();
    }
  }

  const result: Record<string, { median: number; p90: number; count: number }> = {};
  for (const [cls, errors] of Object.entries(samplesByClass)) {
    errors.sort((a, b) => a - b);
    const median = errors[Math.floor(errors.length * 0.5)] ?? 0;
    const p90 = errors[Math.floor(errors.length * 0.9)] ?? 0;
    result[cls] = { median, p90, count: errors.length };
  }
  return result;
}

const res = measureSpeedErrors(20);
console.log('BEFORE SPEED ERROR DISTRIBUTION (20 seeds):');
console.table(res);
