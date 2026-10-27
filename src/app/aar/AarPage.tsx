import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { TextRoll } from '../components/TextRoll.js';
import { useLenisScrollRoot } from '../hooks/useLenisScrollRoot.js';
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

function SplitTitle({ text }: { text: string }): React.JSX.Element {
  return <>
    {text.split('').map((ch, i) => (
      <span className="vj-char-mask" key={i}>
        <span className="vj-split-char" style={{ '--char-index': i } as React.CSSProperties}>
          {ch === ' ' ? ' ' : ch}
        </span>
      </span>
    ))}
  </>;
}

function RevealWords({ text, accentWords = [], baseIndex = 0 }: { text: string; accentWords?: string[]; baseIndex?: number }): React.JSX.Element {
  const parts = text.split(/(\s+)/);
  let wordCounter = 0;
  return <>
    {parts.map((part, i) => {
      if (/^\s+$/.test(part)) {
        return <React.Fragment key={i}>{part}</React.Fragment>;
      }
      const cleanWord = part.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isAccent = accentWords.some((aw) => cleanWord === aw.toLowerCase());
      const wordIdx = wordCounter++;
      return (
        <span className="vj-word-mask" key={i}>
          <span
            className={`vj-reveal-word${isAccent ? ' is-accent' : ''}`}
            style={{ '--word-index': baseIndex + wordIdx } as React.CSSProperties}
          >
            {part}
          </span>
        </span>
      );
    })}
  </>;
}

function AnimatedKpiValue({ value }: { value: string | number }): React.JSX.Element {
  const [displayValue, setDisplayValue] = useState<string | number>(0);
  const strVal = String(value);

  useEffect(() => {
    const match = strVal.match(/^([\d.]+)(.*)$/);
    if (!match || !match[1]) {
      setDisplayValue(value);
      return;
    }
    const numStr = match[1];
    const target = parseFloat(numStr);
    const suffix = match[2] ?? '';
    const isDecimal = numStr.includes('.');
    const decimals = isDecimal ? (numStr.split('.')[1]?.length ?? 0) : 0;

    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / 900, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = target * easeOut;

      setDisplayValue(`${current.toFixed(decimals)}${suffix}`);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, strVal]);

  return <>{displayValue}</>;
}

function shellHeader(label: string, subtitle: string): React.JSX.Element {
  return <>
    <div className="vj-stair-transition" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span className="vj-stair-panel" key={i} style={{ '--stair-index': i } as React.CSSProperties} />
      ))}
    </div>
    <header className="aar-topline">
      <a className="aar-brand" href="#/" aria-label="Return to VAJRA console">
        <img src="/vajra-emblem.png" alt="" /> VAJRA <span className="aar-muted">/</span> AAR
      </a>
      <a className="aar-back-link" href="#/">
        <TextRoll center stagger={0.015}>RETURN TO CONSOLE ↗</TextRoll>
      </a>
    </header>
    <div className="aar-title-group">
      <p className="aar-kicker">TRAINING ANALYTICS / LOCAL RECORDS <span className="aar-meta-badge">VAJRA // TELEMETRY ARCHIVE</span></p>
      <h1 className="aar-title" aria-label={label}><SplitTitle text={label} /></h1>
    </div>
    <p className="aar-subtitle">
      <RevealWords text={subtitle} accentWords={['performance', 'trends', 'readiness', 'score', 'replay', 'timeline']} />
    </p>
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
  return (
    <button className="aar-action-link" type="button" onClick={download}>
      <TextRoll center stagger={0.015}>EXPORT CSV ↓</TextRoll>
    </button>
  );
}

export function AarPage(): React.JSX.Element {
  const scrollRootRef = useRef<HTMLElement | null>(null);
  useLenisScrollRoot(scrollRootRef);

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
        {unit && (
          <a className="aar-action-link" href={`#/aar/unit/${encodeURIComponent(unit.id)}`}>
            <TextRoll center stagger={0.015}>OPEN UNIT READINESS ↗</TextRoll>
          </a>
        )}
      </div>
      <div className="aar-grid aar-grid-kpis">
        <Kpi label="Trainees" value={visibleTrainees.length} note="Local roster" index={0} />
        <Kpi label="Sessions" value={visibleSessions.length} note="Saved on this device" index={1} />
        <Kpi label="What-if practice" value={allVisibleSessions.filter((session) => session.isFork).length} note="Separate from training record" index={2} />
        <Kpi label="Mean score" value={`${average.toFixed(1)}%`} note="Selected roster" index={3} />
        <Kpi label="Units" value={unitFilter ? 1 : units.length} note="Training groups" index={4} />
      </div>
      <section className="aar-card vj-card-cascade" style={{ '--card-index': 5 } as React.CSSProperties}>
        <div className="aar-card-heading"><h2>Trainee roster</h2><span className="aar-muted">Select a callsign to inspect performance</span></div>
        {visibleTrainees.length === 0 ? <p className="aar-empty">{loading ? 'Loading local roster…' : 'No trainees are stored yet. Start a mission as Guest to create the local training profile.'}</p> :
          <div className="aar-roster-list">{visibleTrainees.map((trainee, index) => {
            const traineeSessions = sessions.filter((session) => !session.isFork && session.traineeId === trainee.id);
            const latest = traineeSessions[0];
            const unitName = units.find((item) => item.id === trainee.unitId)?.name ?? 'No unit';
            const recentAverage = traineeSessions.slice(0, 5).reduce((sum, session) => sum + session.summary.total, 0) / Math.max(1, Math.min(5, traineeSessions.length));
            return <a key={trainee.id} className="aar-roster-row vj-card-cascade" href={`#/aar/trainee/${encodeURIComponent(trainee.id)}`} style={{ '--card-index': index + 6 } as React.CSSProperties}>
              <span className="aar-roster-name">{trainee.callsign}</span><span className="aar-muted">{unitName}</span>
              <span className="aar-number"><strong>{recentAverage.toFixed(1)}%</strong><small className="aar-muted"> · last 5</small></span>
              <span className="aar-number"><strong>{traineeSessions.length}</strong><small className="aar-muted"> · sessions</small></span>
              {latest && <span className="aar-muted">Latest: {formatDate(latest.startedAt)}</span>}
            </a>;
          })}</div>}
      </section>
      <section className="aar-card vj-card-cascade" style={{ '--card-index': 12, marginTop: 14 } as React.CSSProperties}><LocalDataControls /></section>
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
      <div className="aar-toolbar">
        <span className="aar-muted">UNIT: {units.find((unit) => unit.id === trainee.unitId)?.name ?? 'Unassigned'}</span>
        <a className="aar-action-link" href={`#/aar/unit/${encodeURIComponent(trainee.unitId)}`}>
          <TextRoll center stagger={0.015}>VIEW UNIT READINESS ↗</TextRoll>
        </a>
      </div>
      <div className="aar-grid aar-grid-kpis">
        <Kpi label="Sessions" value={traineeSessions.length} note="All saved sessions" index={0} />
        <Kpi label="What-if practice" value={traineeAllSessions.filter((session) => session.isFork).length} note="Ignored by analytics" index={1} />
        <Kpi label="Latest score" value={traineeSessions[0] ? `${traineeSessions[0].summary.total}%` : '—'} note={traineeSessions[0] ? traineeSessions[0].summary.grade : 'No sessions'} index={2} />
        <Kpi label="Hostiles resolved" value={traineeSessions.reduce((sum, session) => sum + session.summary.hostilesNeutralised, 0)} note="Across saved sessions" index={3} />
        <Kpi label="Asset hits" value={traineeSessions.filter((session) => session.summary.assetHit).length} note="Review each mission record" index={4} />
      </div>
      {traineeSessions.length === 0 ? <p className="aar-empty">No sessions have been saved for this trainee.</p> : <>
        <div className="aar-card-cascade" style={{ '--card-index': 5 } as React.CSSProperties}>
          <LineChart title="Performance trend · last 20 sessions" series={lines} />
        </div>
        <div className="aar-grid aar-grid-two" style={{ marginTop: 14 }}>
          <div className="aar-card-cascade" style={{ '--card-index': 6 } as React.CSSProperties}>
            <Heatmap title="Skill heat map · last 10 sessions" matrix={matrix} />
          </div>
          <div className="aar-card-cascade" style={{ '--card-index': 7 } as React.CSSProperties}>
            <ConfusionMatrixChart data={confusionMatrix(traineeSessions)} />
          </div>
        </div>
        <div className="aar-card-cascade" style={{ '--card-index': 8, marginTop: 14 } as React.CSSProperties}>
          <SessionTable sessions={traineeAllSessions} />
        </div>
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
        <Kpi label="Unit mean" value={`${readiness.mean.toFixed(1)}%`} note="Mean of each trainee’s last 5" index={0} />
        <Kpi label="At or above 70" value={`${readiness.traineesAbove70Pct.toFixed(1)}%`} note="Trainees with saved sessions" index={1} />
        <Kpi label="7-day participation" value={readiness.participation7Days} note="Sessions in the last 7 days" index={2} />
        <Kpi label="What-if practice" value={unitAllSessions.filter((session) => session.isFork).length} note="Not part of readiness" index={3} />
        <Kpi label="Weakest skill" value={formatClass(readiness.weakestSkill)} note="Across recent unit sessions" index={4} />
      </div>
      <div className="aar-grid aar-grid-two">
        <section className="aar-card vj-card-cascade" style={{ '--card-index': 5 } as React.CSSProperties}>
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
        <div className="aar-card-cascade" style={{ '--card-index': 6 } as React.CSSProperties}>
          <Heatmap title="Weakest-skill overview" matrix={matrix} />
        </div>
      </div>
      <section className="aar-card vj-card-cascade" style={{ '--card-index': 7, marginTop: 14 } as React.CSSProperties}>
        <div className="aar-card-heading"><h2>Recent sessions</h2><span className="aar-muted">{unitSessions.length} scored · {unitAllSessions.filter((session) => session.isFork).length} what-if</span></div>
        <SessionTable sessions={unitAllSessions.slice(0, 40)} />
      </section>
    </>;
  };

  const renderSession = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return <NotFound />;
    return <>
      {shellHeader('Stored session report', `${formatDate(session.startedAt)} · ${session.scenarioKey} · ${session.tier.toUpperCase()} / ${session.focus.toUpperCase()}`)}
      {session.hashMismatch && <p className="aar-mismatch">Replay hash differs from the originally stored final hash. Integrity needs review.</p>}
      {session.isFork && session.parentId && <p className="aar-branch-legend">WHAT-IF FORK · Parent: <a href={`#/aar/session/${encodeURIComponent(session.parentId)}`}>{session.parentId}</a> · starts at {formatTime(session.forkTick ?? 0)}</p>}
      <div className="aar-card-cascade" style={{ '--card-index': 0 } as React.CSSProperties}>
        <SessionReplay sessionLog={session.sessionLog} report={session.report} onFork={(tick) => launchFork(session, tick)} />
      </div>
      <div className="aar-grid aar-grid-kpis">
        <Kpi label="Doctrine score" value={`${session.summary.total}%`} note={`${session.summary.grade} · scoring v${session.scoreVersion}`} index={1} />
        <Kpi label="Duration" value={`${(session.summary.durationTicks / 20).toFixed(0)}s`} note="Simulation time" index={2} />
        <Kpi label="Hostiles resolved" value={`${session.summary.hostilesNeutralised}/${session.summary.hostilesTotal}`} note="Across this session" index={3} />
        <Kpi label="Asset hit" value={session.summary.assetHit ? 'YES' : 'NO'} note={`Hash ${session.hash}`} index={4} />
      </div>
      <div className="aar-grid aar-grid-two">
        <section className="aar-card vj-card-cascade" style={{ '--card-index': 5 } as React.CSSProperties}>
          <h2>Subscores</h2>
          {Object.entries(session.report.subscores).map(([label, value]) => <div className="aar-report-node" key={label}><strong>{formatClass(label)}</strong><span>{value}%</span></div>)}
        </section>
        <section className="aar-card vj-card-cascade" style={{ '--card-index': 6 } as React.CSSProperties}>
          <h2>Scoring reasons</h2>
          {session.report.reasons.length ? session.report.reasons.map((reason, index) => <p key={`${reason}-${index}`} className="aar-alert">{reason}</p>) : <p className="aar-muted">No additional score penalties.</p>}
        </section>
      </div>
      <section className="aar-card vj-card-cascade" style={{ '--card-index': 7, marginTop: 14 } as React.CSSProperties}>
        <h2>Contact decision paths</h2>
        {session.report.perContact.map((contact) => <div key={contact.actorId} className="aar-report-node"><strong>{formatClass(contact.classId)} · actor {contact.actorId}</strong><span>{contact.totalScore}</span><small>{contact.decisionPath.map((node) => `${node.question}: ${node.answer} (${node.points}/${node.maxPoints})`).join(' · ')}</small></div>)}
      </section>
    </>;
  };

  const renderCompare = (parentId: string, forkId: string) => {
    const parent = sessions.find((session) => session.id === parentId);
    const fork = sessions.find((session) => session.id === forkId && session.isFork);
    if (!parent || !fork) return <NotFound />;
    return <>
      {shellHeader('What-if comparison', `${formatClass(parent.scenarioKey)} · same seed ${parent.seed} · forked at ${formatTime(fork.forkTick ?? 0)}`)}
      <div className="aar-card-cascade" style={{ '--card-index': 0 } as React.CSSProperties}>
        <CompareResults original={parent} fork={fork} />
      </div>
      <div className="aar-card-cascade" style={{ '--card-index': 1, marginTop: 14 } as React.CSSProperties}>
        <SessionReplay sessionLog={fork.sessionLog} report={fork.report} comparisonLog={parent.sessionLog} title="ORIGINAL AND FORK PATHS" onFork={(tick) => launchFork(fork, tick)} />
      </div>
    </>;
  };

  return <main className="aar-root" ref={scrollRootRef} data-scroll-root=""><div className="aar-shell" data-lenis-content="">
    {route.page === 'roster' && renderRoster(route.unitFilter)}
    {route.page === 'trainee' && renderTrainee(route.id)}
    {route.page === 'unit' && renderUnit(route.id)}
    {route.page === 'session' && renderSession(route.id)}
    {route.page === 'compare' && renderCompare(route.parentId, route.forkId)}
    {route.page !== 'roster' && <p style={{ marginTop: 28 }}><a className="aar-back-link" href="#/aar"><TextRoll center stagger={0.015}>← BACK TO AAR ROSTER</TextRoll></a></p>}
  </div></main>;
}

function Kpi({ label, value, note, index = 0 }: { label: string; value: string | number; note: string; index?: number }): React.JSX.Element {
  return (
    <section className="aar-card vj-card-cascade" style={{ '--card-index': index } as React.CSSProperties}>
      <span className="aar-kpi-label">{label}</span>
      <strong className="aar-kpi-value"><AnimatedKpiValue value={value} /></strong>
      <span className="aar-kpi-note">{note}</span>
    </section>
  );
}

export function SessionTable({ sessions }: { sessions: SessionRecord[] }): React.JSX.Element {
  const roots = sessions.filter((session) => !session.isFork || !sessions.some((parent) => parent.id === session.parentId));
  const renderRow = (session: SessionRecord, nested: boolean) => <tr key={session.id} className={nested ? 'aar-session-fork' : undefined}>
    <td>{formatDate(session.startedAt)}</td>
    <td>{formatClass(session.scenarioKey)} · {formatDate(session.startedAt)} · {session.id}</td>
    <td>{session.isFork ? `Fork · ${formatTime(session.forkTick ?? 0)}` : session.tier}</td>
    <td><span className="aar-grade">{session.summary.grade}</span></td>
    <td>{session.summary.total}</td>
    <td>
      <a className="aar-action-link" href={session.isFork && session.parentId ? `#/aar/compare/${encodeURIComponent(session.parentId)}/${encodeURIComponent(session.id)}` : `#/aar/session/${encodeURIComponent(session.id)}`}>
        <TextRoll center stagger={0.015}>{session.isFork ? 'COMPARE ↗' : 'OPEN ↗'}</TextRoll>
      </a>
    </td>
  </tr>;
  return <div className="aar-table-wrap"><table className="aar-table"><thead><tr><th>Date</th><th>Scenario</th><th>Tier</th><th>Grade</th><th>Total</th><th>Review</th></tr></thead><tbody>
    {roots.map((session) => <React.Fragment key={session.id}>{renderRow(session, false)}{sessions.filter((candidate) => candidate.isFork && candidate.parentId === session.id).sort((a, b) => (a.forkTick ?? 0) - (b.forkTick ?? 0) || a.startedAt - b.startedAt).map((fork) => renderRow(fork, true))}</React.Fragment>)}
  </tbody></table></div>;
}

function NotFound(): React.JSX.Element {
  return <>
    <p className="aar-empty">The requested local record was not found.</p>
    <a className="aar-back-link" href="#/aar">
      <TextRoll center stagger={0.015}>RETURN TO AAR</TextRoll>
    </a>
  </>;
}
