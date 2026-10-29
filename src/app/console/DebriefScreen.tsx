import React, { useMemo, useState } from 'react';
import {
  Command,
  Engine,
  generateScenario,
  ScoreReport,
  ScoreReportV2,
  scoreSessionV2,
  SessionLog,
  Tier,
  TraineeEnvironmentView,
} from '../../sim/index.js';
import { TextRoll } from '../components/TextRoll.js';
import { SessionReplay } from '../aar/SessionReplay.js';
import './debrief.css';

function groupPenalties(penalties: Array<{ reason: string; points: number }>): Array<{ reason: string; count: number; total: number }> {
  const grouped = new Map<string, { count: number; total: number }>();
  for (const penalty of penalties) {
    const value = grouped.get(penalty.reason) ?? { count: 0, total: 0 };
    value.count += 1;
    value.total += penalty.points;
    grouped.set(penalty.reason, value);
  }
  return [...grouped].map(([reason, value]) => ({ reason, ...value }));
}

export interface DebriefScreenProps {
  score: ScoreReport;
  scoreV2?: ScoreReportV2;
  sessionLog: SessionLog | null;
  storageStatus?: string;
  seed: string;
  scenarioId?: string;
  environment?: TraineeEnvironmentView;
  falseTracksObserved?: number;
  falseTracksEngaged?: number;
  onReplaySameSeed: () => void;
  onNewRandomSeed?: () => void;
  onStartNewMission?: () => void;
}

function formatClock(tick: number): string {
  const totalSec = Math.floor(tick / 20);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getScoreColor(score: number): string {
  if (score >= 85) return '#1b6d1b'; // deep prestige forest green
  if (score >= 60) return '#945300'; // deep warm amber
  return '#a31a00'; // deep editorial crimson
}

function getGradeClass(grade: string): string {
  const g = grade.toLowerCase();
  if (g.includes('proficient') || g.includes('excellent')) return 'debrief-grade-tag debrief-grade-pass';
  if (g.includes('competent') || g.includes('satisfactory')) return 'debrief-grade-tag debrief-grade-pass';
  if (g.includes('marginal')) return 'debrief-grade-tag debrief-grade-marginal';
  return 'debrief-grade-tag debrief-grade-fail';
}

export function DebriefScreen({
  score,
  scoreV2: propScoreV2,
  sessionLog,
  storageStatus,
  seed,
  scenarioId,
  environment,
  falseTracksObserved,
  falseTracksEngaged,
  onReplaySameSeed,
  onNewRandomSeed,
  onStartNewMission,
}: DebriefScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'v2' | 'v1'>('v2');
  const [showSessionReplay, setShowSessionReplay] = useState(false);
  const [expandedActorId, setExpandedActorId] = useState<number | null>(null);
  const handleStartNewMission = onStartNewMission ?? onNewRandomSeed ?? onReplaySameSeed;

  const handleDownloadLog = () => {
    if (!sessionLog) return;
    const blob = new Blob([JSON.stringify(sessionLog, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-log-${seed}-tick-${sessionLog.totalTicks}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const finalTick = sessionLog?.totalTicks || 0;

  const activeScenarioId = scenarioId ?? sessionLog?.scenarioId;
  const isProcedural = activeScenarioId?.startsWith('proc:v1:') ?? false;
  let procTier: string | null = null;
  let procTactic: string | null = null;
  if (isProcedural && activeScenarioId) {
    procTier = activeScenarioId.slice('proc:v1:'.length);
    try {
      const proc = generateScenario(seed, procTier as Tier);
      procTactic = proc.tactic ?? 'standard';
    } catch {
      procTactic = 'standard';
    }
  }

  const scTitle = isProcedural
    ? `Procedural (${procTier?.toUpperCase()})`
    : activeScenarioId === 'ridge_runner'
      ? 'Ridge Runner'
      : activeScenarioId === 'city_edge_night'
        ? 'City Edge Night'
        : 'Dawn Intrusion';

  const envStr = environment
    ? `${environment.timeOfDay} · ${environment.weather} · Vis ${environment.visibilityKm}km · ${environment.terrainKind}`
    : null;

  const ghostsEngaged =
    falseTracksEngaged ??
    score.penalties.filter((p) => p.reason.toLowerCase().includes('ghost')).length;

  const ghostsObserved =
    falseTracksObserved ??
    Math.max(ghostsEngaged, environment?.terrainKind === 'urban' ? 2 : 1);

  // Compute or fallback to doctrine v2 score
  const computedScoreV2 = useMemo<ScoreReportV2 | null>(() => {
    if (propScoreV2) return propScoreV2;
    if (!sessionLog || sessionLog.commands.length === 0) return null;
    try {
      const activeSc = scenarioId ?? sessionLog.scenarioId ?? 'dawn_intrusion';
      const eng = new Engine(seed, activeSc);
      const cmdMap = new Map<number, Command[]>();
      for (const c of sessionLog.commands) {
        const list = cmdMap.get(c.tick) ?? [];
        list.push(c);
        cmdMap.set(c.tick, list);
      }
      const maxTicks = sessionLog.totalTicks || 4800;
      while (!eng.missionState.ended && eng.world.tick < maxTicks) {
        const cmds = cmdMap.get(eng.world.tick);
        if (cmds) {
          for (const c of cmds) eng.enqueueCommand(c);
        }
        eng.step();
      }
      return scoreSessionV2({
        actors: eng.actors,
        tracks: eng.tracks,
        events: eng.getEvents(),
        assetHit: eng.getEvents().some((e) => e.type === 'ASSET_HIT'),
      });
    } catch (e) {
      console.warn('Failed to replay session for scoreV2:', e);
      return null;
    }
  }, [propScoreV2, sessionLog, seed, scenarioId]);

  const effectiveScoreV2: ScoreReportV2 = computedScoreV2 ?? {
    total: score.total,
    grade:
      score.total < 50
        ? 'Unsatisfactory'
        : score.total < 70
          ? 'Marginal'
          : score.total < 85
            ? 'Competent'
            : 'Proficient',
    weightedMean: score.weightedMean,
    subscores: {
      detection: Math.round(
        (score.perContact.reduce((s, c) => s + c.detectionScore, 0) /
          Math.max(1, score.perContact.length)) *
          100
      ),
      classification: Math.round(
        (score.perContact.reduce((s, c) => s + c.classificationScore, 0) /
          Math.max(1, score.perContact.length)) *
          100
      ),
      engagement: Math.round(
        (score.perContact.reduce((s, c) => s + c.decisionScore, 0) /
          Math.max(1, score.perContact.length)) *
          100
      ),
      discipline: Math.max(
        0,
        Math.min(100, 100 - score.penalties.reduce((sum, p) => sum + p.points, 0))
      ),
    },
    perContact: score.perContact.map((c) => ({
      actorId: c.actorId,
      classId: c.classId,
      weight: c.classId === 'fpv_kamikaze' ? 4 : 1,
      observable: true,
      d: c.detectionScore,
      c: c.classificationScore,
      e: c.decisionScore,
      contactTotal: c.contactTotal,
      totalScore: Math.round(c.contactTotal * 100),
      decisionPath: [
        {
          id: 'detection',
          question: 'Detection acknowledgement latency',
          answer: c.ackLatencySec !== undefined ? `${c.ackLatencySec.toFixed(1)}s` : 'N/A',
          points: Math.round(c.detectionScore * 20),
          maxPoints: 20,
          cause: null,
        },
        {
          id: 'classification',
          question: 'Threat identification accuracy',
          answer: c.assessedClass ?? 'none',
          points: Math.round(c.classificationScore * 25),
          maxPoints: 25,
          cause: null,
        },
        {
          id: 'engagement',
          question: 'Effector engagement resolution',
          answer: c.engagedWithoutClassification ? 'Engaged unclassified' : 'Resolved',
          points: Math.round(c.decisionScore * 55),
          maxPoints: 55,
          cause: null,
        },
      ],
    })),
    unobservable: [],
    penalties: score.penalties,
    roeCapApplied: false,
    reasons: score.reasons,
    missionDecisionPath: [],
  };

  // Executive Tactical Verdict calculations
  const roeBreached = effectiveScoreV2.roeCapApplied;
  const isPass = effectiveScoreV2.total >= 85;
  const isMarginal = effectiveScoreV2.total >= 60 && !isPass;

  let verdictClass = 'debrief-verdict-banner verdict-failed';
  let verdictIcon = '●';
  let verdictTitle = 'PERIMETER COMPROMISED // CRITICAL DEFENSE FAILURES';
  let verdictSummary =
    'Hostile drones penetrated the inner defense perimeter before neutralization, or significant ammunition was expended on non-threat clutter. Threat prioritization and classification discipline must be improved.';
  let verdictTip =
    'DOCTRINE DIRECTIVE: Prioritize high-speed FPV Kamikaze tracks heading towards base assets. Use Jammer out to 1.5 km or CIWS 30mm bursts under 1.0 km. Never discharge effectors at unconfirmed or ghost radar returns.';

  if (roeBreached) {
    verdictClass = 'debrief-verdict-banner verdict-roe';
    verdictIcon = '●';
    verdictTitle = 'RULES OF ENGAGEMENT BREACH // SCORE CAPPED AT 60';
    verdictSummary =
      'Civilian airframe or non-hostile contact engaged with live effectors. Under standard military doctrine, ROE violations impose an immediate hard ceiling of 60 on mission score.';
    verdictTip =
      'DOCTRINE DIRECTIVE: Low-speed blips (<25 m/s) with no RF emissions are civilian quadcopters or birds. Slew EO/IR optics to confirm target visual profile before issuing engagement commands.';
  } else if (isPass) {
    verdictClass = 'debrief-verdict-banner verdict-pass';
    verdictIcon = '●';
    verdictTitle = 'PERIMETER SECURED // EXCEPTIONAL DOCTRINE ADHERENCE';
    verdictSummary =
      'All incoming threats were designated, classified, and neutralized with high weapon economy. Defense assets remained fully intact with minimal collateral risk.';
    verdictTip =
      'DOCTRINE DIRECTIVE: Excellent target acknowledgment and effector economy. Maintain early radar sweeps to maximize available reaction time against clustered swarm tactics.';
  } else if (isMarginal) {
    verdictClass = 'debrief-verdict-banner verdict-marginal';
    verdictIcon = '●';
    verdictTitle = 'MISSION ACCOMPLISHED // MARGINAL OPERATIONAL EFFICIENCY';
    verdictSummary =
      'Perimeter was defended, but delayed radar acknowledgment latency or sub-optimal weapon matching degraded overall tactical rating.';
    verdictTip =
      'DOCTRINE DIRECTIVE: Press "A" immediately when a new track appears. Every 1.5 seconds of acknowledgment latency forfeits approximately 100 meters of intercept standoff.';
  }

  const v2ScoreColor = getScoreColor(effectiveScoreV2.total);
  const v1ScoreColor = getScoreColor(score.total);

  return (
    <div className="debrief-container">
      <div className="debrief-shell">
        {/* Header */}
        <header className="debrief-header">
          <div className="debrief-badge-row">
            <span className="debrief-pill debrief-pill-accent">AFTER ACTION REVIEW (AAR)</span>
            <span className="debrief-pill">SEED: {seed}</span>
            <span className="debrief-pill">DURATION: {formatClock(finalTick)}</span>
            {isProcedural && procTier && (
              <span className="debrief-pill debrief-pill-tier">TIER: {procTier.toUpperCase()}</span>
            )}
            {isProcedural && procTactic && (
              <span className="debrief-pill">TACTIC: {procTactic.toUpperCase()}</span>
            )}
            {envStr && <span className="debrief-pill">{envStr}</span>}
          </div>
          <h1 className="debrief-title">Mission Debrief: {scTitle}</h1>
        </header>

        {/* Toolbar & View Controls */}
        <div className="debrief-toolbar">
          <div className="debrief-tab-group">
            <button
              type="button"
              onClick={() => setActiveTab('v2')}
              className={`debrief-tab-btn ${activeTab === 'v2' ? 'is-active' : ''}`}
            >
              Doctrine Scoring v2
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('v1')}
              className={`debrief-tab-btn ${activeTab === 'v1' ? 'is-active' : ''}`}
            >
              v1 (legacy)
            </button>
          </div>

          {sessionLog && (
            <button
              type="button"
              onClick={() => setShowSessionReplay((open) => !open)}
              className="debrief-replay-btn"
            >
              {showSessionReplay ? '✕ Close Flight Review' : '▶ Open Synchronized Flight Review'}
            </button>
          )}
        </div>

        {/* Synchronized Flight Review (if opened) */}
        {showSessionReplay && sessionLog && (
          <div style={{ marginBottom: '8px' }}>
            <SessionReplay
              sessionLog={sessionLog}
              report={effectiveScoreV2}
              title="LIVE DEBRIEF FLIGHT REVIEW"
            />
          </div>
        )}

        {/* Doctrine Scoring v2 Panel */}
        <div style={{ display: activeTab === 'v2' ? 'flex' : 'none', flexDirection: 'column', gap: '28px' }}>
          {/* Executive Tactical Verdict Banner */}
          <div className={verdictClass}>
            <div className="debrief-verdict-status">
              <span className="debrief-verdict-icon">{verdictIcon}</span>
              <span className="debrief-verdict-title">{verdictTitle}</span>
            </div>
            <p className="debrief-verdict-summary">{verdictSummary}</p>
            <div className="debrief-verdict-tip">
              <strong>{verdictTip}</strong>
            </div>
          </div>
          {/* Score Showcase Hero */}
            <div className="debrief-score-hero">
              <div className="debrief-score-dial">
                <span className="debrief-score-kicker">DOCTRINE SCORE</span>
                <span className="debrief-score-number" style={{ color: v2ScoreColor }}>
                  {effectiveScoreV2.total}
                  <span className="debrief-score-max"> / 100</span>
                </span>
                <span className={getGradeClass(effectiveScoreV2.grade)}>
                  {effectiveScoreV2.grade.toUpperCase()}
                </span>
                {effectiveScoreV2.roeCapApplied && (
                  <span className="debrief-roe-cap">ROE CAP (MAX 60)</span>
                )}
              </div>

              {/* 4 Coloured Subscore Badges */}
              <div className="debrief-subscores-grid">
                <div className="debrief-subscore-item">
                  <span className="debrief-subscore-label">DETECTION</span>
                  <span
                    className="debrief-subscore-value"
                    style={{ color: getScoreColor(effectiveScoreV2.subscores.detection) }}
                  >
                    {effectiveScoreV2.subscores.detection}%
                  </span>
                  <span className="debrief-subscore-desc">Target confirmation speed</span>
                  <div className="debrief-subscore-bar">
                    <div
                      className="debrief-subscore-fill"
                      style={{
                        width: `${effectiveScoreV2.subscores.detection}%`,
                        backgroundColor: getScoreColor(effectiveScoreV2.subscores.detection),
                      }}
                    />
                  </div>
                </div>

                <div className="debrief-subscore-item">
                  <span className="debrief-subscore-label">CLASSIFICATION</span>
                  <span
                    className="debrief-subscore-value"
                    style={{ color: getScoreColor(effectiveScoreV2.subscores.classification) }}
                  >
                    {effectiveScoreV2.subscores.classification}%
                  </span>
                  <span className="debrief-subscore-desc">Airframe / RF attribution</span>
                  <div className="debrief-subscore-bar">
                    <div
                      className="debrief-subscore-fill"
                      style={{
                        width: `${effectiveScoreV2.subscores.classification}%`,
                        backgroundColor: getScoreColor(effectiveScoreV2.subscores.classification),
                      }}
                    />
                  </div>
                </div>

                <div className="debrief-subscore-item">
                  <span className="debrief-subscore-label">ENGAGEMENT</span>
                  <span
                    className="debrief-subscore-value"
                    style={{ color: getScoreColor(effectiveScoreV2.subscores.engagement) }}
                  >
                    {effectiveScoreV2.subscores.engagement}%
                  </span>
                  <span className="debrief-subscore-desc">Outcome, fit & latency</span>
                  <div className="debrief-subscore-bar">
                    <div
                      className="debrief-subscore-fill"
                      style={{
                        width: `${effectiveScoreV2.subscores.engagement}%`,
                        backgroundColor: getScoreColor(effectiveScoreV2.subscores.engagement),
                      }}
                    />
                  </div>
                </div>

                <div className="debrief-subscore-item">
                  <span className="debrief-subscore-label">DISCIPLINE</span>
                  <span
                    className="debrief-subscore-value"
                    style={{ color: getScoreColor(effectiveScoreV2.subscores.discipline) }}
                  >
                    {effectiveScoreV2.subscores.discipline}%
                  </span>
                  <span className="debrief-subscore-desc">ROE & false engage avoidance</span>
                  <div className="debrief-subscore-bar">
                    <div
                      className="debrief-subscore-fill"
                      style={{
                        width: `${effectiveScoreV2.subscores.discipline}%`,
                        backgroundColor: getScoreColor(effectiveScoreV2.subscores.discipline),
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Contact Table with Expandable Decision Paths */}
            <section className="debrief-section">
              <div className="debrief-section-header">
                <h3 className="debrief-section-title">PER-CONTACT EVALUATION (DOCTRINE DECISION TREE)</h3>
                <span className="debrief-section-subtext">Click any contact row to inspect decision trace</span>
              </div>
              <div className="debrief-table-wrapper">
                <table className="debrief-table">
                  <thead>
                    <tr>
                      <th>ACTOR</th>
                      <th>CLASS</th>
                      <th>OBSERVABLE</th>
                      <th>D (DETECT)</th>
                      <th>C (CLASS)</th>
                      <th>E (ENGAGE)</th>
                      <th>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveScoreV2.perContact.map((c) => {
                      const isExpanded = expandedActorId === c.actorId;
                      const isHostile =
                        c.classId === 'fpv_kamikaze' ||
                        c.classId === 'fpv_fiber' ||
                        c.classId === 'fixed_wing_recon';

                      return (
                        <React.Fragment key={c.actorId}>
                          <tr
                            onClick={() => setExpandedActorId(isExpanded ? null : c.actorId)}
                            className={`is-clickable ${isExpanded ? 'is-expanded' : ''}`}
                          >
                            <td>
                              <span style={{ fontWeight: 800, color: '#140f0a' }}>
                                {isExpanded ? '▼ ' : '▶ '}#{c.actorId}
                              </span>
                            </td>
                            <td
                              style={{
                                color: isHostile ? '#a31a00' : '#174873',
                                fontWeight: 800,
                              }}
                            >
                              {c.classId.toUpperCase()}
                            </td>
                            <td>
                              <span className={`debrief-pill ${c.observable ? 'debrief-pill-accent' : ''}`}>
                                {c.observable ? 'YES' : 'NO'}
                              </span>
                            </td>
                            <td>{(c.d * 100).toFixed(0)}%</td>
                            <td>{(c.c * 100).toFixed(0)}%</td>
                            <td>{(c.e * 100).toFixed(0)}%</td>
                            <td
                              style={{
                                color: getScoreColor(c.totalScore),
                                fontWeight: 800,
                              }}
                            >
                              {c.totalScore}%
                            </td>
                          </tr>

                          {/* Expanded Decision Path */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} style={{ padding: 0 }}>
                                <div className="debrief-decision-box">
                                  <h4 className="debrief-decision-title">
                                    Decision Tree Trace — Actor #{c.actorId} ({c.classId})
                                  </h4>
                                  <div className="debrief-decision-nodes">
                                    {c.decisionPath.map((node) => (
                                      <div key={node.id} className="debrief-decision-node">
                                        <div className="debrief-node-header">
                                          <span className="debrief-node-question">{node.question}</span>
                                          <span
                                            className="debrief-node-points"
                                            style={{
                                              color:
                                                node.points === node.maxPoints
                                                  ? '#1b6d1b'
                                                  : node.points > 0
                                                    ? '#945300'
                                                    : '#a31a00',
                                            }}
                                          >
                                            {node.points} / {node.maxPoints} pts
                                          </span>
                                        </div>
                                        <div className="debrief-node-detail">
                                          <span>Answer: <strong>{node.answer}</strong></span>
                                          {node.note && <span>[{node.note}]</span>}
                                          {node.cause && (
                                            <span style={{ color: '#a31a00', fontWeight: 700 }}>
                                              Cause: {node.cause}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Unobservable Contacts Section */}
            <section className="debrief-section">
              <div className="debrief-section-header">
                <h3 className="debrief-section-title">UNOBSERVABLE CONTACTS</h3>
              </div>
              {effectiveScoreV2.unobservable.length === 0 ? (
                <div className="debrief-notice-box">
                  All mission contacts reached confirmed radar track status and were evaluated in weighted mean.
                </div>
              ) : (
                <div className="debrief-unobservable-grid">
                  {effectiveScoreV2.unobservable.map((u) => (
                    <div key={u.actorId} className="debrief-unobservable-card">
                      <span className="debrief-actor-badge">Actor #{u.actorId}</span>
                      <span className="debrief-class-badge">{u.classId.toUpperCase()}</span>
                      <span className="debrief-reason-text">Reason: {u.reason}</span>
                      {u.note && <span className="debrief-note-text">({u.note})</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Mission-Level Penalties Section */}
            <section className="debrief-section">
              <div className="debrief-section-header">
                <h3 className="debrief-section-title">MISSION-LEVEL PENALTIES</h3>
              </div>
              {effectiveScoreV2.roeCapApplied && (
                <div className="debrief-penalty-item" style={{ background: 'rgba(179, 32, 0, 0.08)' }}>
                  <span className="debrief-penalty-badge">ROE CAP ENFORCED (MAX 60 PTS)</span>
                  <span className="debrief-penalty-reason">Civilian quadcopter engagement detected. Total score cannot exceed 60.</span>
                </div>
              )}
              {effectiveScoreV2.penalties.length === 0 ? (
                <div className="debrief-notice-box">No mission penalties incurred. Clean tactical engagement.</div>
              ) : (
                <div className="debrief-penalties-list">
                  {groupPenalties(effectiveScoreV2.penalties).map((pen) => (
                    <div key={pen.reason} className="debrief-penalty-item">
                      <span className="debrief-penalty-badge">-{pen.total} PTS</span>
                      <span className="debrief-penalty-reason">{pen.reason}{pen.count > 1 ? ` x ${pen.count}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Plain-English Reasons */}
            {effectiveScoreV2.reasons && effectiveScoreV2.reasons.length > 0 && (
              <section className="debrief-section">
                <div className="debrief-section-header">
                  <h3 className="debrief-section-title">EVALUATION AUDIT LOG & REASONS</h3>
                </div>
                <ul className="debrief-reasons-list">
                  {effectiveScoreV2.reasons.map((r, idx) => (
                    <li key={idx}>
                      {r}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

        {/* Legacy Scoring v1 Panel */}
        <div style={{ display: activeTab === 'v1' ? 'flex' : 'none', flexDirection: 'column', gap: '28px' }}>
          <div className="debrief-notice-box">
            Displaying Legacy Scoring v1 Results (Basic Heuristic Model)
          </div>
          <div className={`debrief-verdict-banner ${score.total >= 85 ? 'verdict-pass' : score.total >= 60 ? 'verdict-marginal' : 'verdict-failed'}`}>
            <div className="debrief-verdict-status">
              <span className="debrief-verdict-icon">●</span>
              <span className="debrief-verdict-title">
                {score.total >= 85 ? 'EVALUATION PASSED (v1 HEURISTIC)' : score.total >= 60 ? 'MARGINAL EVALUATION (v1 HEURISTIC)' : 'EVALUATION FAILED (v1 HEURISTIC)'}
              </span>
            </div>
            <p className="debrief-verdict-summary">
              {score.total >= 85
                ? 'All evaluated contacts engaged within acceptable operational bounds under legacy heuristic scoring.'
                : score.total >= 60
                  ? 'Mission accomplished with noticeable penalties or unclassified engagements.'
                  : 'Critical defense failures or high deduction penalties incurred during evaluation.'}
            </p>
          </div>

            {/* Score Showcase */}
            <div className="debrief-score-hero">
              <div className="debrief-score-dial">
                <span className="debrief-score-kicker">EVALUATION SCORE</span>
                <span className="debrief-score-number" style={{ color: v1ScoreColor }}>
                  {score.total}
                  <span className="debrief-score-max"> / 100</span>
                </span>
                <span
                  className={getGradeClass(
                    score.total >= 85
                      ? 'EXCELLENT'
                      : score.total >= 60
                        ? 'SATISFACTORY'
                        : 'FAILED'
                  )}
                >
                  {score.total >= 85
                    ? 'EXCELLENT'
                    : score.total >= 60
                      ? 'SATISFACTORY'
                      : 'FAILED'}
                </span>
              </div>

              <div className="debrief-summary-metrics">
                <div className="debrief-summary-metric">
                  <span className="debrief-summary-label">Weighted Mean Score</span>
                  <span className="debrief-summary-val">{score.weightedMean}%</span>
                </div>
                <div className="debrief-summary-metric">
                  <span className="debrief-summary-label">Total Deductions</span>
                  <span
                    className="debrief-summary-val"
                    style={{
                      color: score.penalties.length > 0 ? '#a31a00' : '#1b6d1b',
                    }}
                  >
                    -{score.penalties.reduce((sum, p) => sum + p.points, 0)} pts
                  </span>
                </div>
                <div className="debrief-summary-metric">
                  <span className="debrief-summary-label">Contacts Evaluated</span>
                  <span className="debrief-summary-val">{score.perContact.length}</span>
                </div>
                <div className="debrief-summary-metric">
                  <span className="debrief-summary-label">False Tracks (Clutter/Ghosts)</span>
                  <span
                    className="debrief-summary-val"
                    style={{
                      color: ghostsEngaged > 0 ? '#a31a00' : '#5c4b3c',
                    }}
                  >
                    {ghostsObserved} obs / {ghostsEngaged} eng
                  </span>
                </div>
              </div>
            </div>

            {/* Contacts Breakdown Table */}
            <section className="debrief-section">
              <div className="debrief-section-header">
                <h3 className="debrief-section-title">CONTACT EVALUATION BREAKDOWN (v1)</h3>
              </div>
              <div className="debrief-table-wrapper">
                <table className="debrief-table">
                  <thead>
                    <tr>
                      <th>ACTOR</th>
                      <th>TRUE CLASS</th>
                      <th>TRAINEE ASSESSMENT</th>
                      <th>ACK LATENCY</th>
                      <th>DETECTION</th>
                      <th>CLASSIFICATION</th>
                      <th>DECISION</th>
                      <th>SUBTOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {score.perContact.map((c) => {
                      const isHostile = c.classId === 'fpv_kamikaze';
                      const match = c.assessedClass === c.classId;

                      return (
                        <tr key={c.actorId}>
                          <td><strong>#{c.actorId}</strong></td>
                          <td
                            style={{
                              color: isHostile ? '#a31a00' : '#174873',
                              fontWeight: 800,
                            }}
                          >
                            {c.classId.toUpperCase()}
                          </td>
                          <td>
                            <span
                              style={{
                                color: match ? '#1b6d1b' : '#a31a00',
                                fontWeight: 700,
                              }}
                            >
                              {c.assessedClass
                                ? c.assessedClass.toUpperCase()
                                : 'UNASSESSED'}
                            </span>
                          </td>
                          <td>
                            {c.ackLatencySec !== undefined
                              ? `${c.ackLatencySec.toFixed(1)}s`
                              : 'NONE'}
                          </td>
                          <td>{(c.detectionScore * 100).toFixed(0)}%</td>
                          <td>{(c.classificationScore * 100).toFixed(0)}%</td>
                          <td>{(c.decisionScore * 100).toFixed(0)}%</td>
                          <td style={{ color: '#140f0a', fontWeight: 800 }}>
                            {(c.contactTotal * 100).toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Penalties Section */}
            {score.penalties.length > 0 && (
              <section className="debrief-section">
                <div className="debrief-section-header">
                  <h3 className="debrief-section-title">PENALTIES INCURRED (v1)</h3>
                </div>
                <div className="debrief-penalties-list">
                  {groupPenalties(score.penalties).map((pen) => (
                    <div key={pen.reason} className="debrief-penalty-item">
                      <span className="debrief-penalty-badge">-{pen.total} PTS</span>
                      <span className="debrief-penalty-reason">{pen.reason}{pen.count > 1 ? ` x ${pen.count}` : ''}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Effector Use Accounting */}
            {score.effectorUse && (
              <section className="debrief-section">
                <div className="debrief-section-header">
                  <h3 className="debrief-section-title">EFFECTOR ENGAGEMENT ACCOUNTING</h3>
                </div>
                <div className="debrief-effector-grid">
                  <div className="debrief-effector-card">
                    <span className="debrief-effector-label">GUN BURSTS FIRED</span>
                    <span className="debrief-effector-val">{score.effectorUse.gunBurstsFired}</span>
                  </div>
                  <div className="debrief-effector-card">
                    <span className="debrief-effector-label">JAMMER CYCLES</span>
                    <span className="debrief-effector-val">{score.effectorUse.jammerCycles}</span>
                  </div>
                  <div className="debrief-effector-card">
                    <span className="debrief-effector-label">HOSTILE KILLS</span>
                    <span className="debrief-effector-val" style={{ color: '#1b6d1b' }}>
                      Gun: {score.effectorUse.killsPerEffector.gun} | Jammer: {score.effectorUse.killsPerEffector.jammer}
                    </span>
                  </div>
                  <div className="debrief-effector-card">
                    <span className="debrief-effector-label">WASTED ENGAGEMENTS</span>
                    <span
                      className="debrief-effector-val"
                      style={{
                        color:
                          score.effectorUse.wastedEngagements.ghost +
                            score.effectorUse.wastedEngagements.decoy +
                            score.effectorUse.wastedEngagements.neutral >
                          0
                            ? '#a31a00'
                            : '#5c4b3c',
                      }}
                    >
                      Ghost: {score.effectorUse.wastedEngagements.ghost} | Decoy: {score.effectorUse.wastedEngagements.decoy} | Neutral: {score.effectorUse.wastedEngagements.neutral}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* Plain-English Reasons */}
            <section className="debrief-section">
              <div className="debrief-section-header">
                <h3 className="debrief-section-title">EVALUATION AUDIT LOG & REASONS</h3>
              </div>
              <ul className="debrief-reasons-list">
                {score.reasons.map((r, idx) => (
                  <li key={idx}>
                    {r}
                  </li>
                ))}
              </ul>
            </section>
        </div>

        {/* Action Buttons Bar */}
        <div className="debrief-actions-bar">
          {storageStatus && <p className="debrief-storage-status">{storageStatus}</p>}
          <button
            id="btn-replay-same-seed"
            type="button"
            onClick={onReplaySameSeed}
            className="debrief-btn-secondary"
          >
            <TextRoll center stagger={0.02}>Replay Same Seed</TextRoll>
          </button>
          <button
            id="btn-new-random-seed"
            type="button"
            onClick={handleStartNewMission}
            className="debrief-btn-primary"
          >
            <TextRoll center stagger={0.02}>New Random Seed</TextRoll>
          </button>
          <button
            id="btn-download-log"
            type="button"
            onClick={handleDownloadLog}
            className="debrief-btn-download"
          >
            <TextRoll center stagger={0.02}>Download Session Log (JSON)</TextRoll>
          </button>
        </div>
      </div>
    </div>
  );
}
