import React, { useMemo } from 'react';
import { TraineeTrack } from '../../sim/index.js';
import { getAssessedAbbr, getAssessedColor } from './radar/drawScope.js';

export interface TrackTableProps {
  tracks: TraineeTrack[];
  selectedTrackId: number | null;
  onSelectTrack: (trackId: number) => void;
}

export function TrackTable({
  tracks,
  selectedTrackId,
  onSelectTrack,
}: TrackTableProps): React.JSX.Element {
  // Default sort: range ascending
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => a.rangeM - b.rangeM);
  }, [tracks]);

  return (
    <div style={styles.container}>
      <div style={styles.headerTitle}>ACTIVE RADAR TRACKS ({tracks.length})</div>
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>STATE</th>
              <th style={styles.th}>RANGE</th>
              <th style={styles.th}>BEARING</th>
              <th style={styles.th}>COURSE</th>
              <th style={styles.th}>ALT</th>
              <th style={styles.th}>SPEED</th>
              <th style={styles.th}>CLOSING</th>
              <th style={styles.th}>RCS</th>
              <th style={styles.th}>QUAL</th>
              <th style={styles.th}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {sortedTracks.length === 0 ? (
              <tr>
                <td colSpan={11} style={styles.emptyCell}>
                  No active tracks detected in radar sweep sector.
                </td>
              </tr>
            ) : (
              sortedTracks.map((t) => {
                const isSelected = selectedTrackId === t.trackId;
                const assessedColor = getAssessedColor(t.assessedClass);
                const assessedAbbr = getAssessedAbbr(t.assessedClass) || 'UNASSESSED';

                return (
                  <tr
                    key={t.trackId}
                    onClick={() => onSelectTrack(t.trackId)}
                    style={{
                      ...styles.tr,
                      backgroundColor: isSelected ? '#1e293b' : 'transparent',
                      borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent',
                    }}
                  >
                    <td style={{ ...styles.td, color: '#38bdf8', fontWeight: 700 }}>
                      T{t.trackId}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.stateBadge,
                          color: t.state === 'confirmed' ? '#38bdf8' : '#94a3b8',
                          borderColor: t.state === 'confirmed' ? '#0284c7' : '#334155',
                        }}
                      >
                        {t.state.toUpperCase()}
                      </span>
                    </td>
                    <td style={styles.td}>{Math.round(t.rangeM)} m</td>
                    <td style={styles.td}>{Math.round(t.bearingDeg)}°</td>
                    <td style={styles.td}>
                      {t.velocityValid && t.courseDeg !== undefined ? `${Math.round(t.courseDeg)}°` : '—'}
                    </td>
                    <td style={styles.td}>{Math.round(t.altitudeM)} m</td>
                    <td style={styles.td}>
                      {t.velocityValid && t.speedMps !== undefined ? `${Math.round(t.speedMps)} m/s` : '—'}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        color: t.velocityValid && t.closingRateMps !== undefined && t.closingRateMps < -2 ? '#f87171' : '#cbd5e1',
                      }}
                    >
                      {t.velocityValid && t.closingRateMps !== undefined ? `${Math.round(t.closingRateMps)} m/s` : '—'}
                    </td>
                    <td style={styles.td}>{t.rcsBucket}</td>
                    <td style={styles.td}>{(t.quality * 100).toFixed(0)}%</td>
                    <td style={styles.td}>
                      <div style={styles.statusGroup}>
                        <span
                          style={{
                            ...styles.ackTag,
                            backgroundColor: t.acked ? '#064e3b' : '#7f1d1d',
                            color: t.acked ? '#6ee7b7' : '#fca5a5',
                          }}
                        >
                          {t.acked ? 'ACK' : 'UNACK'}
                        </span>
                        <span style={{ ...styles.classTag, color: assessedColor }}>
                          {assessedAbbr}
                        </span>
                        {t.engagementStatus !== 'none' && (
                          <span
                            style={{
                              ...styles.engageTag,
                              color: t.engagementStatus === 'engaged' ? '#f59e0b' : '#38bdf8',
                            }}
                          >
                            {t.engagementStatus.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0b111e',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  headerTitle: {
    padding: '8px 12px',
    backgroundColor: '#030712',
    borderBottom: '1px solid #1e293b',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.05em',
  },
  tableWrapper: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: '180px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'monospace',
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
    cursor: 'pointer',
    borderBottom: '1px solid #0f172a',
    transition: 'background-color 0.1s ease',
  },
  td: {
    padding: '7px 10px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
  },
  emptyCell: {
    padding: '24px 12px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  stateBadge: {
    border: '1px solid',
    borderRadius: '3px',
    padding: '1px 5px',
    fontSize: '10px',
    fontWeight: 600,
  },
  statusGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  ackTag: {
    padding: '1px 5px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 700,
  },
  classTag: {
    fontSize: '10px',
    fontWeight: 700,
  },
  engageTag: {
    fontSize: '10px',
    fontWeight: 700,
  },
};
