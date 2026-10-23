import React, { useMemo } from 'react';
import { SimEvent } from '../../sim/index.js';

export interface EventFeedProps {
  events: readonly SimEvent[];
}

function formatClock(tick: number): string {
  const totalSec = Math.floor(tick / 20);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getEventColor(type: string): string {
  switch (type) {
    case 'TRACK_CONFIRMED':
      return '#34d399'; // Emerald
    case 'TRACK_LOST':
      return '#64748b';
    case 'ENGAGEMENT_STARTED':
      return '#38bdf8'; // Tactical Cyan
    case 'ENGAGEMENT_RESOLVED':
      return '#34d399'; // Emerald
    case 'NO_EFFECT':
      return '#fb7185'; // Soft Red
    case 'COMMAND_REJECTED':
    case 'ENGAGEMENT_REJECTED':
      return '#fb7185'; // Soft Red
    case 'MISSION_END':
      return '#94a3b8'; // Slate
    default:
      return '#cbd5e1';
  }
}

function formatEventMessage(event: SimEvent): string {
  const p = (event.payload || {}) as Record<string, unknown>;
  switch (event.type) {
    case 'TRACK_CONFIRMED':
      return `Track T${p.trackId} confirmed at ${Math.round(Number(p.rangeM) || 0)}m (brg ${Math.round(Number(p.bearingDeg) || 0)}°)`;
    case 'TRACK_LOST':
      return `Track T${p.trackId} lost (radar signal dropped)`;
    case 'ENGAGEMENT_STARTED':
      return `Effector ${p.effectorType} engaged against track T${p.trackId}`;
    case 'ENGAGEMENT_RESOLVED':
      return `Engagement ${p.resolution} for effector ${p.effectorType} on track T${p.trackId}`;
    case 'NO_EFFECT':
      return `Effector ${p.effectorType} had no effect on track T${p.trackId} (${p.reason || 'non-RF target'})`;
    case 'COMMAND_REJECTED':
      return `Command rejected: ${p.reason || 'invalid action'}`;
    case 'ENGAGEMENT_REJECTED':
      return `Engagement rejected: ${p.reason || 'out of range or busy'}`;
    case 'MISSION_END':
      return `Mission concluded: reason = ${p.reason}`;
    default:
      return `${event.type}: ${JSON.stringify(event.payload || {})}`;
  }
}

export function EventFeed({ events }: EventFeedProps): React.JSX.Element {
  // Newest first
  const reversedEvents = useMemo(() => {
    return [...events].reverse();
  }, [events]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>MISSION EVENT LOG ({events.length})</div>
      <div style={styles.list}>
        {reversedEvents.length === 0 ? (
          <div style={styles.empty}>No events logged yet.</div>
        ) : (
          reversedEvents.map((evt, idx) => {
            const color = getEventColor(evt.type);
            return (
              <div key={idx} style={styles.item}>
                <span style={styles.time}>{formatClock(evt.tick)}</span>
                <span style={{ ...styles.typeTag, color }}>[{evt.type}]</span>
                <span style={styles.msg}>{formatEventMessage(evt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0c1015',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontFamily: 'ui-monospace, monospace',
    height: '100%',
    minHeight: '220px',
  },
  header: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#f8fafc',
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '8px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflowY: 'auto',
    maxHeight: '260px',
    fontSize: '11px',
  },
  empty: {
    color: '#64748b',
    fontSize: '11px',
    fontStyle: 'italic',
    padding: '14px 0',
  },
  item: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    lineHeight: '1.4',
  },
  time: {
    color: '#64748b',
    fontWeight: 600,
    fontSize: '9.5px',
  },
  typeTag: {
    fontWeight: 700,
    fontSize: '10px',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  },
  msg: {
    color: '#cbd5e1',
  },
};
