import React, { useMemo } from 'react';
import { TraineeTrack } from '../../sim/index.js';
import { getAssessedAbbr, getAssessedColor } from './radar/drawScope.js';
import './tactical-console.css';

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
    <div className="mil-panel">
      <div className="mil-header">
        <div className="mil-header-left">
          <span className="mil-led mil-led-green" />
          <span className="mil-kicker">// SYS.00</span>
          <span className="mil-title">ACTIVE RADAR TRACKS ({tracks.length})</span>
        </div>
        <span className="mil-tag mil-tag-confirmed">20Hz PULSE-DOPPLER</span>
      </div>

      <div className="mil-table-wrapper" style={{ overflowY: 'auto', height: '175px' }}>
        <table className="mil-table">
          <thead>
            <tr>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>ID</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>STATE</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>RANGE</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>BEARING</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>COURSE</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>ALT</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>SPEED</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>CLOSING</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>RCS</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>QUAL</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>RF</th>
              <th className="mil-th" style={{ position: 'sticky', top: 0, zIndex: 2 }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {sortedTracks.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: '16px', textAlign: 'center', color: '#8c8275', fontStyle: 'italic' }}>
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
                    className="mil-tr"
                    style={{
                      backgroundColor: isSelected ? 'rgba(203, 179, 232, 0.14)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #c2410c' : '3px solid transparent',
                    }}
                  >
                    <td className="mil-td" style={{ color: '#f1ece1', fontWeight: 800 }}>
                      T{t.trackId}
                    </td>
                    <td className="mil-td">
                      <span
                        className="mil-tag"
                        style={{
                          fontSize: '8px',
                          padding: '1px 5px',
                          color: t.state === 'confirmed' ? '#34d399' : '#fbbf24',
                          borderColor: t.state === 'confirmed' ? 'rgba(52, 211, 153, 0.4)' : 'rgba(245, 158, 11, 0.3)',
                          backgroundColor: t.state === 'confirmed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        }}
                      >
                        {t.state.toUpperCase()}
                      </span>
                    </td>
                    <td className="mil-td">{Math.round(t.rangeM)} m</td>
                    <td className="mil-td">{Math.round(t.bearingDeg)}°</td>
                    <td className="mil-td">
                      {t.velocityValid && t.courseDeg !== undefined ? `${Math.round(t.courseDeg)}°` : '—'}
                    </td>
                    <td className="mil-td">{Math.round(t.altitudeM)} m</td>
                    <td className="mil-td">
                      {t.velocityValid && t.speedMps !== undefined ? `${Math.round(t.speedMps)} m/s` : '—'}
                    </td>
                    <td
                      className="mil-td"
                      style={{
                        color: t.velocityValid && t.closingRateMps !== undefined && t.closingRateMps < -2 ? '#fb7185' : '#d6cebf',
                      }}
                    >
                      {t.velocityValid && t.closingRateMps !== undefined ? `${Math.round(t.closingRateMps)} m/s` : '—'}
                    </td>
                    <td className="mil-td">{t.rcsBucket}</td>
                    <td className="mil-td">{(t.quality * 100).toFixed(0)}%</td>
                    <td className="mil-td">
                      {t.rfStatus === 'emitting' ? (
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>EMIT</span>
                      ) : t.rfStatus === 'ambiguous' ? (
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>AMBIG</span>
                      ) : t.rfStatus === 'silent' ? (
                        <span style={{ color: '#8c8275' }}>silent</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mil-td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span
                          className="mil-tag"
                          style={{
                            fontSize: '8px',
                            padding: '1px 5px',
                            backgroundColor: t.acked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            borderColor: t.acked ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                            color: t.acked ? '#34d399' : '#f87171',
                          }}
                        >
                          {t.acked ? 'ACK' : 'UNACK'}
                        </span>
                        <span
                          style={{
                            fontSize: '8.5px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            border: `1px solid ${assessedColor}44`,
                            backgroundColor: `${assessedColor}18`,
                            color: assessedColor,
                          }}
                        >
                          {assessedAbbr}
                        </span>
                        {t.engagementStatus !== 'none' && (
                          <span
                            className="mil-tag"
                            style={{
                              fontSize: '8px',
                              padding: '1px 5px',
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
