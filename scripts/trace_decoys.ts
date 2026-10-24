import { Engine } from '../src/sim/core/engine.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { computeHeadingErrorToAsset } from '../src/sim/bots/referenceOperator.js';

interface DetailedTrace {
  time: string;
  actorId: number;
  trackId: number;
  assessedClass: string;
  rcsBucket: string;
  rfStatus: string;
  speed: string;
  headingError: string;
  ruleFired: string;
}

async function traceDecoys() {
  const plotBuckets: string[] = [];
  const misclassifiedTraces: DetailedTrace[] = [];
  const seenPlotTicks = new Set<string>();

  for (let s = 1; s <= 20; s++) {
    const seed = `trace-vet-${s}`;
    const e = new Engine(seed, `proc:v1:veteran`);

    while (!e.missionState.ended) {
      const currentTick = e.world.tick;
      const view = e.getTraineeView();
      const cmds = referenceOperator(view);

      for (const cmd of cmds) {
        if (cmd.type === 'CLASSIFY_TRACK') {
          const payload = cmd.payload as { trackId: number; assessedClass: string };
          const tid = payload.trackId;
          const trk = e.tracks.find((t) => t.trackId === tid);
          const act = e.actors.find((a) => a.id === trk?.actorId);
          if (act && act.classId === 'decoy_drone') {
            const assessed = payload.assessedClass;
            const viewTrk = view.tracks.find((t) => t.trackId === tid);
            if (assessed !== 'decoy_drone' && misclassifiedTraces.length < 5) {
              const hErr = viewTrk ? computeHeadingErrorToAsset(viewTrk) : undefined;
              let rule = 'Kinematics Cue D (commercial_quad)';
              if (assessed === 'fpv_kamikaze') rule = 'Kinematics Cue C2 (fpv_kamikaze: speed>=18, closing<=-14, headingErr<=35, rf!=silent)';
              else if (assessed === 'fpv_fiber') rule = 'Re-evaluation (jammer ineffective or inbound attack)';

              misclassifiedTraces.push({
                time: (currentTick / 20).toFixed(1) + 's (tick ' + currentTick + ')',
                actorId: act.id,
                trackId: tid,
                assessedClass: assessed,
                rcsBucket: viewTrk?.rcsBucket ?? 'unknown',
                rfStatus: viewTrk?.rfStatus ?? 'unknown',
                speed: viewTrk?.speedMps ? Math.round(viewTrk.speedMps) + ' m/s' : 'unknown',
                headingError: hErr !== undefined ? Math.round(hErr) + '°' : 'unknown',
                ruleFired: rule,
              });
            }
          }
        }
        e.enqueueCommand(cmd);
      }
      e.step();

      // Record decoy plot buckets after step
      for (const t of e.tracks) {
        if (t.state === 'dropped') continue;
        const act = e.actors.find((a) => a.id === t.actorId);
        if (act && act.classId === 'decoy_drone') {
          const key = `${t.trackId}:${t.lastDetectedTick}`;
          if (!seenPlotTicks.has(key)) {
            seenPlotTicks.add(key);
            plotBuckets.push(t.rcsBucket);
          }
        }
      }
    }
  }

  console.log('=== DECOY PLOT RCS BUCKET AUDIT ===');
  const mediumCount = plotBuckets.filter((b) => b === 'medium').length;
  console.log(`Total decoy plots sampled: ${plotBuckets.length}`);
  console.log(`Medium RCS plots: ${mediumCount} (${((mediumCount / plotBuckets.length) * 100).toFixed(1)}%)`);
  console.log(`Small RCS plots: ${plotBuckets.filter((b) => b === 'small').length}`);
  console.log(`Tiny RCS plots: ${plotBuckets.filter((b) => b === 'tiny').length}`);

  console.log('\n=== 5 MISCLASSIFIED DECOY CONTACTS (DECISION TRACES) ===');
  console.log(JSON.stringify(misclassifiedTraces, null, 2));
}

traceDecoys();
