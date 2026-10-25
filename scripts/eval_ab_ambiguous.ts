import { Engine } from '../src/sim/core/engine.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Command } from '../src/sim/core/types.js';
import { TraineeView } from '../src/sim/view/traineeView.js';

type Mode = 'never_jam' | 'always_jam' | 'tti_25';

function runWithBotMode(seed: string, tier: string, mode: Mode): { score: number; assetHit: boolean } {
  const engine = new Engine(seed, `proc:v1:${tier}`);

  while (!engine.missionState.ended && engine.world.tick < 4800) {
    const view = engine.getTraineeView();
    // Wrap bot to test the modes
    const cmds = botWithMode(view, mode);
    for (const cmd of cmds) engine.enqueueCommand(cmd);
    engine.step();
  }

  const events = engine.getEvents();
  const assetHit = events.some((e) => e.type === 'ASSET_HIT');
  const score = scoreSession(events, {
    actors: engine.actors,
    tracks: engine.tracks,
    events,
    assetHit,
  });

  return { score: score.total, assetHit };
}

// Custom runner that tests the 3 ambiguous policies
function botWithMode(view: TraineeView, mode: Mode): Command[] {
  // We can modify the ambiguous branch behavior by intercepting view.tracks or patching
  // Let's implement the modified referenceOperator logic
  const clonedView: TraineeView = {
    ...view,
    tracks: view.tracks.map((t) => ({ ...t })),
  };

  if (mode === 'always_jam') {
    // If always_jam, change ambiguous to emitting with fake wideband_video so standard logic jams it
    for (const t of clonedView.tracks) {
      if (t.rfStatus === 'ambiguous') {
        t.rfStatus = 'emitting';
        if (!t.rfSignature) t.rfSignature = 'wideband_video';
      }
    }
    return referenceOperator(clonedView);
  } else if (mode === 'never_jam') {
    return referenceOperator(clonedView);
  } else {
    // tti_25: jam ambiguous track classified hostile when time-to-impact < 25s
    // If tti < 25s and hostile, let it be eligible for jammer
    for (const t of clonedView.tracks) {
      if (t.rfStatus === 'ambiguous') {
        const isHostile = t.assessedClass === 'fpv_kamikaze' || t.assessedClass === 'fixed_wing_recon';
        const closingRate = t.closingRateMps ?? 0;
        const tti = closingRate < -0.5 ? t.rangeM / -closingRate : t.rangeM / 10;
        if (isHostile && tti < 25) {
          t.rfStatus = 'emitting';
          if (!t.rfSignature) t.rfSignature = 'wideband_video';
        }
      }
    }
    return referenceOperator(clonedView);
  }
}

async function main() {
  const tiers = ['operator', 'veteran', 'elite'] as const;
  const modes: Mode[] = ['never_jam', 'always_jam', 'tti_25'];

  for (const tier of tiers) {
    console.log(`\n=== TIER: ${tier.toUpperCase()} (20 seeds) ===`);
    for (const mode of modes) {
      let totalScore = 0;
      let assetHits = 0;
      for (let s = 1; s <= 20; s++) {
        const seed = `ab-${tier}-${s}`;
        const res = runWithBotMode(seed, tier, mode);
        totalScore += res.score;
        if (res.assetHit) assetHits++;
      }
      const meanScore = totalScore / 20;
      const hitRate = (assetHits / 20) * 100;
      console.log(`Mode: ${mode.padEnd(12)} -> Mean Score: ${meanScore.toFixed(1)}, Asset Hit Rate: ${hitRate.toFixed(1)}%`);
    }
  }
}

main();
