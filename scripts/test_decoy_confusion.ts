import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';

async function testDecoyConfusion() {
  let totalDecoys = 0;
  const confusion: Record<string, number> = {};

  for (let s = 1; s <= 50; s++) {
    const seed = `decoy-test-${s}`;
    const e = new Engine(seed, `proc:v1:veteran`);

    while (!e.missionState.ended) {
      const view = e.getTraineeView();
      const cmds = referenceOperator(view);
      for (const cmd of cmds) e.enqueueCommand(cmd);
      e.step();
    }

    for (const a of e.actors) {
      if (a.classId === 'decoy_drone') {
        totalDecoys++;
        const trks = e.tracks.filter((t) => t.actorId === a.id);
        const lastAssessed = trks.map((t) => t.assessedClass).filter(Boolean).pop() || 'unclassified';
        confusion[lastAssessed] = (confusion[lastAssessed] || 0) + 1;
      }
    }
  }

  console.log(`=== DECOY CONFUSION RESULTS (50 Veteran Seeds) ===`);
  console.log(`Total decoy contacts: ${totalDecoys}`);
  for (const [cls, count] of Object.entries(confusion)) {
    console.log(`  ${cls}: ${count} (${((count / totalDecoys) * 100).toFixed(1)}%)`);
  }
  const correct = confusion['decoy_drone'] || 0;
  console.log(`Correct classification rate: ${((correct / totalDecoys) * 100).toFixed(1)}%`);
}

testDecoyConfusion();
