import { runForkDemo } from './fork-demo-core.js';

const demo = runForkDemo();

if (process.argv.includes('--records-json')) {
  console.log(JSON.stringify(demo));
} else {
  console.log('=== REAL ENGINE PHASE 5.1 FORK DEMO ===');
  console.log(`Scenario: ${demo.parent.scenarioKey}; seed: ${demo.parent.seed}; score version: ${demo.parent.scoreVersion}`);
  console.log(`First neutral ENGAGEMENT_STARTED: ${JSON.stringify(demo.firstNeutralEngagement)}`);
  console.log(`Fork tick: ${demo.forkTick} (${(demo.forkTick / 20).toFixed(2)} s before neutral engagement)`);
  console.log(`Scripted neutral engagement command: ${JSON.stringify(demo.scriptedNeutralEngagementCommand)}`);
  console.log(`Original score: ${demo.parent.summary.total} / ${demo.parent.summary.grade}`);
  console.log(`No-further-commands fork score: ${demo.noCommandFork.summary.total} / ${demo.noCommandFork.summary.grade}`);
  console.log(`HOLD_FIRE fork score: ${demo.holdFireFork.summary.total} / ${demo.holdFireFork.summary.grade}`);
  console.log(`Replay hashes: ${JSON.stringify(demo.replayHashes)}`);
  console.log('compareSessions JSON (fork with no further commands):');
  console.log(JSON.stringify(demo.noCommandComparison, null, 2));
  console.log(`Narrative: ${demo.noCommandComparison.narrative.join(' | ')}`);
  console.log('compareSessions JSON (fork with HOLD_FIRE):');
  console.log(JSON.stringify(demo.comparison, null, 2));
  console.log(`Narrative: ${demo.comparison.narrative.join(' | ')}`);
}
