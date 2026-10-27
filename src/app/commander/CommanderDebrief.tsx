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
  command_dropped_offline: 'Command rejected because the target site comms link was offline',
  offline_asset_hit: 'Site suffered an asset impact while operating under offline comms',
  offline_ammo_exhausted: 'Offline site exhausted ammunition before reserve stock was retasked',
  offline_roe_too_tight: 'Restrictive ROE left set before link loss prevented defense while offline',
  offline_roe_too_free: 'Permissive ROE left set before link loss caused false engagements while offline',
};

const SUBSCORE_LABELS: Record<string, string> = {
  assetPreservation: 'Asset Preservation (45%)',
  costExchange: 'Cost Exchange (25%)',
  resourceManagement: 'Resource Management (10%)',
  commandDiscipline: 'Command Discipline (10%)',
  commsResilience: 'Comms Resilience (10%)',
};

export function CommanderDebrief({
  report,
  raid,
  log,
}: {
  report: RaidScoreReport;
  raid: RaidPlan;
  log: CommanderLog;
}): React.JSX.Element {
  const dropped = report.droppedCommands ?? [];

  return (
    <main className="commander-page commander-debrief">
      <header className="commander-heading">
        <p className="commander-kicker">
          VAJRA / COMMAND STAFF / RAID COMPLETE{' '}
          <span className="commander-meta-badge">AFTER-ACTION LEDGER</span>
        </p>
        <h1>
          {report.total} <small>/ 100</small>
        </h1>
        <strong className="commander-grade">{report.grade}</strong>
      </header>

      <section className="commander-score-grid">
        {Object.entries(report.subscores).map(([key, value], idx) => (
          <article
            className="commander-panel vj-card-cascade"
            key={key}
            style={{ '--card-index': idx } as React.CSSProperties}
          >
            <h2>{SUBSCORE_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1')}</h2>
            <strong>{value}</strong>
            <div className="commander-health">
              <i style={{ width: `${value}%` }} />
            </div>
          </article>
        ))}
      </section>

      <section
        className="commander-panel vj-card-cascade"
        style={{ '--card-index': 5 } as React.CSSProperties}
      >
        <h2>Cost-exchange ledger · {report.scoreVersion}</h2>
        <div className="commander-ledger">
          <span>
            Attacker cost destroyed <b>{report.costLedger.attackerDestroyed}</b>
          </span>
          <span>
            Damage prevented <b>{report.costLedger.preventedDamageUnits}</b>
          </span>
          <span>
            Defender spent <b>{report.costLedger.defenderSpent}</b>
          </span>
          <span>
            Gun / jammer / missile{' '}
            <b>
              {report.costLedger.defenderSpendByEffector.gun} /{' '}
              {report.costLedger.defenderSpendByEffector.jammer} /{' '}
              {report.costLedger.defenderSpendByEffector.missile}
            </b>
          </span>
          <span>
            CER <b>{report.costLedger.cer}</b>
          </span>
          <span>
            Comms Resilience <b>{report.subscores.commsResilience}</b>
          </span>
        </div>
        <p>
          Decision causes:{' '}
          {report.decisionCauses.map((cause) => CAUSE_LABELS[cause] ?? cause).join('; ') ||
            'none recorded'}
        </p>
        <p className="commander-dropped-narrative">
          Dropped commands (DDIL):{' '}
          {dropped.length > 0
            ? dropped
                .map((cmd) => `T+${cmd.tick} ${cmd.type} to ${cmd.siteId ?? 'site'} (${cmd.reason})`)
                .join('; ')
            : 'none — all dispatched commands reached online or degraded links'}
        </p>
      </section>

      <section
        className="commander-panel vj-card-cascade"
        style={{ '--card-index': 6 } as React.CSSProperties}
      >
        <h2>Site summaries</h2>
        {report.sites.map((site) => (
          <details key={site.siteId}>
            <summary>
              {raid.sites.find((s) => s.id === site.siteId)?.name ?? site.siteId} ·{' '}
              {site.damagePercent}% damage · {site.attackerCostDestroyed} destroyed
            </summary>
            <p>
              Contact score {site.scoreSessionV2.total} · Grade {site.scoreSessionV2.grade}
            </p>
            <p>
              Detection {site.scoreSessionV2.subscores.detection} · Classification{' '}
              {site.scoreSessionV2.subscores.classification} · Engagement{' '}
              {site.scoreSessionV2.subscores.engagement} · Discipline{' '}
              {site.scoreSessionV2.subscores.discipline}
            </p>
            <p>
              Penalties:{' '}
              {site.scoreSessionV2.penalties
                .map((penalty) => `${penalty.reason} (${penalty.points})`)
                .join('; ') || 'none'}
            </p>
            <p>
              Causes: {site.causes.map((cause) => CAUSE_LABELS[cause] ?? cause).join('; ') || 'none'}
            </p>
          </details>
        ))}
      </section>

      <section
        className="commander-panel vj-card-cascade"
        style={{ '--card-index': 7 } as React.CSSProperties}
      >
        <h2>Commander command timeline</h2>
        {log.commands.map((command, i) => (
          <p key={`${command.tick}-${i}`}>
            T+{command.tick}: {command.type} {command.siteId ?? JSON.stringify(command.payload)}
            {command.rejected
              ? ` [DROPPED: ${command.reason ?? 'Link offline'}]`
              : command.deliveryTick !== undefined &&
                command.deliveryTick !== null &&
                command.deliveryTick > command.tick
              ? ` [Delivered T+${command.deliveryTick}]`
              : ''}
          </p>
        ))}
      </section>
    </main>
  );
}
