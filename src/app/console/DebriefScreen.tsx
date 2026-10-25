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

export interface DebriefScreenProps {
  score: ScoreReport;
  scoreV2?: ScoreReportV2;
  sessionLog: SessionLog | null;
  seed: string;
  scenarioId?: string;
  environment?: TraineeEnvironmentView;
  falseTracksObserved?: number;
  falseTracksEngaged?: number;
  onReplaySameSeed: () => void;
  onNewRandomSeed: () => void;
}

function formatClock(tick: number): string {
  const totalSec = Math.floor(tick / 20);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getScoreColor(score: number): string {
  if (score >= 85) return '#22c55e'; // green
  if (score >= 60) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

export function DebriefScreen({
  score,
  scoreV2: propScoreV2,
  sessionLog,
  seed,
  scenarioId,
  environment,
  falseTracksObserved,
  falseTracksEngaged,
  onReplaySameSeed,
  onNewRandomSeed,
}: DebriefScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'v2' | 'v1'>('v2');
  const [expandedActorId, setExpandedActorId] = useState<number | null>(null);

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
  };

  const v2ScoreColor = getScoreColor(effectiveScoreV2.total);
  const v1ScoreColor = getScoreColor(score.total);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.badgeRow}>
            <span style={styles.tag}>AFTER ACTION REVIEW (AAR)</span>
            <span style={styles.seedTag}>SEED: {seed}</span>
            <span style={styles.timeTag}>DURATION: {formatClock(finalTick)}</span>
            {isProcedural && procTier && (
              <span style={styles.tierTag}>TIER: {procTier.toUpperCase()}</span>
            )}
            {isProcedural && procTactic && (
              <span style={styles.tacticTag}>TACTIC: {procTactic.toUpperCase()}</span>
            )}
            {envStr && <span style={styles.seedTag}>{envStr}</span>}
          </div>
          <h1 style={styles.title}>Mission Debrief: {scTitle}</h1>
        </div>

        {/* Tab Switcher */}
        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => setActiveTab('v2')}
            style={activeTab === 'v2' ? styles.tabActive : styles.tabInactive}
          >
            Doctrine Scoring v2
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('v1')}
            style={activeTab === 'v1' ? styles.tabActive : styles.tabInactive}
          >
            v1 (legacy)
          </button>
        </div>

        {/* Doctrine Scoring v2 Panel */}
        <div style={{ display: activeTab === 'v2' ? 'block' : 'none' }}>
          {/* Score Showcase & Subscore Badges */}
            <div style={styles.scoreShowcase}>
              <div style={styles.scoreCircle}>
                <span style={styles.scoreLabel}>DOCTRINE SCORE</span>
                <span style={{ ...styles.scoreValue, color: v2ScoreColor }}>
                  {effectiveScoreV2.total}
                  <span style={styles.scoreMax}> / 100</span>
                </span>
                <span style={styles.scoreGrade}>{effectiveScoreV2.grade.toUpperCase()}</span>
                {effectiveScoreV2.roeCapApplied && (
                  <span style={styles.roeCapBadge}>ROE CAP (MAX 60)</span>
                )}
              </div>

              {/* 4 Coloured Subscore Badges: Detection, Classification, Engagement, Discipline */}
              <div style={styles.subscoreBadgesGrid}>
                <div
                  style={{
                    ...styles.subscoreBadgeCard,
                    borderColor: getScoreColor(effectiveScoreV2.subscores.detection),
                  }}
                >
                  <span style={styles.subscoreBadgeLabel}>DETECTION</span>
                  <span
                    style={{
                      ...styles.subscoreBadgeValue,
                      color: getScoreColor(effectiveScoreV2.subscores.detection),
                    }}
                  >
                    {effectiveScoreV2.subscores.detection}%
                  </span>
                  <span style={styles.subscoreBadgeDesc}>Target confirmation speed</span>
                </div>

                <div
                  style={{
                    ...styles.subscoreBadgeCard,
                    borderColor: getScoreColor(effectiveScoreV2.subscores.classification),
                  }}
                >
                  <span style={styles.subscoreBadgeLabel}>CLASSIFICATION</span>
                  <span
                    style={{
                      ...styles.subscoreBadgeValue,
                      color: getScoreColor(effectiveScoreV2.subscores.classification),
                    }}
                  >
                    {effectiveScoreV2.subscores.classification}%
                  </span>
                  <span style={styles.subscoreBadgeDesc}>Airframe / RF attribution</span>
                </div>

                <div
                  style={{
                    ...styles.subscoreBadgeCard,
                    borderColor: getScoreColor(effectiveScoreV2.subscores.engagement),
                  }}
                >
                  <span style={styles.subscoreBadgeLabel}>ENGAGEMENT</span>
                  <span
                    style={{
                      ...styles.subscoreBadgeValue,
                      color: getScoreColor(effectiveScoreV2.subscores.engagement),
                    }}
                  >
                    {effectiveScoreV2.subscores.engagement}%
                  </span>
                  <span style={styles.subscoreBadgeDesc}>Outcome, fit & latency</span>
                </div>

                <div
                  style={{
                    ...styles.subscoreBadgeCard,
                    borderColor: getScoreColor(effectiveScoreV2.subscores.discipline),
                  }}
                >
                  <span style={styles.subscoreBadgeLabel}>DISCIPLINE</span>
                  <span
                    style={{
                      ...styles.subscoreBadgeValue,
                      color: getScoreColor(effectiveScoreV2.subscores.discipline),
                    }}
                  >
                    {effectiveScoreV2.subscores.discipline}%
                  </span>
                  <span style={styles.subscoreBadgeDesc}>ROE & false engage avoidance</span>
                </div>
              </div>
            </div>

            {/* Per-Contact Table with Expandable Decision Paths */}
            <div style={styles.section}>
              <div style={styles.sectionHeaderRow}>
                <h3 style={styles.sectionTitle}>PER-CONTACT EVALUATION (DOCTRINE DECISION TREE)</h3>
                <span style={styles.sectionSubtext}>Click any contact row to view full decision path</span>
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ACTOR</th>
                      <th style={styles.th}>CLASS</th>
                      <th style={styles.th}>OBSERVABLE</th>
                      <th style={styles.th}>D (DETECT)</th>
                      <th style={styles.th}>C (CLASS)</th>
                      <th style={styles.th}>E (ENGAGE)</th>
                      <th style={styles.th}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveScoreV2.perContact.map((c) => {
                      const isExpanded = expandedActorId === c.actorId;
                      const isHostile = c.classId === 'fpv_kamikaze' || c.classId === 'fpv_fiber' || c.classId === 'fixed_wing_recon';

                      return (
                        <React.Fragment key={c.actorId}>
                          <tr
                            onClick={() => setExpandedActorId(isExpanded ? null : c.actorId)}
                            style={{
                              ...styles.tr,
                              cursor: 'pointer',
                              backgroundColor: isExpanded ? '#1a1a22' : 'transparent',
                            }}
                          >
                            <td style={styles.td}>
                              <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                                {isExpanded ? '▼ ' : '▶ '}#{c.actorId}
                              </span>
                            </td>
                            <td
                              style={{
                                ...styles.td,
                                color: isHostile ? '#f87171' : '#38bdf8',
                                fontWeight: 700,
                              }}
                            >
                              {c.classId.toUpperCase()}
                            </td>
                            <td style={styles.td}>
                              <span
                                style={{
                                  ...styles.tag,
                                  backgroundColor: c.observable
                                    ? 'rgba(74, 222, 128, 0.15)'
                                    : 'rgba(239, 68, 68, 0.15)',
                                  color: c.observable ? '#4ade80' : '#ef4444',
                                  borderColor: c.observable ? '#4ade80' : '#ef4444',
                                }}
                              >
                                {c.observable ? 'YES' : 'NO'}
                              </span>
                            </td>
                            <td style={styles.td}>{(c.d * 100).toFixed(0)}%</td>
                            <td style={styles.td}>{(c.c * 100).toFixed(0)}%</td>
                            <td style={styles.td}>{(c.e * 100).toFixed(0)}%</td>
                            <td
                              style={{
                                ...styles.td,
                                color: getScoreColor(c.totalScore),
                                fontWeight: 800,
                              }}
                            >
                              {c.totalScore}%
                            </td>
                          </tr>

                          {/* Expanded Decision Path */}
                          {isExpanded && (
                            <tr style={styles.expandedTr}>
                              <td colSpan={7} style={styles.expandedTd}>
                                <div style={styles.decisionPathBox}>
                                  <h4 style={styles.decisionPathTitle}>
                                    Decision Tree Trace — Actor #{c.actorId} ({c.classId})
                                  </h4>
                                  <div style={styles.decisionNodesList}>
                                    {c.decisionPath.map((node) => (
                                      <div key={node.id} style={styles.decisionNodeCard}>
                                        <div style={styles.decisionNodeHeader}>
                                          <span style={styles.nodeQuestion}>{node.question}</span>
                                          <span
                                            style={{
                                              ...styles.nodePointsBadge,
                                              color:
                                                node.points === node.maxPoints
                                                  ? '#4ade80'
                                                  : node.points > 0
                                                    ? '#f59e0b'
                                                    : '#f87171',
                                            }}
                                          >
                                            {node.points} / {node.maxPoints} pts
                                          </span>
                                        </div>
                                        <div style={styles.decisionNodeDetail}>
                                          <span style={styles.nodeAnswer}>Answer: {node.answer}</span>
                                          {node.note && (
                                            <span style={styles.nodeNote}>[{node.note}]</span>
                                          )}
                                          {node.cause && (
                                            <span style={styles.nodeCause}>
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
            </div>

            {/* Unobservable Contacts Section */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>UNOBSERVABLE CONTACTS</h3>
              {effectiveScoreV2.unobservable.length === 0 ? (
                <div style={styles.emptyNotice}>
                  All mission contacts reached confirmed radar track status and were evaluated in weighted mean.
                </div>
              ) : (
                <div style={styles.unobservableGrid}>
                  {effectiveScoreV2.unobservable.map((u) => (
                    <div key={u.actorId} style={styles.unobservableCard}>
                      <span style={styles.actorBadge}>Actor #{u.actorId}</span>
                      <span style={styles.classBadge}>{u.classId.toUpperCase()}</span>
                      <span style={styles.reasonText}>Reason: {u.reason}</span>
                      {u.note && <span style={styles.noteText}>({u.note})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mission-Level Penalties Section */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>MISSION-LEVEL PENALTIES</h3>
              {effectiveScoreV2.roeCapApplied && (
                <div style={styles.roeCapAlert}>
                  ⚠️ <strong>ROE CAP ENFORCED (MAX 60 PTS)</strong>: Civilian quadcopter engagement detected. Total score cannot exceed 60.
                </div>
              )}
              {effectiveScoreV2.penalties.length === 0 ? (
                <div style={styles.emptyNotice}>No mission penalties incurred. Clean tactical engagement.</div>
              ) : (
                <div style={styles.penaltyList}>
                  {effectiveScoreV2.penalties.map((pen, idx) => (
                    <div key={idx} style={styles.penaltyItem}>
                      <span style={styles.penaltyBadge}>-{pen.points} PTS</span>
                      <span style={styles.penaltyReason}>{pen.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>

        {/* Legacy Scoring v1 Panel */}
        <div style={{ display: activeTab === 'v1' ? 'block' : 'none' }}>
          <div style={styles.legacyNotice}>
            Displaying Legacy Scoring v1 Results (Basic Heuristic Model)
          </div>

            {/* Score Showcase */}
            <div style={styles.scoreShowcase}>
              <div style={styles.scoreCircle}>
                <span style={styles.scoreLabel}>EVALUATION SCORE</span>
                <span style={{ ...styles.scoreValue, color: v1ScoreColor }}>
                  {score.total}
                  <span style={styles.scoreMax}> / 100</span>
                </span>
                <span style={styles.scoreGrade}>
                  {score.total >= 85
                    ? 'EXCELLENT'
                    : score.total >= 60
                      ? 'SATISFACTORY'
                      : 'FAILED'}
                </span>
              </div>

              <div style={styles.scoreSummaryList}>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Weighted Mean Score:</span>
                  <span style={styles.summaryVal}>{score.weightedMean}%</span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Total Deductions:</span>
                  <span
                    style={{
                      ...styles.summaryVal,
                      color: score.penalties.length > 0 ? '#f87171' : '#4ade80',
                    }}
                  >
                    -{score.penalties.reduce((sum, p) => sum + p.points, 0)} pts
                  </span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Total Contacts Evaluated:</span>
                  <span style={styles.summaryVal}>{score.perContact.length}</span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>False Tracks (Clutter/Ghosts):</span>
                  <span
                    style={{
                      ...styles.summaryVal,
                      color: ghostsEngaged > 0 ? '#e34234' : '#a1a1aa',
                    }}
                  >
                    {ghostsObserved} observed / {ghostsEngaged} engaged
                  </span>
                </div>
              </div>
            </div>

            {/* Contacts Breakdown Table */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>CONTACT EVALUATION BREAKDOWN (v1)</h3>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ACTOR</th>
                      <th style={styles.th}>TRUE CLASS</th>
                      <th style={styles.th}>TRAINEE ASSESSMENT</th>
                      <th style={styles.th}>ACK LATENCY</th>
                      <th style={styles.th}>DETECTION</th>
                      <th style={styles.th}>CLASSIFICATION</th>
                      <th style={styles.th}>DECISION</th>
                      <th style={styles.th}>SUBTOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {score.perContact.map((c) => {
                      const isHostile = c.classId === 'fpv_kamikaze';
                      const match = c.assessedClass === c.classId;

                      return (
                        <tr key={c.actorId} style={styles.tr}>
                          <td style={styles.td}>#{c.actorId}</td>
                          <td
                            style={{
                              ...styles.td,
                              color: isHostile ? '#f87171' : '#38bdf8',
                              fontWeight: 700,
                            }}
                          >
                            {c.classId.toUpperCase()}
                          </td>
                          <td style={styles.td}>
                            <span
                              style={{
                                color: match ? '#4ade80' : '#f87171',
                                fontWeight: 600,
                              }}
                            >
                              {c.assessedClass
                                ? c.assessedClass.toUpperCase()
                                : 'UNASSESSED'}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {c.ackLatencySec !== undefined
                              ? `${c.ackLatencySec.toFixed(1)}s`
                              : 'NONE'}
                          </td>
                          <td style={styles.td}>
                            {(c.detectionScore * 100).toFixed(0)}%
                          </td>
                          <td style={styles.td}>
                            {(c.classificationScore * 100).toFixed(0)}%
                          </td>
                          <td style={styles.td}>
                            {(c.decisionScore * 100).toFixed(0)}%
                          </td>
                          <td
                            style={{
                              ...styles.td,
                              color: '#f8fafc',
                              fontWeight: 700,
                            }}
                          >
                            {(c.contactTotal * 100).toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Penalties Section */}
            {score.penalties.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>PENALTIES INCURRED (v1)</h3>
                <div style={styles.penaltyList}>
                  {score.penalties.map((pen, idx) => (
                    <div key={idx} style={styles.penaltyItem}>
                      <span style={styles.penaltyBadge}>-{pen.points} PTS</span>
                      <span style={styles.penaltyReason}>{pen.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Effector Use Accounting */}
            {score.effectorUse && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>EFFECTOR ENGAGEMENT ACCOUNTING</h3>
                <div style={styles.effectorGrid}>
                  <div style={styles.effectorCard}>
                    <span style={styles.effectorLabel}>GUN BURSTS FIRED</span>
                    <span style={styles.effectorVal}>{score.effectorUse.gunBurstsFired}</span>
                  </div>
                  <div style={styles.effectorCard}>
                    <span style={styles.effectorLabel}>JAMMER CYCLES</span>
                    <span style={styles.effectorVal}>{score.effectorUse.jammerCycles}</span>
                  </div>
                  <div style={styles.effectorCard}>
                    <span style={styles.effectorLabel}>HOSTILE KILLS</span>
                    <span style={{ ...styles.effectorVal, color: '#4ade80' }}>
                      Gun: {score.effectorUse.killsPerEffector.gun} | Jammer: {score.effectorUse.killsPerEffector.jammer}
                    </span>
                  </div>
                  <div style={styles.effectorCard}>
                    <span style={styles.effectorLabel}>WASTED ENGAGEMENTS</span>
                    <span
                      style={{
                        ...styles.effectorVal,
                        color:
                          score.effectorUse.wastedEngagements.ghost +
                            score.effectorUse.wastedEngagements.decoy +
                            score.effectorUse.wastedEngagements.neutral >
                          0
                            ? '#f87171'
                            : '#a1a1aa',
                      }}
                    >
                      Ghost: {score.effectorUse.wastedEngagements.ghost} | Decoy: {score.effectorUse.wastedEngagements.decoy} | Neutral: {score.effectorUse.wastedEngagements.neutral}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Plain-English Reasons */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>EVALUATION AUDIT LOG & REASONS</h3>
              <ul style={styles.reasonsList}>
                {score.reasons.map((r, idx) => (
                  <li key={idx} style={styles.reasonItem}>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
        </div>

        {/* Buttons Row */}
        <div style={styles.btnRow}>
          <button
            id="btn-replay-same-seed"
            type="button"
            onClick={onReplaySameSeed}
            style={styles.btnSecondary}
          >
            <TextRoll center stagger={0.02}>↺ Replay Same Seed</TextRoll>
          </button>
          <button
            id="btn-new-random-seed"
            type="button"
            onClick={onNewRandomSeed}
            style={styles.btnPrimary}
          >
            <TextRoll center stagger={0.02}>🎲 New Random Seed</TextRoll>
          </button>
          <button
            id="btn-download-log"
            type="button"
            onClick={handleDownloadLog}
            style={styles.btnDownload}
          >
            <TextRoll center stagger={0.02}>⬇ Download Session Log (JSON)</TextRoll>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    padding: '30px 16px',
    backgroundColor: '#0b0b0b',
    minHeight: 'calc(100vh - 120px)',
  },
  card: {
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '12px',
    maxWidth: '960px',
    width: '100%',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    fontFamily: 'monospace',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.8)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderBottom: '1px solid #262626',
    paddingBottom: '16px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: 'rgba(203, 179, 232, 0.15)',
    color: '#cbb3e8',
    border: '1px solid rgba(203, 179, 232, 0.35)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
  },
  tierTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
  },
  tacticTag: {
    backgroundColor: 'rgba(212, 255, 63, 0.15)',
    color: '#d4ff3f',
    border: '1px solid rgba(212, 255, 63, 0.35)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
  },
  seedTag: {
    color: '#a1a1aa',
    fontSize: '11px',
  },
  timeTag: {
    color: '#a1a1aa',
    fontSize: '11px',
  },
  title: {
    margin: 0,
    fontSize: '26px',
    fontWeight: 700,
    color: '#ffffff',
  },
  tabBar: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid #262626',
    paddingBottom: '8px',
  },
  tabActive: {
    backgroundColor: 'rgba(212, 255, 63, 0.15)',
    color: '#d4ff3f',
    border: '1px solid #d4ff3f',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  tabInactive: {
    backgroundColor: '#18181b',
    color: '#a1a1aa',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  scoreShowcase: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    backgroundColor: '#0c0c0e',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '20px 24px',
    flexWrap: 'wrap',
  },
  scoreCircle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    minWidth: '160px',
  },
  scoreLabel: {
    fontSize: '10px',
    color: '#cbb3e8',
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  scoreValue: {
    fontSize: '44px',
    fontWeight: 800,
    lineHeight: '1',
  },
  scoreMax: {
    fontSize: '18px',
    color: '#767a8f',
    fontWeight: 500,
  },
  scoreGrade: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: '#d4ff3f',
  },
  roeCapBadge: {
    marginTop: '4px',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    border: '1px solid #ef4444',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '9px',
    fontWeight: 800,
  },
  subscoreBadgesGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
  },
  subscoreBadgeCard: {
    backgroundColor: '#141416',
    border: '1px solid #262626',
    borderRadius: '6px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  subscoreBadgeLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#a1a1aa',
    letterSpacing: '0.05em',
  },
  subscoreBadgeValue: {
    fontSize: '22px',
    fontWeight: 800,
    lineHeight: '1.2',
  },
  subscoreBadgeDesc: {
    fontSize: '9px',
    color: '#71717a',
  },
  scoreSummaryList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderLeft: '1px solid #262626',
    paddingLeft: '24px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  summaryLabel: {
    color: '#c4c7d4',
  },
  summaryVal: {
    color: '#ffffff',
    fontWeight: 700,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 700,
    color: '#cbb3e8',
    letterSpacing: '0.06em',
  },
  sectionSubtext: {
    fontSize: '11px',
    color: '#71717a',
    fontStyle: 'italic',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    color: '#cbb3e8',
    fontSize: '10px',
    fontWeight: 600,
    borderBottom: '1px solid #262626',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #1f1f1f',
  },
  td: {
    padding: '8px 10px',
    color: '#e4e4e7',
    whiteSpace: 'nowrap',
  },
  expandedTr: {
    backgroundColor: '#16161a',
    borderBottom: '1px solid #2a2a30',
  },
  expandedTd: {
    padding: '12px 16px',
  },
  decisionPathBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  decisionPathTitle: {
    margin: 0,
    fontSize: '11px',
    fontWeight: 700,
    color: '#d4ff3f',
    letterSpacing: '0.04em',
  },
  decisionNodesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  decisionNodeCard: {
    backgroundColor: '#0f0f12',
    border: '1px solid #2a2a30',
    borderRadius: '4px',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  decisionNodeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeQuestion: {
    color: '#e4e4e7',
    fontSize: '11px',
    fontWeight: 600,
  },
  nodePointsBadge: {
    fontSize: '11px',
    fontWeight: 700,
  },
  decisionNodeDetail: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    fontSize: '11px',
  },
  nodeAnswer: {
    color: '#a1a1aa',
  },
  nodeNote: {
    color: '#71717a',
  },
  nodeCause: {
    color: '#ef4444',
    fontWeight: 700,
  },
  emptyNotice: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid #262626',
    borderRadius: '4px',
    padding: '12px',
    color: '#71717a',
    fontSize: '12px',
  },
  unobservableGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '8px',
  },
  unobservableCard: {
    backgroundColor: '#18181c',
    border: '1px solid #2d2d34',
    borderRadius: '4px',
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    fontSize: '11px',
  },
  actorBadge: {
    color: '#f8fafc',
    fontWeight: 700,
  },
  classBadge: {
    color: '#a1a1aa',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '1px 5px',
    borderRadius: '3px',
  },
  reasonText: {
    color: '#ef4444',
  },
  noteText: {
    color: '#71717a',
  },
  roeCapAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid #ef4444',
    borderRadius: '4px',
    padding: '10px 14px',
    color: '#fca5a5',
    fontSize: '12px',
    marginBottom: '8px',
  },
  penaltyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  penaltyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'rgba(227, 66, 52, 0.1)',
    border: '1px solid rgba(227, 66, 52, 0.5)',
    borderRadius: '4px',
    padding: '6px 10px',
  },
  penaltyBadge: {
    backgroundColor: '#e34234',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 700,
  },
  penaltyReason: {
    color: '#fca5a5',
    fontSize: '12px',
  },
  reasonsList: {
    margin: 0,
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: '#e4e4e7',
  },
  reasonItem: {
    lineHeight: '1.4',
  },
  legacyNotice: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '4px',
    padding: '8px 12px',
    color: '#fbbf24',
    fontSize: '11px',
    fontWeight: 600,
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    borderTop: '1px solid #262626',
    paddingTop: '16px',
  },
  btnPrimary: {
    backgroundColor: '#d4ff3f',
    color: '#080808',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 800,
    fontFamily: 'monospace',
    cursor: 'pointer',
    boxShadow: '0 0 14px rgba(212, 255, 63, 0.45)',
  },
  btnSecondary: {
    backgroundColor: '#181818',
    border: '1px solid #2e2e32',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  btnDownload: {
    backgroundColor: '#181818',
    border: '1px solid rgba(203, 179, 232, 0.35)',
    color: '#cbb3e8',
    borderRadius: '6px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  effectorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
  },
  effectorCard: {
    backgroundColor: '#0c0c0e',
    border: '1px solid #262626',
    borderRadius: '6px',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  effectorLabel: {
    color: '#a1a1aa',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  effectorVal: {
    color: '#f4f4f5',
    fontSize: '13px',
    fontWeight: 700,
  },
};
