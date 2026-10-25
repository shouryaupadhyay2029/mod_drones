import React, { useEffect, useMemo, useState } from 'react';
import { ConfusionMatrixChart, Heatmap, LineChart, LineSeries } from './AarCharts.js';
import {
  AarMetric,
  confusionMatrix,
  skillMatrix,
  trendSeries,
  unitSessionsCsv,
  unitReadiness,
} from './analytics.js';
import { LocalDataControls } from '../storage/LocalDataControls.js';
import { SessionRecord, TraineeRecord, UnitRecord, listSessions, listTrainees, listUnits } from '../storage/db.js';
import { writePendingFork } from './forkLaunch.js';
import { CompareResults } from './CompareResults.js';
import './aar.css';
import { SessionReplay } from './SessionReplay.js';

type AarRoute =
  | { page: 'roster'; unitFilter: string }
  | { page: 'trainee'; id: string }
  | { page: 'unit'; id: string }
  | { page: 'session'; id: string }
  | { page: 'compare'; parentId: string; forkId: string };

function routeFromHash(hash: string): AarRoute {
  const [pathname, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = (pathname ?? '').split('/').filter(Boolean);
  if (parts[1] === 'trainee' && parts[2]) return { page: 'trainee', id: decodeURIComponent(parts[2]) };
  if (parts[1] === 'unit' && parts[2]) return { page: 'unit', id: decodeURIComponent(parts[2]) };
  if (parts[1] === 'session' && parts[2]) return { page: 'session', id: decodeURIComponent(parts[2]) };
  if (parts[1] === 'compare' && parts[2] && parts[3]) return { page: 'compare', parentId: decodeURIComponent(parts[2]), forkId: decodeURIComponent(parts[3]) };
  return { page: 'roster', unitFilter: new URLSearchParams(query).get('unit') ?? '' };
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(tick: number): string {
  const seconds = Math.floor(tick / 20);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatClass(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function launchFork(session: SessionRecord, tick: number): void {
  writePendingFork({
    parentId: session.id,
    parentLabel: `${formatClass(session.scenarioKey)} · ${session.seed}`,
    traineeId: session.traineeId,
    unitId: session.unitId,
    tick,
    sessionLog: session.sessionLog,
  });
  window.location.hash = '#/fork';
}

function shellHeader(label: string, subtitle: string): React.JSX.Element {
  return <>
    <header className="aar-topline">
      <a className="aar-brand" href="#/" aria-label="Return to VAJRA console">
        <img src="/vajra-emblem.png" alt="" /> VAJRA <span className="aar-muted">/</span> AAR
      </a>
      <a className="aar-back-link" href="#/">RETURN TO CONSOLE ↗</a>
    </header>
    <p className="aar-kicker">TRAINING ANALYTICS / LOCAL RECORDS</p>
    <h1 className="aar-title">{label}</h1>
    <p className="aar-subtitle">{subtitle}</p>
  </>;
}

function CsvDownload({ sessions, trainees }: { sessions: SessionRecord[]; trainees: TraineeRecord[] }): React.JSX.Element {
  const download = () => {
    const csv = unitSessionsCsv(sessions, trainees);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'vajra-unit-sessions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <button className="aar-action-link" type="button" onClick={download}>EXPORT CSV ↓</button>;
}

export function AarPage(): React.JSX.Element {
  const [hash, setHash] = useState(window.location.hash || '#/aar');
  const [trainees, setTrainees] = useState<TraineeRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'score' | 'callsign' | 'participation'>('score');
  const route = useMemo(() => routeFromHash(hash), [hash]);

  useEffect(() => {
    const handleHash = () => setHash(window.location.hash || '#/aar');
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [nextTrainees, nextUnits, nextSessions] = await Promise.all([listTrainees(), listUnits(), listSessions()]);
        if (!active) return;
        setTrainees(nextTrainees);
        setUnits(nextUnits);
        setSessions(nextSessions);
      } catch (error) {
        console.error('[AAR] Failed to load local records:', error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const refresh = () => void load();
    window.addEventListener('vajra:data-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('vajra:data-changed', refresh);
    };
  }, []);

  const renderRoster = (unitFilter: string) => {
    const visibleTrainees = trainees.filter((trainee) => !unitFilter || trainee.unitId === unitFilter);
    const allVisibleSessions = sessions.filter((session) => !unitFilter || session.unitId === unitFilter);
    const visibleSessions = allVisibleSessions.filter((session) => !session.isFork);
    const average = visibleSessions.length
      ? visibleSessions.reduce((sum, session) => sum + session.summary.total, 0) / visibleSessions.length
      : 0;
    const unit = units.find((item) => item.id === unitFilter);
    return <>
      {shellHeader('After action review', 'A local record of training performance, skill trends, and unit readiness.')}
      <div className="aar-toolbar">
        <label className="aar-filter">FILTER UNIT
          <select value={unitFilter} onChange={(event) => { window.location.hash = event.target.value ? `#/aar?unit=${encodeURIComponent(event.target.value)}` : '#/aar'; }}>
            <option value="">All units</option>
            {units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {unit && <a className="aar-action-link" href={`#/aar/unit/${encodeURIComponent(unit.id)}`}>OPEN UNIT READINESS ↗</a>}
      </div>
      <div className="aar-grid aar-grid-kpis">
        <Kpi label="Trainees" value={visibleTrainees.length} note="Local roster" />
        <Kpi label="Sessions" value={visibleSessions.length} note="Saved on this device" />
        <Kpi label="What-if practice" value={allVisibleSessions.filter((session) => session.isFork).length} note="Separate from training record" />
        <Kpi label="Mean score" value={`${average.toFixed(1)}%`} note="Selected roster" />
        <Kpi label="Units" value={unitFilter ? 1 : units.length} note="Training groups" />
      </div>
      <section className="aar-card">
        <div className="aar-card-heading"><h2>Trainee roster</h2><span className="aar-muted">Select a callsign to inspect performance</span></div>
        {visibleTrainees.length === 0 ? <p className="aar-empty">{loading ? 'Loading local roster…' : 'No trainees are stored yet. Start a mission as Guest to create the local training profile.'}</p> :
          <div className="aar-roster-list">{visibleTrainees.map((trainee) => {
            const traineeSessions = sessions.filter((session) => !session.isFork && session.traineeId === trainee.id);
            const latest = traineeSessions[0];
            const unitName = units.find((item) => item.id === trainee.unitId)?.name ?? 'No unit';
            const recentAverage = traineeSessions.slice(0, 5).reduce((sum, session) => sum + session.summary.total, 0) / Math.max(1, Math.min(5, traineeSessions.length));
            return <a key={trainee.id} className="aar-roster-row" href={`#/aar/trainee/${encodeURIComponent(trainee.id)}`}>
              <span className="aar-roster-name">{trainee.callsign}</span><span className="aar-muted">{unitName}</span>
              <span className="aar-number"><strong>{recentAverage.toFixed(1)}%</strong><small className="aar-muted"> · last 5</small></span>
              <span className="aar-number"><strong>{traineeSessions.length}</strong><small className="aar-muted"> · sessions</small></span>
              {latest && <span className="aar-muted">Latest: {formatDate(latest.startedAt)}</span>}
            </a>;
          })}</div>}
      </section>
      <section className="aar-card" style={{ marginTop: 14 }}><LocalDataControls /></section>
    </>;
  };

  const renderTrainee = (traineeId: string) => {
    const trainee = trainees.find((item) => item.id === traineeId);
    if (!trainee) return <NotFound />;
    const traineeAllSessions = sessions.filter((session) => session.traineeId === trainee.id);
    const traineeSessions = traineeAllSessions.filter((session) => !session.isFork);
    const matrix = skillMatrix(traineeSessions, 10);
    const metricColors: Array<[AarMetric, string, string]> = [
      ['total', 'Total', '#a54c2d'], ['detection', 'Detection', '#526f0f'], ['classification', 'Classification', '#6b518c'],
      ['engagement', 'Engagement', '#2d6b75'], ['discipline', 'Discipline', '#a86208'],
    ];
    const lines: LineSeries[] = metricColors.map(([metric, label, color]) => ({ label, color, points: trendSeries(traineeSessions, metric, 20) }));
    return <>
      {shellHeader(trainee.callsign, 'Trainee performance record and stored after action reviews.')}
      <div className="aar-toolbar"><span className="aar-muted">UNIT: {units.find((unit) => unit.id === trainee.unitId)?.name ?? 'Unassigned'}</span><a className="aar-action-link" href={`#/aar/unit/${encodeURIComponent(trainee.unitId)}`}>VIEW UNIT READINESS ↗</a></div>
      <div className="aar-grid aar-grid-kpis">
        <Kpi label="Sessions" value={traineeSessions.length} note="All saved sessions" />
        <Kpi label="What-if practice" value={traineeAllSessions.filter((session) => session.isFork).length} note="Ignored by analytics" />
        <Kpi label="Latest score" value={traineeSessions[0] ? `${traineeSessions[0].summary.total}%` : '—'} note={traineeSessions[0] ? traineeSessions[0].summary.grade : 'No sessions'} />
        <Kpi label="Hostiles resolved" value={traineeSessions.reduce((sum, session) => sum + session.summary.hostilesNeutralised, 0)} note="Across saved sessions" />
        <Kpi label="Asset hits" value={traineeSessions.filter((session) => session.summary.assetHit).length} note="Review each mission record" />
      </div>
      {traineeSessions.length === 0 ? <p className="aar-empty">No sessions have been saved for this trainee.</p> : <>
        <LineChart title="Performance trend · last 20 sessions" series={lines} />
        <div className="aar-grid aar-grid-two" style={{ marginTop: 14 }}>
          <Heatmap title="Skill heat map · last 10 sessions" matrix={matrix} />
          <ConfusionMatrixChart data={confusionMatrix(traineeSessions)} />
        </div>
        <SessionTable sessions={traineeAllSessions} />
      </>}
    </>;
  };

  const renderUnit = (unitId: string) => {
    const unit = units.find((item) => item.id === unitId);
    if (!unit) return <NotFound />;
    const readiness = unitReadiness(trainees, sessions, unit.id, Date.now());
    const unitTrainees = trainees.filter((trainee) => trainee.unitId === unit.id);
    const unitAllSessions = sessions.filter((session) => session.unitId === unit.id);
    const unitSessions = unitAllSessions.filter((session) => !session.isFork);
    const rows = [...readiness.trainees];
    rows.sort((a, b) => sortBy === 'callsign'
      ? a.callsign.localeCompare(b.callsign)
      : sortBy === 'participation'
        ? b.participation7Days - a.participation7Days
        : b.meanLastFive - a.meanLastFive);
    const matrix = skillMatrix(unitSessions, unitSessions.length);
    return <>
      {shellHeader(unit.name, 'Readiness and participation across this unit’s local training records.')}
      <div className="aar-grid aar-grid-kpis">
        <Kpi label="Unit mean" value={`${readiness.mean.toFixed(1)}%`} note="Mean of each trainee’s last 5" />
        <Kpi label="At or above 70" value={`${readiness.traineesAbove70Pct.toFixed(1)}%`} note="Trainees with saved sessions" />
        <Kpi label="7-day participation" value={readiness.participation7Days} note="Sessions in the last 7 days" />
        <Kpi label="What-if practice" value={unitAllSessions.filter((session) => session.isFork).length} note="Not part of readiness" />
        <Kpi label="Weakest skill" value={formatClass(readiness.weakestSkill)} note="Across recent unit sessions" />
      </div>
      <div className="aar-grid aar-grid-two">
        <section className="aar-card">
          <div className="aar-card-heading"><h2>Trainee comparison</h2><CsvDownload sessions={unitSessions} trainees={unitTrainees} /></div>
          <div className="aar-table-wrap"><table className="aar-table"><thead><tr>
            <th><button type="button" onClick={() => setSortBy('callsign')}>Callsign ↕</button></th>
            <th><button type="button" onClick={() => setSortBy('score')}>Last 5 mean ↕</button></th>
            <th><button type="button" onClick={() => setSortBy('participation')}>7-day sessions ↕</button></th><th>Flag</th>
          </tr></thead><tbody>{rows.map((row) => <tr key={row.traineeId}>
            <td><a className="aar-action-link" href={`#/aar/trainee/${encodeURIComponent(row.traineeId)}`}>{row.callsign}</a></td>
            <td>{row.sessionsUsed ? `${row.meanLastFive.toFixed(1)}%` : '—'}</td><td>{row.participation7Days}</td><td>{row.outlier && <span className="aar-alert">REVIEW</span>}</td>
          </tr>)}</tbody></table></div>
          {rows.length === 0 && <p className="aar-empty">No trainees are assigned to this unit.</p>}
        </section>
        <Heatmap title="Weakest-skill overview" matrix={matrix} />
      </div>
      <section className="aar-card" style={{ marginTop: 14 }}><div className="aar-card-heading"><h2>Recent sessions</h2><span className="aar-muted">{unitSessions.length} scored · {unitAllSessions.filter((session) => session.isFork).length} what-if</span></div><SessionTable sessions={unitAllSessions.slice(0, 40)} /></section>
    </>;
  };

  const renderSession = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return <NotFound />;
    return <>
      {shellHeader('Stored session report', `${formatDate(session.startedAt)} · ${session.scenarioKey} · ${session.tier.toUpperCase()} / ${session.focus.toUpperCase()}`)}
      {session.hashMismatch && <p className="aar-mismatch">Replay hash differs from the originally stored final hash. Integrity needs review.</p>}
      {session.isFork && session.parentId && <p className="aar-branch-legend">WHAT-IF FORK · Parent: <a href={`#/aar/session/${encodeURIComponent(session.parentId)}`}>{session.parentId}</a> · starts at {formatTime(session.forkTick ?? 0)}</p>}
      <SessionReplay sessionLog={session.sessionLog} report={session.report} onFork={(tick) => launchFork(session, tick)} />
      <div className="aar-grid aar-grid-kpis"><Kpi label="Doctrine score" value={`${session.summary.total}%`} note={`${session.summary.grade} · scoring v${session.scoreVersion}`} /><Kpi label="Duration" value={`${(session.summary.durationTicks / 20).toFixed(0)}s`} note="Simulation time" /><Kpi label="Hostiles resolved" value={`${session.summary.hostilesNeutralised}/${session.summary.hostilesTotal}`} note="Across this session" /><Kpi label="Asset hit" value={session.summary.assetHit ? 'YES' : 'NO'} note={`Hash ${session.hash}`} /></div>
      <div className="aar-grid aar-grid-two"><section className="aar-card"><h2>Subscores</h2>{Object.entries(session.report.subscores).map(([label, value]) => <div className="aar-report-node" key={label}><strong>{formatClass(label)}</strong><span>{value}%</span></div>)}</section><section className="aar-card"><h2>Scoring reasons</h2>{session.report.reasons.length ? session.report.reasons.map((reason, index) => <p key={`${reason}-${index}`} className="aar-alert">{reason}</p>) : <p className="aar-muted">No additional score penalties.</p>}</section></div>
      <section className="aar-card" style={{ marginTop: 14 }}><h2>Contact decision paths</h2>{session.report.perContact.map((contact) => <div key={contact.actorId} className="aar-report-node"><strong>{formatClass(contact.classId)} · actor {contact.actorId}</strong><span>{contact.totalScore}</span><small>{contact.decisionPath.map((node) => `${node.question}: ${node.answer} (${node.points}/${node.maxPoints})`).join(' · ')}</small></div>)}</section>
    </>;
  };

  const renderCompare = (parentId: string, forkId: string) => {
    const parent = sessions.find((session) => session.id === parentId);
    const fork = sessions.find((session) => session.id === forkId && session.isFork);
    if (!parent || !fork) return <NotFound />;
    return <>
      {shellHeader('What-if comparison', `${formatClass(parent.scenarioKey)} · same seed ${parent.seed} · forked at ${formatTime(fork.forkTick ?? 0)}`)}
      <CompareResults original={parent} fork={fork} />
      <SessionReplay sessionLog={fork.sessionLog} report={fork.report} comparisonLog={parent.sessionLog} title="ORIGINAL AND FORK PATHS" onFork={(tick) => launchFork(fork, tick)} />
    </>;
  };

  return <main className="aar-root"><div className="aar-shell">
    {route.page === 'roster' && renderRoster(route.unitFilter)}
    {route.page === 'trainee' && renderTrainee(route.id)}
    {route.page === 'unit' && renderUnit(route.id)}
    {route.page === 'session' && renderSession(route.id)}
    {route.page === 'compare' && renderCompare(route.parentId, route.forkId)}
    {route.page !== 'roster' && <p style={{ marginTop: 28 }}><a className="aar-back-link" href="#/aar">← BACK TO AAR ROSTER</a></p>}
  </div></main>;
}

function Kpi({ label, value, note }: { label: string; value: React.ReactNode; note: string }): React.JSX.Element {
  return <section className="aar-card"><span className="aar-kpi-label">{label}</span><strong className="aar-kpi-value">{value}</strong><span className="aar-kpi-note">{note}</span></section>;
}

export function SessionTable({ sessions }: { sessions: SessionRecord[] }): React.JSX.Element {
  const roots = sessions.filter((session) => !session.isFork || !sessions.some((parent) => parent.id === session.parentId));
  const renderRow = (session: SessionRecord, nested: boolean) => <tr key={session.id} className={nested ? 'aar-session-fork' : undefined}>
    <td>{formatDate(session.startedAt)}</td><td>{formatClass(session.scenarioKey)}</td><td>{session.isFork ? `Fork · ${formatTime(session.forkTick ?? 0)}` : session.tier}</td><td><span className="aar-grade">{session.summary.grade}</span></td><td>{session.summary.total}</td><td><a className="aar-action-link" href={session.isFork && session.parentId ? `#/aar/compare/${encodeURIComponent(session.parentId)}/${encodeURIComponent(session.id)}` : `#/aar/session/${encodeURIComponent(session.id)}`}>{session.isFork ? 'COMPARE ↗' : 'OPEN ↗'}</a></td>
  </tr>;
  return <div className="aar-table-wrap"><table className="aar-table"><thead><tr><th>Date</th><th>Scenario</th><th>Tier</th><th>Grade</th><th>Total</th><th>Review</th></tr></thead><tbody>
    {roots.map((session) => <React.Fragment key={session.id}>{renderRow(session, false)}{sessions.filter((candidate) => candidate.isFork && candidate.parentId === session.id).sort((a, b) => (a.forkTick ?? 0) - (b.forkTick ?? 0) || a.startedAt - b.startedAt).map((fork) => renderRow(fork, true))}</React.Fragment>)}
  </tbody></table></div>;
}

function NotFound(): React.JSX.Element {
  return <><p className="aar-empty">The requested local record was not found.</p><a className="aar-back-link" href="#/aar">RETURN TO AAR</a></>;
}
