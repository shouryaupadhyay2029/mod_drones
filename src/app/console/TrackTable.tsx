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
                    <td style={{ ...styles.td, color: '#d4ff3f', fontWeight: 700 }}>
                      T{t.trackId}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.stateBadge,
                          color: t.state === 'confirmed' ? '#d4ff3f' : '#cbb3e8',
                          borderColor: t.state === 'confirmed' ? 'rgba(212, 255, 63, 0.5)' : 'rgba(203, 179, 232, 0.3)',
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
                        color: t.velocityValid && t.closingRateMps !== undefined && t.closingRateMps < -2 ? '#e34234' : '#cbd5e1',
                      }}
                    >
                      {t.velocityValid && t.closingRateMps !== undefined ? `${Math.round(t.closingRateMps)} m/s` : '—'}
                    </td>
                    <td style={styles.td}>{t.rcsBucket}</td>
                    <td style={styles.td}>{(t.quality * 100).toFixed(0)}%</td>
                    <td style={styles.td}>
                      {t.rfStatus === 'emitting' ? (
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>EMIT</span>
                      ) : t.rfStatus === 'silent' ? (
                        <span style={{ color: '#94a3b8' }}>silent</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.statusGroup}>
                        <span
                          style={{
                            ...styles.ackTag,
                            backgroundColor: t.acked ? 'rgba(212, 255, 63, 0.16)' : 'rgba(227, 66, 52, 0.2)',
                            color: t.acked ? '#d4ff3f' : '#e34234',
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
                              color: t.engagementStatus === 'engaged' ? '#d4ff3f' : '#cbb3e8',
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
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  headerTitle: {
    padding: '8px 12px',
    backgroundColor: '#0c0c0e',
    borderBottom: '1px solid #262626',
    color: '#d4ff3f',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
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
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    textAlign: 'left',
    padding: '8px 10px',
    color: '#cbb3e8',
    fontSize: '10px',
    fontWeight: 600,
    borderBottom: '1px solid #262626',
    whiteSpace: 'nowrap',
    backgroundColor: '#0c0c0e',
  },
  tr: {
    cursor: 'pointer',
    borderBottom: '1px solid #1f1f1f',
    transition: 'background-color 0.15s ease',
  },
  td: {
    padding: '7px 10px',
    color: '#f4f4f5',
    whiteSpace: 'nowrap',
  },
  emptyCell: {
    padding: '24px 12px',
    textAlign: 'center',
    color: '#71717a',
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
