import { describe, it, expect } from 'vitest';
import {
  Engine,
  referenceOperator,
  idleOperator,
  scoreSession,
  generateScenario,
  Tier,
  TraineeView,
  Command,
  ProceduralScenario,
} from '../src/sim/index.js';
import { vDist } from '../src/sim/core/vec.js';

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

describe('Phase 3B Acceptance Tests', { timeout: 180000 }, () => {
  // A2. ASSET_HIT scoring and spawn/end tick variance
  it('A2. Every run containing ASSET_HIT has the -30 penalty line and total <= weightedMean - 30 (clamped at 0)', () => {
    const scenarioIds = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];

    for (const scId of scenarioIds) {
      for (let s = 1; s <= 5; s++) {
        const seed = `s${s}`;
        const engine = runMissionWithBot(seed, scId, idleOperator);
        const score = scoreSession(engine.getEvents(), {
          actors: engine.actors,
          tracks: engine.tracks,
          events: engine.getEvents(),
          assetHit: engine.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
        });

        const hasAssetHit = engine.getEvents().some((e) => e.type === 'ASSET_HIT');
        if (hasAssetHit) {
          const penaltyLine = score.penalties.find(
            (p) => p.reason.includes('Asset was hit: -30') || p.points === 30
          );
          expect(penaltyLine).toBeDefined();
          expect(penaltyLine!.points).toBe(30);
          expect(score.total).toBeLessThanOrEqual(Math.max(0, Math.round(score.weightedMean - 30)));
        }
      }
    }
  });

  it('A2. Across 5 seeds the scripted scenarios spawn ticks and end ticks differ (end ticks span >= 60 ticks)', () => {
    const scenarioIds = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];

    for (const scId of scenarioIds) {
      const endTicks: number[] = [];
      const firstSpawnTicks: number[] = [];

      for (let s = 1; s <= 5; s++) {
        const seed = `s${s}`;
        const engine = runMissionWithBot(seed, scId, referenceOperator);
        firstSpawnTicks.push(engine.scheduledSpawns[0].tick);
        endTicks.push(engine.world.tick);
      }

      // Check spawn ticks differ across seeds
      const uniqueSpawnTicks = new Set(firstSpawnTicks);
      expect(uniqueSpawnTicks.size).toBeGreaterThan(1);

      // Check end ticks differ across seeds and span >= 60 ticks
      const minEnd = Math.min(...endTicks);
      const maxEnd = Math.max(...endTicks);
      const span = maxEnd - minEnd;

      expect(span).toBeGreaterThanOrEqual(60);
    }
  });

  // B1. Spacing invariant across tactics and tiers
  it('B1. Across 50 seeds x all tactics x all tiers, no two actors spawn within 20 m of each other within the same 2 s', () => {
    const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
    let checkedPairs = 0;

    for (const tier of tiers) {
      for (let s = 1; s <= 50; s++) {
        const seed = `b1-${tier}-${s}`;
        const sc = generateScenario(seed, tier);
        const spawns = sc.spawns;

        for (let i = 0; i < spawns.length; i++) {
          for (let j = i + 1; j < spawns.length; j++) {
            const a = spawns[i]!;
            const b = spawns[j]!;
            const dt = Math.abs(a.tick - b.tick);
            if (dt <= 40) {
              // 2 seconds = 40 ticks
              checkedPairs++;
              const dist = vDist(a.pos, b.pos);
              expect(dist).toBeGreaterThanOrEqual(20);
            }
          }
        }
      }
    }
    expect(checkedPairs).toBeGreaterThan(0);
  });

  // B3. Plot spacing test: >= 1.9 s (38 ticks) over 600 missions
  it('B3. Plot spacing >= 1.9 s (38 ticks) across 600 missions', () => {
    const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
    let missions = 0;

    for (const sc of scenarios) {
      for (let s = 1; s <= 200; s++) {
        missions++;
        const engine = new Engine(`ps-${sc}-${s}`, sc);
        const lastPlotTickPerTrack = new Map<number, number>();

        while (!engine.missionState.ended && engine.world.tick < 4800) {
          const view = engine.getTraineeView();
          const commands = referenceOperator(view);
          for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            if (cmd) engine.enqueueCommand(cmd);
          }
          engine.step();

          for (const track of engine.tracks) {
            if (track.state === 'dropped') continue;
            const prevTick = lastPlotTickPerTrack.get(track.trackId);
            if (prevTick !== undefined && track.lastDetectedTick !== prevTick) {
              const intervalTicks = track.lastDetectedTick - prevTick;
              expect(intervalTicks).toBeGreaterThanOrEqual(38);
            }
            lastPlotTickPerTrack.set(track.trackId, track.lastDetectedTick);
          }
        }
      }
    }
    expect(missions).toBe(600);
  });
});
