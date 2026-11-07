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

function getEventColor(event: SimEvent): string {
  const p = (event.payload || {}) as Record<string, unknown>;
  switch (event.type) {
    case 'TRACK_CONFIRMED':
      return '#15803d'; // Emerald
    case 'TRACK_IN_RANGE':
      return '#b45309'; // Amber range alert
    case 'TRACK_LOST':
      return '#58544e';
    case 'ENGAGEMENT_STARTED':
      return '#0284c7'; // Tactical Cyan
    case 'ENGAGEMENT_RESOLVED': {
      const res = String(p.result ?? p.resolution ?? '');
      if (res === 'hit') return '#15803d';
      if (res === 'no_effect') return '#b83327';
      return '#b45309';
    }
    case 'NO_EFFECT':
    case 'COMMAND_REJECTED':
    case 'ENGAGEMENT_REJECTED':
      return '#b83327'; // Soft Red
    case 'MISSION_END':
      return '#58544e'; // Slate
    default:
      return '#181716';
  }
}

function formatEffectorLabel(raw: unknown): string {
  const s = String(raw ?? 'effector').toLowerCase();
  if (s === 'jammer') return 'RF JAMMER';
  if (s === 'gun') return 'KINETIC GUN';
  if (s === 'missile') return 'SAM INTERCEPTOR';
  return s.toUpperCase();
}

function formatEventMessage(event: SimEvent): string {
  const p = (event.payload || {}) as Record<string, unknown>;
  const effLabel = formatEffectorLabel(p.effector ?? p.effectorType);
  switch (event.type) {
    case 'TRACK_CONFIRMED': {
      const brgPart = p.bearingDeg !== undefined ? ` (brg ${Math.round(Number(p.bearingDeg))}°)` : '';
      return `Track T${p.trackId} confirmed at ${Math.round(Number(p.rangeM) || 0)}m${brgPart}`;
    }
    case 'TRACK_IN_RANGE': {
      const envRange = String(p.effector) === 'gun' ? '1,000m' : '1,500m';
      return `Track T${p.trackId} entered ${effLabel} envelope (≤${envRange})`;
    }
    case 'TRACK_LOST':
      return `Track T${p.trackId} lost (radar return dropped)`;
    case 'ENGAGEMENT_STARTED': {
      const rangePart = p.rangeAtFire !== undefined ? ` at ${Math.round(Number(p.rangeAtFire))}m` : '';
      return `${effLabel} engaged Track T${p.trackId}${rangePart}`;
    }
    case 'ENGAGEMENT_RESOLVED': {
      const res = String(p.result ?? p.resolution ?? 'resolved').toLowerCase();
      if (res === 'hit') {
        return `${effLabel} neutralized Track T${p.trackId} (SPLASH / HIT)`;
      }
      if (res === 'no_effect') {
        return `${effLabel} cycle completed with NO EFFECT on Track T${p.trackId}`;
      }
      return `${effLabel} missed Track T${p.trackId} — target still active`;
    }
    case 'NO_EFFECT': {
      if (p.reason === 'terminal_lock_rf_immune') {
        return `${effLabel} ineffective on T${p.trackId}: autonomous optical lock (<800m) — switch to KINETIC GUN`;
      }
      return `${effLabel} had no effect on T${p.trackId} (non-RF / wire-guided airframe)`;
    }
    case 'COMMAND_REJECTED':
      return `Command rejected: ${String(p.reason || 'invalid action').replace(/_/g, ' ')}`;
    case 'ENGAGEMENT_REJECTED':
      return `Engagement rejected (${effLabel} on T${p.trackId}): ${String(p.reason || 'out of range or busy').replace(/_/g, ' ')}`;
    case 'MISSION_END': {
      const reasonText =
        p.reason === 'asset_hit'
          ? 'defended asset breached'
          : p.reason === 'all_resolved'
          ? 'all airspace contacts resolved'
          : p.reason === 'time_limit'
          ? 'sector patrol window complete'
          : String(p.reason ?? 'ended');
      return `Mission concluded — ${reasonText}`;
    }
    default:
      return `${event.type.replace(/_/g, ' ')}${p.trackId !== undefined ? ` (T${p.trackId})` : ''}`;
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
            const color = getEventColor(evt);
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
