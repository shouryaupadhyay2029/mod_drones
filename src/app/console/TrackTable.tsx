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
              <th style={styles.th}>RF</th>
              <th style={styles.th}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {sortedTracks.length === 0 ? (
              <tr>
                <td colSpan={12} style={styles.emptyCell}>
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
                      backgroundColor: isSelected ? 'rgba(203, 179, 232, 0.14)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #d4ff3f' : '3px solid transparent',
                    }}
                  >
                    <td style={{ ...styles.td, color: '#38bdf8', fontWeight: 700 }}>
                      T{t.trackId}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.stateBadge,
                          color: t.state === 'confirmed' ? '#34d399' : '#fbbf24',
                          borderColor: t.state === 'confirmed' ? 'rgba(52, 211, 153, 0.4)' : 'rgba(245, 158, 11, 0.3)',
                          backgroundColor: t.state === 'confirmed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
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
                        color: t.velocityValid && t.closingRateMps !== undefined && t.closingRateMps < -2 ? '#fb7185' : '#cbd5e1',
                      }}
                    >
                      {t.velocityValid && t.closingRateMps !== undefined ? `${Math.round(t.closingRateMps)} m/s` : '—'}
                    </td>
                    <td style={styles.td}>{t.rcsBucket}</td>
                    <td style={styles.td}>{(t.quality * 100).toFixed(0)}%</td>
                    <td style={styles.td}>
                      {t.rfStatus === 'emitting' ? (
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>EMIT</span>
                      ) : t.rfStatus === 'ambiguous' ? (
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>AMBIG</span>
                      ) : t.rfStatus === 'silent' ? (
                        <span style={{ color: '#64748b' }}>silent</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.statusGroup}>
                        <span
                          style={{
                            ...styles.ackTag,
                            backgroundColor: t.acked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.16)',
                            borderColor: t.acked ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
                            color: t.acked ? '#34d399' : '#fb7185',
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
                              color: t.engagementStatus === 'engaged' ? '#34d399' : '#fbbf24',
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
    backgroundColor: '#0c1015',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
    overflow: 'hidden',
  },
  headerTitle: {
    padding: '9px 14px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#f8fafc',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: '0.06em',
  },
  tableWrapper: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: '190px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '11.5px',
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    textAlign: 'left',
    padding: '8px 10px',
    color: '#64748b',
    fontSize: '9.5px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    whiteSpace: 'nowrap',
    backgroundColor: '#0c1015',
  },
  tr: {
    cursor: 'pointer',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    transition: 'background-color 0.15s ease',
  },
  td: {
    padding: '6px 10px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
  },
  emptyCell: {
    padding: '24px 12px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '11.5px',
    fontStyle: 'italic',
  },
  stateBadge: {
    border: '1px solid',
    borderRadius: '3px',
    padding: '1px 5px',
    fontSize: '9.5px',
    fontWeight: 600,
  },
  statusGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  ackTag: {
    border: '1px solid',
    padding: '1px 5px',
    borderRadius: '3px',
    fontSize: '9.5px',
    fontWeight: 700,
  },
  classTag: {
    fontSize: '10px',
    fontWeight: 700,
  },
  engageTag: {
    fontSize: '9.5px',
    fontWeight: 700,
  },
};
