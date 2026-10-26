import React from 'react';
import { RaidScoreReport, CommanderLog, RaidPlan } from '../../sim/index.js';

const CAUSE_LABELS: Record<string, string> = {
  misallocated_inventory: 'Inventory was left at a safer site while this site needed it',
  missile_overuse: 'Missiles were used at a high cost relative to the result',
  roe_too_free: 'A permissive engagement posture led to a non-hostile engagement',
  roe_too_tight: 'A restrictive engagement posture delayed a response',
  main_effort_undefended: 'The main-effort site had no allocated inventory',
  reserve_unused: 'Reserve inventory remained unused after an asset impact',
  late_retask: 'A reserve transfer arrived after an asset impact',
};

export function CommanderDebrief({ report, raid, log }: { report: RaidScoreReport; raid: RaidPlan; log: CommanderLog }): React.JSX.Element {
  return <main className="commander-page commander-debrief"><header className="commander-heading"><p>VAJRA / COMMAND STAFF / RAID COMPLETE</p><h1>{report.total} <small>/ 100</small></h1><strong className="commander-grade">{report.grade}</strong></header>
    <section className="commander-score-grid">{Object.entries(report.subscores).map(([key, value]) => <article className="commander-panel" key={key}><h2>{key.replace(/([A-Z])/g,' $1')}</h2><strong>{value}</strong><div className="commander-health"><i style={{width:`${value}%`}} /></div></article>)}</section>
    <section className="commander-panel"><h2>Cost-exchange ledger · {report.scoreVersion}</h2><div className="commander-ledger"><span>Attacker cost destroyed <b>{report.costLedger.attackerDestroyed}</b></span><span>Damage prevented <b>{report.costLedger.preventedDamageUnits}</b></span><span>Defender spent <b>{report.costLedger.defenderSpent}</b></span><span>Gun / jammer / missile <b>{report.costLedger.defenderSpendByEffector.gun} / {report.costLedger.defenderSpendByEffector.jammer} / {report.costLedger.defenderSpendByEffector.missile}</b></span><span>CER <b>{report.costLedger.cer}</b></span></div><p>Decision causes: {report.decisionCauses.map((cause) => CAUSE_LABELS[cause] ?? cause).join('; ') || 'none recorded'}</p></section>
    <section className="commander-panel"><h2>Site summaries</h2>{report.sites.map((site) => <details key={site.siteId}><summary>{raid.sites.find((s) => s.id === site.siteId)?.name ?? site.siteId} · {site.damagePercent}% damage · {site.attackerCostDestroyed} destroyed</summary><p>Contact score {site.scoreSessionV2.total} · Detection {site.scoreSessionV2.subscores.detection} · Classification {site.scoreSessionV2.subscores.classification} · Causes {site.causes.map((cause) => CAUSE_LABELS[cause] ?? cause).join('; ') || 'none'}</p></details>)}</section>
    <section className="commander-panel"><h2>Commander command timeline</h2>{log.commands.map((command, i) => <p key={`${command.tick}-${i}`}>T+{command.tick}: {command.type} {command.siteId ?? JSON.stringify(command.payload)}</p>)}</section>
  </main>;
}
