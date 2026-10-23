import { Engine } from '../src/sim/core/engine.js';
import { Command } from '../src/sim/core/types.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { Tier } from '../src/sim/scenarios/generator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { TraineeView } from '../src/sim/view/traineeView.js';

function smartOracleStep(view: TraineeView, engine: Engine): Command[] {
  const commands: Command[] = [];
  const tracks = engine.tracks;
  const actors = engine.actors;

  // 1. Ack
  for (let i = 0; i < view.tracks.length; i++) {
    const t = view.tracks[i];
    if (t && t.state === 'confirmed' && !t.acked) {
      commands.push({ tick: view.tick, type: 'ACK_TRACK', payload: { trackId: t.trackId } });
    }
  }

  // 2. Classify
  for (let i = 0; i < view.tracks.length; i++) {
    const t = view.tracks[i];
    if (!t || t.state !== 'confirmed' || t.assessedClass !== undefined) continue;
    const simTrack = tracks.find((tr) => tr.trackId === t.trackId);
    if (!simTrack) continue;

    if (simTrack.isGhost) {
      commands.push({ tick: view.tick, type: 'CLASSIFY_TRACK', payload: { trackId: t.trackId, assessedClass: 'clutter' } });
      commands.push({ tick: view.tick, type: 'HOLD_FIRE', payload: { trackId: t.trackId } });
    } else {
      const actor = actors.find((a) => a.id === simTrack.actorId);
      if (actor) {
        commands.push({ tick: view.tick, type: 'CLASSIFY_TRACK', payload: { trackId: t.trackId, assessedClass: actor.classId } });
        const threat = THREAT_LIBRARY[actor.classId];
        if (!threat || !threat.hostile) {
          commands.push({ tick: view.tick, type: 'HOLD_FIRE', payload: { trackId: t.trackId } });
        }
      }
    }
  }

  // 3. Targets
  const hostileTargets: Array<{
    trackId: number;
    rangeM: number;
    timeToImpact: number;
    rfControlled: boolean;
  }> = [];

  for (let i = 0; i < view.tracks.length; i++) {
    const t = view.tracks[i];
    if (!t || t.state !== 'confirmed' || t.engagementStatus === 'engaged') continue;
    const simTrack = tracks.find((tr) => tr.trackId === t.trackId);
    if (!simTrack || simTrack.isGhost) continue;
    const actor = actors.find((a) => a.id === simTrack.actorId);
    if (!actor || actor.state !== 'active') continue;
    const threat = THREAT_LIBRARY[actor.classId];
    if (!threat || !threat.hostile) continue;

    const closingRate = t.closingRateMps ?? -20;
    const tti = closingRate < -0.1 ? t.rangeM / -closingRate : t.rangeM / 20;

    hostileTargets.push({
      trackId: t.trackId,
      rangeM: t.rangeM,
      timeToImpact: tti,
      rfControlled: threat.rfControlled,
    });
  }

  hostileTargets.sort((a, b) => a.timeToImpact - b.timeToImpact);

  let jammerBusy = view.effectors.jammer.busyUntilTick > view.tick;
  let gunBusy = view.effectors.gun.busyUntilTick > view.tick || view.effectors.gun.ammo <= 0;

  for (let i = 0; i < hostileTargets.length; i++) {
    const target = hostileTargets[i];
    if (!target) continue;

    // Prioritize jammer for RF controlled
    if (target.rfControlled) {
      if (!jammerBusy && target.rangeM <= 1500) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: target.trackId, effector: 'jammer' },
        });
        jammerBusy = true;
        continue;
      }
      // Only gun RF target if dangerously close (<= 550m) and jammer won't save it
      if (!gunBusy && target.rangeM <= 550 && target.timeToImpact < 2.5) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: target.trackId, effector: 'gun' },
        });
        gunBusy = true;
      }
    } else {
      // Non-RF (fiber): MUST use gun, fire inside high-Pk envelope (<= 750m)
      if (!gunBusy && target.rangeM <= 750) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: target.trackId, effector: 'gun' },
        });
        gunBusy = true;
      }
    }
  }

  return commands;
}

for (const tier of ['veteran', 'elite'] as Tier[]) {
  let passCount = 0;
  const scores: number[] = [];

  for (let s = 1; s <= 30; s++) {
    const seed = `solv-${tier}-${s}`;
    const e = new Engine(seed, `proc:v1:${tier}`);
    while (!e.missionState.ended && e.world.tick < 4800) {
      const cmds = smartOracleStep(e.getTraineeView(), e);
      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }
    const rep = scoreSession({
      actors: e.actors,
      tracks: e.tracks,
      events: e.getEvents(),
      assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
    });
    scores.push(rep.total);
    if (rep.total >= 90) passCount++;
  }
  const pct = ((passCount / 30) * 100).toFixed(1);
  const mean = (scores.reduce((a, b) => a + b, 0) / 30).toFixed(1);
  console.log(`Smart Oracle [${tier}]: >=90 runs = ${passCount}/30 (${pct}%), mean = ${mean}`);
}
