import { writeFileSync } from 'node:fs';
import { CommanderSession, generateRaid, heuristicCommander, scoreRaid } from '../src/sim/index.js';

const raid = generateRaid('commander-demo-s1', 'operator');
const session = new CommanderSession(raid);
while (!session.isComplete() && session.tick < 4200) session.step(heuristicCommander(session.view()));
const report = scoreRaid(session);
const siteRuns = raid.sites.map((site) => {
  const engine = session.engineForReport(site.id)!;
  return {
    siteId: site.id,
    actorStates: engine.actors.map((actor) => ({ classId: actor.classId, state: actor.state })),
    engagementEvents: engine.getEvents().filter((event) => event.type === 'ENGAGEMENT_STARTED'),
    assetHits: engine.getEvents().filter((event) => event.type === 'ASSET_HIT').length,
  };
});
const output = { raid, commanderLog: session.getSessionLog(), score: report, siteRuns };
writeFileSync('docs/benchmarks/commander-demo-operator-s1.json', `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote docs/benchmarks/commander-demo-operator-s1.json`);
console.log(JSON.stringify({ tick: session.tick, complete: session.isComplete(), total: report.total, grade: report.grade, subscores: report.subscores, costLedger: report.costLedger, siteRuns }, null, 2));
