import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { ThreatClassId } from '../src/sim/model/threats.js';
import { Tier } from '../src/sim/scenarios/generator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

interface ContactLossRecord {
  classId: ThreatClassId;
  detectionLost: number;
  classificationLost: number;
  decisionLost: number;
  totalWeight: number;
}

const targetClasses: ThreatClassId[] = [
  'fpv_kamikaze',
  'fpv_fiber',
  'decoy_drone',
  'commercial_quad',
  'bird',
];

// Confusion matrix: truth -> assessed -> count
const confusionMatrix: Record<string, Record<string, number>> = {};
for (const tc of targetClasses) {
  confusionMatrix[tc] = {
    fpv_kamikaze: 0,
    fpv_fiber: 0,
    decoy_drone: 0,
    commercial_quad: 0,
    bird: 0,
    fixed_wing_recon: 0,
    clutter: 0,
    unclassified: 0,
  };
}

// Cue audit: collect distributions per class
interface CueSample {
  speed: number[];
  rcs: Record<string, number>;
  rfStatus: Record<string, number>;
  rfSig: Record<string, number>;
  headingErr: number[];
  eoHints: Record<string, number>;
}
const cueStats: Record<string, CueSample> = {};
for (const tc of targetClasses) {
  cueStats[tc] = {
    speed: [],
    rcs: { tiny: 0, small: 0, medium: 0, large: 0 },
    rfStatus: { emitting: 0, silent: 0, unknown: 0 },
    rfSig: { wideband_video: 0, telemetry_link: 0, long_range_link: 0, unknown_link: 0, none: 0 },
    headingErr: [],
    eoHints: { none: 0, detect: 0, recognize: 0, identify: 0 },
  };
}

for (const tier of ['veteran', 'elite'] as Tier[]) {
  console.log(`\n======================================================`);
  console.log(`               C1. LOSS ANALYSIS: ${tier.toUpperCase()}`);
  console.log(`======================================================`);

  const totalMissions = 20;
  console.log(`Analyzing ${totalMissions} seeds...`);
  let assetHits = 0;
  let totalScoreSum = 0;
  let gunAmmoAtHitSum = 0;
  let gunAmmoAtHitCount = 0;
  let timeToFirstActionSum = 0;
  let jammerBusyTicksSum = 0;
  let gunBusyTicksSum = 0;
  let totalMissionTicksSum = 0;

  const penaltiesByType: Record<string, { count: number; points: number }> = {};
  const lossByClass: Record<string, ContactLossRecord> = {};

  for (const tc of targetClasses) {
    lossByClass[tc] = {
      classId: tc,
      detectionLost: 0,
      classificationLost: 0,
      decisionLost: 0,
      totalWeight: 0,
    };
  }

  for (let s = 1; s <= 20; s++) {
    const seed = `loss-${tier}-${s}`;
    const e = new Engine(seed, `proc:v1:${tier}`);

    let firstActionTick: number | undefined;

    while (!e.missionState.ended && e.world.tick < 4800) {
      const view = e.getTraineeView();
      const cmds = referenceOperator(view);

      if (firstActionTick === undefined && cmds.length > 0) {
        firstActionTick = view.tick;
      }

      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }

    const missionTicks = e.world.tick;
    totalMissionTicksSum += missionTicks;
    if (firstActionTick !== undefined) {
      timeToFirstActionSum += firstActionTick * 0.05;
    }

    const events = e.getEvents();
    const hitEvt = events.find((ev) => ev.type === 'ASSET_HIT');
    if (hitEvt) {
      assetHits++;
      const gunAmmo = e.effectorState.gun.ammo;
      gunAmmoAtHitSum += gunAmmo;
      gunAmmoAtHitCount++;
    }

    // Effector utilization
    let jammerBusyTicks = 0;
    let gunBusyTicks = 0;
    for (const ev of events) {
      if (ev.type === 'ENGAGEMENT_STARTED') {
        if (ev.payload?.effector === 'jammer') jammerBusyTicks += 40;
        if (ev.payload?.effector === 'gun') gunBusyTicks += 10;
      }
    }
    jammerBusyTicksSum += jammerBusyTicks;
    gunBusyTicksSum += gunBusyTicks;

    const rep = scoreSession({
      actors: e.actors,
      tracks: e.tracks,
      events,
      assetHit: hitEvt !== undefined,
    });

    totalScoreSum += rep.total;

    for (const p of rep.penalties) {
      const key = p.reason.split(':')[0] ?? p.reason;
      if (!penaltiesByType[key]) penaltiesByType[key] = { count: 0, points: 0 };
      penaltiesByType[key].count++;
      penaltiesByType[key].points += p.points;
    }

    // Contact losses
    for (const pc of rep.perContact) {
      const cls = pc.classId;
      if (lossByClass[cls]) {
        // SCORING_WEIGHTS: detection 0.2, classification 0.3, decision 0.5
        lossByClass[cls].detectionLost += (1.0 - pc.detectionScore) * 0.2 * 100;
        lossByClass[cls].classificationLost += (1.0 - pc.classificationScore) * 0.3 * 100;
        lossByClass[cls].decisionLost += (1.0 - pc.decisionScore) * 0.5 * 100;
        lossByClass[cls].totalWeight += 1;
      }

      // Confusion matrix update
      const assessed = pc.assessedClass ?? 'unclassified';
      if (confusionMatrix[cls]) {
        confusionMatrix[cls][assessed] = (confusionMatrix[cls][assessed] ?? 0) + 1;
      }
    }

    // Cue statistics collection from confirmed tracks
    for (const trk of e.tracks) {
      if (trk.state === 'dropped') continue;
      const act = e.actors.find((a) => a.id === trk.actorId);
      if (!act || !cueStats[act.classId]) continue;
      const c = cueStats[act.classId];

      if (trk.estimatedVel) {
        const spd = Math.sqrt(trk.estimatedVel.x ** 2 + trk.estimatedVel.y ** 2);
        c.speed.push(spd);
      }
      if (trk.rcsBucket) c.rcs[trk.rcsBucket] = (c.rcs[trk.rcsBucket] ?? 0) + 1;
      if (trk.rfStatus) c.rfStatus[trk.rfStatus] = (c.rfStatus[trk.rfStatus] ?? 0) + 1;
      if (trk.rfSignature) c.rfSig[trk.rfSignature] = (c.rfSig[trk.rfSignature] ?? 0) + 1;
    }
  }

  console.log(`Mean Reference Score: ${(totalScoreSum / 20).toFixed(1)} / 100`);
  console.log(`Asset Hit Rate: ${assetHits}/20 (${((assetHits / 20) * 100).toFixed(1)}%)`);
  console.log(`Gun Ammo Left At Asset Hit: ${gunAmmoAtHitCount > 0 ? (gunAmmoAtHitSum / gunAmmoAtHitCount).toFixed(1) : 'N/A'}`);
  console.log(`Mean Time to First Action: ${(timeToFirstActionSum / 20).toFixed(2)} s`);
  console.log(`Effector Idle Time:`);
  console.log(`  Jammer Idle: ${(100 - (jammerBusyTicksSum / totalMissionTicksSum) * 100).toFixed(1)}%`);
  console.log(`  Gun Idle: ${(100 - (gunBusyTicksSum / totalMissionTicksSum) * 100).toFixed(1)}%`);
  console.log(`Penalties by Type:`);
  for (const [k, v] of Object.entries(penaltiesByType)) {
    console.log(`  ${k}: ${v.count} occurrences, -${v.points} pts total (mean -${(v.points / 20).toFixed(1)}/run)`);
  }
  console.log(`Mean Points Lost per Contact by Component:`);
  for (const tc of targetClasses) {
    const l = lossByClass[tc];
    if (l.totalWeight > 0) {
      const n = l.totalWeight;
      console.log(`  ${tc.padEnd(16)} (N=${n}): Det -${(l.detectionLost / n).toFixed(1)} pts, Class -${(l.classificationLost / n).toFixed(1)} pts, Dec -${(l.decisionLost / n).toFixed(1)} pts | Total -${((l.detectionLost + l.classificationLost + l.decisionLost) / n).toFixed(1)} pts`);
    }
  }
}

console.log(`\n======================================================`);
console.log(`               C2. CONFUSION MATRIX`);
console.log(`======================================================`);
console.log(`Truth Class      | fpv_kam | fpv_fib | decoy   | comm_qd | bird    | fxd_wng | clutter | unclass`);
console.log(`-----------------|---------|---------|---------|---------|---------|---------|---------|--------`);
for (const tc of targetClasses) {
  const row = confusionMatrix[tc];
  const pTc = tc.padEnd(16);
  const pKam = String(row.fpv_kamikaze ?? 0).padStart(7);
  const pFib = String(row.fpv_fiber ?? 0).padStart(7);
  const pDec = String(row.decoy_drone ?? 0).padStart(7);
  const pQd = String(row.commercial_quad ?? 0).padStart(7);
  const pBrd = String(row.bird ?? 0).padStart(7);
  const pFw = String(row.fixed_wing_recon ?? 0).padStart(7);
  const pClt = String(row.clutter ?? 0).padStart(7);
  const pUnc = String(row.unclassified ?? 0).padStart(7);
  console.log(`${pTc} | ${pKam} | ${pFib} | ${pDec} | ${pQd} | ${pBrd} | ${pFw} | ${pClt} | ${pUnc}`);
}

console.log(`\n======================================================`);
console.log(`               C2. CUE SEPARATION SUMMARY`);
console.log(`======================================================`);
for (const tc of targetClasses) {
  const c = cueStats[tc];
  const speeds = c.speed;
  const meanSpd = speeds.length > 0 ? (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1) : 'N/A';
  const minSpd = speeds.length > 0 ? Math.min(...speeds).toFixed(1) : 'N/A';
  const maxSpd = speeds.length > 0 ? Math.max(...speeds).toFixed(1) : 'N/A';
  console.log(`Class: ${tc}`);
  console.log(`  Speed (m/s): min=${minSpd}, mean=${meanSpd}, max=${maxSpd} (N=${speeds.length})`);
  console.log(`  RCS Buckets: ${JSON.stringify(c.rcs)}`);
  console.log(`  RF Status: ${JSON.stringify(c.rfStatus)}`);
  console.log(`  RF Signatures: ${JSON.stringify(c.rfSig)}`);
}
