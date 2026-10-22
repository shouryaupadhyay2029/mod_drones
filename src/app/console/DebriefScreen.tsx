import React from 'react';
import { ScoreReport, SessionLog, TraineeEnvironmentView } from '../../sim/index.js';

export interface DebriefScreenProps {
  score: ScoreReport;
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
  sessionLog,
  seed,
  scenarioId,
  environment,
  falseTracksObserved,
  falseTracksEngaged,
  onReplaySameSeed,
  onNewRandomSeed,
}: DebriefScreenProps): React.JSX.Element {
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
  const scoreColor = getScoreColor(score.total);

  const activeScenarioId = scenarioId ?? sessionLog?.scenarioId;
  const scTitle =
    activeScenarioId === 'ridge_runner'
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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.badgeRow}>
            <span style={styles.tag}>AFTER ACTION REVIEW (AAR)</span>
            <span style={styles.seedTag}>SEED: {seed}</span>
            <span style={styles.timeTag}>DURATION: {formatClock(finalTick)}</span>
            {envStr && <span style={styles.seedTag}>{envStr}</span>}
          </div>
          <h1 style={styles.title}>Mission Debrief: {scTitle}</h1>
        </div>

        {/* Score Showcase */}
        <div style={styles.scoreShowcase}>
          <div style={styles.scoreCircle}>
            <span style={styles.scoreLabel}>EVALUATION SCORE</span>
            <span style={{ ...styles.scoreValue, color: scoreColor }}>
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
                  color: ghostsEngaged > 0 ? '#f87171' : '#38bdf8',
                }}
              >
                {ghostsObserved} observed / {ghostsEngaged} engaged
              </span>
            </div>
          </div>
        </div>

        {/* Contacts Breakdown Table */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>CONTACT EVALUATION BREAKDOWN</h3>
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
            <h3 style={styles.sectionTitle}>PENALTIES INCURRED</h3>
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

        {/* Buttons Row */}
        <div style={styles.btnRow}>
          <button
            id="btn-replay-same-seed"
            onClick={onReplaySameSeed}
            style={styles.btnSecondary}
          >
            ↺ Replay Same Seed
          </button>
          <button
            id="btn-new-random-seed"
            onClick={onNewRandomSeed}
            style={styles.btnPrimary}
          >
            🎲 New Random Seed
          </button>
          <button
            id="btn-download-log"
            onClick={handleDownloadLog}
            style={styles.btnDownload}
          >
            ⬇ Download Session Log (JSON)
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
    backgroundColor: '#050a12',
    minHeight: 'calc(100vh - 120px)',
  },
  card: {
    backgroundColor: '#0b111e',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    maxWidth: '900px',
    width: '100%',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    fontFamily: 'monospace',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '16px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
  },
  seedTag: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  timeTag: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  title: {
    margin: 0,
    fontSize: '26px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  scoreShowcase: {
    display: 'flex',
    alignItems: 'center',
    gap: '28px',
    backgroundColor: '#030712',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '20px 24px',
    flexWrap: 'wrap',
  },
  scoreCircle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  scoreLabel: {
    fontSize: '10px',
    color: '#64748b',
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
    color: '#64748b',
    fontWeight: 500,
  },
  scoreGrade: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: '#94a3b8',
  },
  scoreSummaryList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderLeft: '1px solid #1e293b',
    paddingLeft: '24px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  summaryLabel: {
    color: '#94a3b8',
  },
  summaryVal: {
    color: '#f8fafc',
    fontWeight: 700,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 700,
    color: '#38bdf8',
    letterSpacing: '0.05em',
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
    color: '#64748b',
    fontSize: '10px',
    fontWeight: 600,
    borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #1e293b',
  },
  td: {
    padding: '8px 10px',
    color: '#cbd5e1',
    whiteSpace: 'nowrap',
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
    backgroundColor: '#1f1315',
    border: '1px solid #7f1d1d',
    borderRadius: '4px',
    padding: '6px 10px',
  },
  penaltyBadge: {
    backgroundColor: '#b91c1c',
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
    color: '#cbd5e1',
  },
  reasonItem: {
    lineHeight: '1.4',
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    borderTop: '1px solid #1e293b',
    paddingTop: '16px',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  btnSecondary: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#e2e8f0',
    borderRadius: '6px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  btnDownload: {
    backgroundColor: '#0d9488',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
};
