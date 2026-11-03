import React, { useState } from 'react';
import { RaidScoreReport, CommanderLog, RaidPlan, SessionLog } from '../../sim/index.js';
import { SessionReplay, summarizeContactAction, formatClassLabel } from '../aar/SessionReplay.js';
import { CommanderSplitTitle } from './CommanderPage.js';

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
  costExchange: 'Avoidable Cost (25%)',
  resourceManagement: 'Resource Management (10%)',
  commandDiscipline: 'Command Discipline (10%)',
  commsResilience: 'Comms Resilience (10%)',
};

export function CommanderDebrief({
  report,
  raid,
  log,
  siteSessionLogs,
  onRestart,
}: {
  report: RaidScoreReport;
  raid: RaidPlan;
  log: CommanderLog;
  siteSessionLogs?: Record<string, SessionLog>;
  onRestart?: () => void;
}): React.JSX.Element {
  const [showSessionReplay, setShowSessionReplay] = useState(false);
  const [selectedReplaySite, setSelectedReplaySite] = useState<string>(raid.sites[0]?.id ?? 'S1');

  const dropped = report.droppedCommands ?? [];
  const gradeKey = (report.grade || 'unsatisfactory').toLowerCase();

  const totalDestroyed = report.sites.reduce((acc, s) => acc + s.attackerCostDestroyed, 0);
  const avgDamage = Math.round(report.sites.reduce((acc, s) => acc + s.damagePercent, 0) / Math.max(1, report.sites.length));

  const activeSiteReport = report.sites.find((s) => s.siteId === selectedReplaySite) ?? report.sites[0];
  const activeSiteLog = siteSessionLogs?.[selectedReplaySite];

  return (
    <main className="commander-page commander-debrief">
      {/* Editorial Tactical Debrief Header */}
      <header className="commander-heading debrief-hero-heading">
        <div className="commander-heading-left">
          <p className="commander-kicker">
            VAJRA <span className="kicker-sep">/</span> COMMAND STAFF <span className="kicker-sep">/</span> RAID COMPLETE{' '}
            <span className="commander-meta-badge">AFTER-ACTION LEDGER</span>
          </p>
          <h1 aria-label="After action review">
            <CommanderSplitTitle text="After Action Review" />
          </h1>
          <p className="commander-subtitle">
            Tactical air defense audit // Deterministic doctrine evaluation &amp; cost-exchange analysis.
          </p>
        </div>
        <div className="debrief-score-hero">
          <div className="debrief-hero-meter">
            <span className="debrief-hero-num">{report.total}</span>
            <span className="debrief-hero-denom">/ 100</span>
          </div>
          <div className={`debrief-grade-badge grade-${gradeKey}`}>
            <span className="grade-icon">★</span>
            <strong className="commander-grade">{report.grade.toUpperCase()}</strong>
          </div>
        </div>
      </header>

      {/* Meta Telemetry Ribbon */}
      <div className="debrief-meta-ribbon">
        <div className="meta-ribbon-item">
          <span>THEATRE SECTOR SEED</span>
          <b>{raid.id}</b>
        </div>
        <div className="meta-ribbon-sep" />
        <div className="meta-ribbon-item">
          <span>DEFENDED SITES</span>
          <b>{raid.sites.length} SECTORS</b>
        </div>
        <div className="meta-ribbon-sep" />
        <div className="meta-ribbon-item">
          <span>ATTACKER DRONES DESTROYED</span>
          <b className="stat-green">{totalDestroyed} TARGETS</b>
        </div>
        <div className="meta-ribbon-sep" />
        <div className="meta-ribbon-item">
          <span>AVERAGE SECTOR DAMAGE</span>
          <b className={avgDamage === 0 ? 'stat-green' : 'stat-amber'}>{avgDamage}%</b>
        </div>
        <div className="meta-ribbon-sep" />
        <div className="meta-ribbon-item">
          <span>EVALUATION ENGINE</span>
          <b>20Hz DETERMINISTIC DOCTRINE V2</b>
        </div>
      </div>

      {/* Flight Review Toggle Bar */}
      <div className="debrief-replay-bar">
        <button
          type="button"
          className="debrief-replay-btn"
          onClick={() => setShowSessionReplay((v) => !v)}
        >
          {showSessionReplay ? '✕ CLOSE FLIGHT REVIEW' : '▶ OPEN SYNCHRONIZED FLIGHT REVIEW'}
        </button>
        <span className="debrief-replay-hint">
          {showSessionReplay
            ? `INSPECTING AIRSPACE RECONSTRUCTION // SECTOR ${selectedReplaySite} (GROUND TRUTH VS RADAR SCOPE)`
            : 'RECONSTRUCT 20HZ DETERMINISTIC FLIGHT PATHS & MULTI-TARGET SENSOR INTERCEPTS'}
        </span>
      </div>

      {/* Synchronized Flight Review Panel (if open) */}
      {showSessionReplay && activeSiteLog && activeSiteReport && (
        <section className="commander-panel commander-flight-review-panel" aria-label="Synchronized flight review">
          <div className="flight-review-header">
            <div className="flight-review-title-wrap">
              <span className="flight-review-stripe" aria-hidden="true" />
              <div>
                <h2>SYNCHRONIZED AIRSPACE RECONSTRUCTION // SECTOR {selectedReplaySite}</h2>
                <p className="flight-review-sub">Ground Truth vs Trainee Radar Scope · Multi-Target Kinematic Replay</p>
              </div>
            </div>

            {/* Sector Selector Tabs */}
            <div className="commander-replay-sector-tabs" role="tablist" aria-label="Select sector to review">
              {raid.sites.map((s) => {
                const sReport = report.sites.find((r) => r.siteId === s.id);
                const hasDmg = (sReport?.damagePercent ?? 0) > 0;
                const isSelected = selectedReplaySite === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`replay-sector-tab ${isSelected ? 'is-active' : ''} ${hasDmg ? 'has-damage' : 'is-clean'}`}
                    onClick={() => setSelectedReplaySite(s.id)}
                  >
                    <span className="sector-tab-dot">{hasDmg ? '▲' : '●'}</span>
                    <span className="sector-tab-id">{s.id}</span>
                    <span className="sector-tab-name">{s.name.replace('Training Site ', 'SECTOR ')}</span>
                    <span className="sector-tab-val">{s.valueUnits}V</span>
                    <span className={`sector-tab-badge ${hasDmg ? 'badge-dmg' : 'badge-ok'}`}>
                      {sReport?.damagePercent ?? 0}% DMG
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="commander-replay-body">
            <SessionReplay
              sessionLog={activeSiteLog}
              report={activeSiteReport.scoreSessionV2}
              title={`SECTOR ${selectedReplaySite} // AIRSPACE RECONSTRUCTION`}
            />
          </div>
        </section>
      )}

      {/* 5-Dimension Doctrine Scoring Matrix */}
      <section className="commander-score-grid" aria-label="Tactical evaluation subscores">
        {Object.entries(report.subscores).map(([key, value], idx) => {
          const isFull = value >= 95;
          const isMedium = value >= 70 && value < 95;
          return (
            <article
              className={`commander-panel debrief-subscore-card vj-card-cascade ${isFull ? 'score-high' : isMedium ? 'score-mid' : 'score-low'}`}
              key={key}
              style={{ '--card-index': idx } as React.CSSProperties}
            >
              <div className="subscore-card-top">
                <h2>{SUBSCORE_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1')}</h2>
                <span className="subscore-weight-badge">
                  {key === 'assetPreservation' ? '45%' : key === 'costExchange' ? '25%' : '10%'}
                </span>
              </div>
              <div className="subscore-val-row">
                <strong className="subscore-number">{value}</strong>
                <span className="subscore-scale">/ 100</span>
              </div>
              <div className="commander-health debrief-meter">
                <i style={{ width: `${value}%` }} />
              </div>
              <div className="subscore-status-tag">
                {value >= 90 ? '● OPTIMAL RETENTION' : value >= 70 ? '◐ ACCEPTABLE DISCIPLINE' : '▲ DOCTRINE ATTRITION'}
              </div>
            </article>
          );
        })}
      </section>

      {/* Cost-Exchange Economic Ledger */}
      <section
        className="commander-panel debrief-ledger-panel vj-card-cascade"
        style={{ '--card-index': 5 } as React.CSSProperties}
      >
        <div className="debrief-panel-header">
          <div className="panel-title-wrap">
            <span className="panel-stripe" aria-hidden="true" />
            <h2>Cost-exchange ledger · {report.scoreVersion}</h2>
          </div>
          <span className="panel-meta-tag">ECONOMIC ASYMMETRY ANALYSIS</span>
        </div>

        <div className="commander-ledger debrief-ledger-grid">
          <div className="ledger-card-item">
            <small>ATTACKER VALUE NEUTRALIZED</small>
            <span>
              Attacker cost destroyed <b>{report.costLedger.attackerDestroyed}</b>
            </span>
          </div>
          <div className="ledger-card-item">
            <small>INFRASTRUCTURE PRESERVED</small>
            <span>
              Damage prevented <b>{report.costLedger.preventedDamageUnits}</b>
            </span>
          </div>
          <div className="ledger-card-item">
            <small>DEFENDER MUNITIONS EXPENDED</small>
            <span>
              Defender spent <b>{report.costLedger.defenderSpent}</b>
            </span>
          </div>
          <div className="ledger-card-item">
            <small>WASTED / OVERKILL EXPENDITURE</small>
            <span>
              Avoidable missile spend <b>{report.costLedger.avoidableSpend ?? 0}</b>
            </span>
          </div>
          <div className="ledger-card-item">
            <small>EFFECTOR DISCHARGE RATIO</small>
            <span>
              Gun / jammer / missile{' '}
              <b>
                {report.costLedger.defenderSpendByEffector.gun} /{' '}
                {report.costLedger.defenderSpendByEffector.jammer} /{' '}
                {report.costLedger.defenderSpendByEffector.missile}
              </b>
            </span>
          </div>
          <div className="ledger-card-item highlight-cer">
            <small>COST-EXCHANGE RATIO</small>
            <span>
              Cost-exchange ratio (CER, info) <b>{report.costLedger.cer}</b>
            </span>
          </div>
          <div className="ledger-card-item highlight-comms">
            <small>NETWORK DDIL RESILIENCE</small>
            <span>
              Comms Resilience <b>{report.subscores.commsResilience}</b>
            </span>
          </div>
        </div>

        {/* Doctrine Decision Causes Analysis */}
        <div className="debrief-causes-block">
          <div className="causes-title">
            <span>DOCTRINE DECISION CAUSES</span>
          </div>
          <div className="causes-content">
            <p>
              Decision causes:{' '}
              {report.decisionCauses.map((cause) => CAUSE_LABELS[cause] ?? cause).join('; ') ||
                'none recorded — zero doctrine anomalies or misallocations'}
            </p>
          </div>
        </div>

        {/* DDIL Comms Degradation & Dropped Commands */}
        <div className="debrief-dropped-block">
          <div className="dropped-title">
            <span>RADIO LINK RESILIENCE &amp; DDIL LOG</span>
          </div>
          <p className="commander-dropped-narrative">
            Dropped commands (DDIL):{' '}
            {dropped.length > 0
              ? dropped
                  .map((cmd) => `T+${cmd.tick} ${cmd.type} to ${cmd.siteId ?? 'site'} (${cmd.reason})`)
                  .join('; ')
              : 'none — all dispatched commands reached online or degraded links'}
          </p>
        </div>
      </section>

      {/* Sector Outpost Performance Summaries */}
      <section
        className="commander-panel debrief-sites-panel vj-card-cascade"
        style={{ '--card-index': 6 } as React.CSSProperties}
      >
        <div className="debrief-panel-header">
          <div className="panel-title-wrap">
            <span className="panel-stripe" aria-hidden="true" />
            <h2>Site summaries</h2>
          </div>
          <span className="panel-meta-tag">{report.sites.length} SECTORS AUDITED</span>
        </div>

        <div className="debrief-sites-grid">
          {report.sites.map((site) => {
            const sitePlan = raid.sites.find((s) => s.id === site.siteId);
            const siteName = sitePlan?.name ?? site.siteId;
            const isUndamaged = site.damagePercent === 0;

            return (
              <details className="debrief-site-card" key={site.siteId} open>
                <summary className="debrief-site-summary-bar">
                  <div className="site-summary-left">
                    <span className="site-summary-bullet">◆</span>
                    <b>{siteName}</b>
                    <span className="site-summary-val">{sitePlan?.valueUnits ?? 100} ASSET VALUE</span>
                  </div>
                  <div className="site-summary-right">
                    <span className={`site-dmg-badge ${isUndamaged ? 'dmg-clean' : 'dmg-hit'}`}>
                      {site.damagePercent}% damage
                    </span>
                    <span className="site-kill-badge">
                      {site.attackerCostDestroyed} destroyed
                    </span>
                  </div>
                </summary>

                <div className="debrief-site-body">
                  <div className="site-score-banner">
                    <span>SECTOR CONTACT SCORE:</span>
                    <strong>{site.scoreSessionV2.total} / 100</strong>
                    <span className={`site-grade-pill grade-${(site.scoreSessionV2.grade || 'proficient').toLowerCase()}`}>
                      GRADE: {site.scoreSessionV2.grade}
                    </span>
                  </div>

                  <div className="site-metrics-grid">
                    <div className="site-metric-cell">
                      <small>DETECTION</small>
                      <b>{site.scoreSessionV2.subscores.detection}%</b>
                      <div className="mini-meter"><i style={{ width: `${site.scoreSessionV2.subscores.detection}%` }} /></div>
                    </div>
                    <div className="site-metric-cell">
                      <small>CLASSIFICATION</small>
                      <b>{site.scoreSessionV2.subscores.classification}%</b>
                      <div className="mini-meter"><i style={{ width: `${site.scoreSessionV2.subscores.classification}%` }} /></div>
                    </div>
                    <div className="site-metric-cell">
                      <small>ENGAGEMENT</small>
                      <b>{site.scoreSessionV2.subscores.engagement}%</b>
                      <div className="mini-meter"><i style={{ width: `${site.scoreSessionV2.subscores.engagement}%` }} /></div>
                    </div>
                    <div className="site-metric-cell">
                      <small>DISCIPLINE</small>
                      <b>{site.scoreSessionV2.subscores.discipline}%</b>
                      <div className="mini-meter"><i style={{ width: `${site.scoreSessionV2.subscores.discipline}%` }} /></div>
                    </div>
                  </div>

                  <div className="site-notes-row">
                    <div className="site-note-item">
                      <span>PENALTIES:</span>
                      <p>
                        Penalties:{' '}
                        {site.scoreSessionV2.penalties
                          .map((penalty) => `${penalty.reason} (${penalty.points})`)
                          .join('; ') || 'none'}
                      </p>
                    </div>
                    <div className="site-note-item">
                      <span>CAUSES:</span>
                      <p>
                        Causes: {site.causes.map((cause) => CAUSE_LABELS[cause] ?? cause).join('; ') || 'none'}
                      </p>
                    </div>
                  </div>

                  {site.scoreSessionV2.perContact.length > 0 && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '8px 10px',
                        background: 'rgba(24, 23, 22, 0.035)',
                        border: '1px solid rgba(45, 40, 35, 0.14)',
                        borderRadius: '5px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          letterSpacing: '0.08em',
                          color: '#58544e',
                          marginBottom: '6px',
                        }}
                      >
                        SITE ACTION BY CONTACT (THREAT VS DECOY / NEUTRAL):
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {site.scoreSessionV2.perContact.map((contact) => {
                          const summary = summarizeContactAction({
                            actorId: contact.actorId,
                            classId: contact.classId,
                            reportContact: contact,
                          });
                          const statusBadgeColor =
                            summary.finalState === 'neutralized'
                              ? '#15803d'
                              : summary.finalState === 'impacted'
                                ? '#b91c1c'
                                : '#475569';
                          const toneColor =
                            summary.tone === 'good'
                              ? '#166534'
                              : summary.tone === 'warn'
                                ? '#92400e'
                                : '#991b1b';

                          return (
                            <div
                              key={contact.actorId}
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                padding: '4px 6px',
                                background: '#ffffff',
                                borderRadius: '3px',
                                borderLeft: `3px solid ${toneColor}`,
                              }}
                            >
                              <strong style={{ color: '#181716', minWidth: '155px' }}>
                                T{contact.actorId} · {formatClassLabel(contact.classId)}
                              </strong>
                              <span
                                style={{
                                  fontSize: '8.5px',
                                  fontWeight: 800,
                                  color: statusBadgeColor,
                                  background: 'rgba(0,0,0,0.04)',
                                  padding: '1px 5px',
                                  borderRadius: '2px',
                                }}
                              >
                                {summary.finalState.replace('_', ' ').toUpperCase()}
                              </span>
                              <span style={{ fontWeight: 800, color: toneColor }}>
                                [{summary.actionShort}]
                              </span>
                              <span style={{ color: '#3f3b36' }}>{summary.explanation}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="site-action-row">
                    <button
                      type="button"
                      className="site-replay-btn"
                      onClick={() => {
                        setSelectedReplaySite(site.siteId);
                        setShowSessionReplay(true);
                        const target = document.querySelector('.commander-flight-review-panel') || document.querySelector('.debrief-replay-bar');
                        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      ▶ REPLAY SECTOR {site.siteId} FLIGHT REVIEW
                    </button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* Commander Command Dispatch Timeline */}
      <section
        className="commander-panel debrief-timeline-panel vj-card-cascade"
        style={{ '--card-index': 7 } as React.CSSProperties}
      >
        <div className="debrief-panel-header">
          <div className="panel-title-wrap">
            <span className="panel-stripe" aria-hidden="true" />
            <h2>Commander command timeline</h2>
          </div>
          <span className="panel-meta-tag">{log.commands.length} DIRECTIVES ISSUED</span>
        </div>

        <div className="debrief-timeline-list">
          {log.commands.length === 0 ? (
            <p className="timeline-empty">No dynamic commands were dispatched during this mission engagement.</p>
          ) : (
            log.commands.map((command, i) => (
              <div className="debrief-timeline-row" key={`${command.tick}-${i}`}>
                <span className="timeline-tick">T+{String(Math.floor(command.tick / 1200)).padStart(2, '0')}:{String(Math.floor((command.tick % 1200) / 20)).padStart(2, '0')}</span>
                <span className="timeline-cmd">
                  T+{command.tick}: {command.type} {command.siteId ?? JSON.stringify(command.payload)}
                </span>
                <span className="timeline-status">
                  {command.rejected
                    ? ` [DROPPED: ${command.reason ?? 'Link offline'}]`
                    : command.deliveryTick !== undefined &&
                      command.deliveryTick !== null &&
                      command.deliveryTick > command.tick
                    ? ` [Delivered T+${command.deliveryTick}]`
                    : ' [Instantaneous]'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Interactive Action Controls */}
      <div className="debrief-actions-bar">
        {onRestart && (
          <button type="button" className="debrief-btn-primary" onClick={onRestart}>
            ↺ RE-LAUNCH THEATRE PLANNING
          </button>
        )}
        <a className="debrief-btn-secondary" href="#/">
          RETURN TO TRAINEE CONSOLE ↗
        </a>
      </div>
    </main>
  );
}
