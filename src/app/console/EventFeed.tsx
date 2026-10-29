import React, { useMemo } from 'react';
import { SimEvent } from '../../sim/index.js';
import './tactical-console.css';

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
      return '#15803d'; // Emerald
    case 'TRACK_LOST':
      return '#58544e';
    case 'ENGAGEMENT_STARTED':
      return '#0284c7'; // Tactical Cyan
    case 'ENGAGEMENT_RESOLVED':
      return '#15803d'; // Emerald
    case 'NO_EFFECT':
      return '#b83327'; // Soft Red
    case 'COMMAND_REJECTED':
    case 'ENGAGEMENT_REJECTED':
      return '#b83327'; // Soft Red
    case 'MISSION_END':
      return '#58544e'; // Slate
    default:
      return '#181716';
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
    <div className="mil-panel" style={{ minHeight: '180px' }}>
      <div className="mil-header">
        <div className="mil-header-left">
          <span className="mil-led mil-led-green" />
          <span className="mil-kicker">// SYS.04</span>
          <span className="mil-title">MISSION EVENT LOG ({events.length})</span>
        </div>
        <span className="mil-tag mil-tag-neutral">STREAMING</span>
      </div>

      <div className="mil-teleprinter-list">
        {reversedEvents.length === 0 ? (
          <div style={{ color: '#58544e', fontSize: '10.5px', fontStyle: 'italic', padding: '14px 0', textAlign: 'center' }}>
            Awaiting combat telemetry events...
          </div>
        ) : (
          reversedEvents.map((evt, idx) => {
            const color = getEventColor(evt.type);
            return (
              <div key={idx} className="mil-teleprinter-item">
                <span className="mil-teleprinter-time">{formatClock(evt.tick)}</span>
                <span className="mil-teleprinter-tag" style={{ color }}>[{evt.type}]</span>
                <span className="mil-teleprinter-msg">{formatEventMessage(evt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
