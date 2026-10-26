import { describe, it, expect } from 'vitest';
import {
  Engine,
  referenceOperator,
  scoreSession,
  Tier,
  TraineeView,
  Command,
  ProceduralScenario,
} from '../../src/sim/index.js';
import { oracleStep } from '../../src/sim/bots/oracleOperator.js';

function runMissionWithBot(
  seed: string | number,
  scenarioIdOrDef: string | ProceduralScenario,
  botFn: (view: TraineeView) => Command[],
  maxTicks = 4800
): Engine {
  const engine = new Engine(seed, scenarioIdOrDef);
  while (!engine.missionState.ended && engine.world.tick < maxTicks) {
    const view = engine.getTraineeView();
    const commands = botFn(view);
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd) engine.enqueueCommand(cmd);
    }
    engine.step();
  }
  return engine;
}

function runMissionWithOracle(
  seed: string | number,
  scenarioIdOrDef: string | ProceduralScenario,
  maxTicks = 4800
): Engine {
  const engine = new Engine(seed, scenarioIdOrDef);
  while (!engine.missionState.ended && engine.world.tick < maxTicks) {
    const view = engine.getTraineeView();
    const commands = oracleStep(view, engine);
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd) engine.enqueueCommand(cmd);
    }
    engine.step();
  }
  return engine;
}

describe('Phase 4A Step 0.1 Calibration Targets Suite', { timeout: 300000 }, () => {
  // Target 1: Oracle >= 90 on >= 90% (27/30) of 30 veteran seeds (Set 1)
  it('Target 1a: Oracle >= 90 on >= 90% of 30 veteran seeds (Set 1, prefix cap-vet-)', () => {
    let passCount = 0;
    for (let s = 1; s <= 30; s++) {
      const seed = `cap-vet-${s}`;
      const engine = runMissionWithOracle(seed, 'proc:v1:veteran');
      const score = scoreSession(engine.getEvents(), {
        actors: engine.actors,
        tracks: engine.tracks,
        events: engine.getEvents(),
        assetHit: engine.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
      });
      if (score.total >= 90) passCount++;
    }
    const rate = passCount / 30;
    console.log(`Set 1 Veteran Oracle Pass Rate: ${passCount}/30 (${(rate * 100).toFixed(1)}%) [Target: >= 90%]`);
    expect(passCount).toBeGreaterThanOrEqual(27);
  });

  // Target 1b: Oracle >= 90 on >= 90% (27/30) of 30 veteran seeds (Set 2)
  it('Target 1b: Oracle >= 90 on >= 90% of 30 veteran seeds (Set 2, prefix cap-vet-b-)', () => {
    let passCount = 0;
    for (let s = 1; s <= 30; s++) {
      const seed = `cap-vet-b-${s}`;
      const engine = runMissionWithOracle(seed, 'proc:v1:veteran');
      const score = scoreSession(engine.getEvents(), {
        actors: engine.actors,
        tracks: engine.tracks,
        events: engine.getEvents(),
        assetHit: engine.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
      });
      if (score.total >= 90) passCount++;
    }
    const rate = passCount / 30;
    console.log(`Set 2 Veteran Oracle Pass Rate: ${passCount}/30 (${(rate * 100).toFixed(1)}%) [Target: >= 90%]`);
    expect(passCount).toBeGreaterThanOrEqual(27);
  });

  // Target 2: Elite oracle mean 90-98
  it('Target 2: Elite oracle mean score is between 90 and 98', () => {
    let totalScore = 0;
    const n = 20;
    for (let s = 1; s <= n; s++) {
      const seed = `target-elite-oracle-${s}`;
      const engine = runMissionWithOracle(seed, 'proc:v1:elite');
      const score = scoreSession(engine.getEvents(), {
        actors: engine.actors,
        tracks: engine.tracks,
        events: engine.getEvents(),
        assetHit: engine.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
      });
      totalScore += score.total;
    }
    const mean = totalScore / n;
    console.log(`Elite Oracle Mean Score: ${mean.toFixed(1)} [Target: 90 - 98]`);
    expect(mean).toBeGreaterThanOrEqual(90);
    expect(mean).toBeLessThanOrEqual(98);
  });

  // Target 3: Reference means >= 95 recruit / >= 80 operator / >= 30 veteran / >= 7 elite
  it('Target 3: Reference operator means meet tier targets (>=95, >=80, >=30, >=7)', () => {
    const targets: Record<Tier, number> = {
      recruit: 95,
      operator: 80,
      veteran: 30,
      elite: 7,
    };

    const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
    for (const tier of tiers) {
      let total = 0;
      for (let s = 1; s <= 20; s++) {
        const seed = `target-ref-${tier}-${s}`;
        const engine = runMissionWithBot(seed, `proc:v1:${tier}`, referenceOperator);
        const score = scoreSession(engine.getEvents(), {
          actors: engine.actors,
          tracks: engine.tracks,
          events: engine.getEvents(),
          assetHit: engine.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
        });
        total += score.total;
      }
      const mean = total / 20;
      console.log(`${tier.toUpperCase()} Reference Mean: ${mean.toFixed(1)} [Target: >= ${targets[tier]}]`);
      expect(mean).toBeGreaterThanOrEqual(targets[tier]);
    }
  });

  // Target 4: Decoy correct-class rate >= 70% (veteran/elite)
  it('Target 4: Decoy correct-class rate >= 70% on veteran and elite scenarios', () => {
    let totalDecoys = 0;
    let correctDecoys = 0;

    for (const tier of ['veteran', 'elite'] as const) {
      for (let s = 1; s <= 15; s++) {
        const seed = `target-decoy-${tier}-${s}`;
        const engine = runMissionWithBot(seed, `proc:v1:${tier}`, referenceOperator);
        for (const a of engine.actors) {
          if (a.classId === 'decoy_drone') {
            totalDecoys++;
            const trks = engine.tracks.filter((t) => t.actorId === a.id);
            const lastAssessed = trks.map((t) => t.assessedClass).filter(Boolean).pop();
            if (lastAssessed === 'decoy_drone') {
              correctDecoys++;
            }
          }
        }
      }
    }

    const rate = totalDecoys > 0 ? correctDecoys / totalDecoys : 0;
    console.log(`Decoy Classification Rate: ${correctDecoys}/${totalDecoys} (${(rate * 100).toFixed(1)}%) [Target: >= 70%]`);
    expect(rate).toBeGreaterThanOrEqual(0.70);
  });
});
