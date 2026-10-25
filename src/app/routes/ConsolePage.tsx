import React from 'react';
import { DebriefScreen } from '../console/DebriefScreen.js';
import { EffectorPanel } from '../console/EffectorPanel.js';
import { EoPanel } from '../console/EoPanel.js';
import { EventFeed } from '../console/EventFeed.js';
import { useHotkeys } from '../console/hotkeys.js';
import { MissionSetup } from '../console/MissionSetup.js';
import { RadarScope } from '../console/RadarScope.js';
import { TopBar } from '../console/TopBar.js';
import { TrackDetail } from '../console/TrackDetail.js';
import { TrackTable } from '../console/TrackTable.js';
import { useMission } from '../console/useMission.js';
import '../styles/console.css';

export function ConsolePage(): React.JSX.Element {
  const {
    phase,
    seed,
    scenarioId,
    speed,
    isPaused,
    autopilot,
    view,
    selectedTrackId,
    trailHistory,
    scoreReport,
    scoreReportV2,
    sessionLog,
    storageStatus,
    startMission,
    togglePause,
    setSpeedMultiplier,
    toggleAutopilot,
    selectTrack,
    acknowledgeTrack,
    classifyTrack,
    engageTrack,
    holdFireTrack,
    lockEoTrack,
    releaseEo,
    toggleEoChannel,
    resetToSetup,
  } = useMission();

  const tracks = view?.tracks || [];
  const selectedTrack = tracks.find((t) => t.trackId === selectedTrackId) || null;
  const currentTick = view?.tick || 0;
  const effectors = view?.effectors || {
    jammer: { busyUntilTick: 0 },
    gun: { ammo: 20, busyUntilTick: 0 },
  };
  const events = view?.events || [];
  const missionEnded = view?.missionState.ended || false;

  // Bind keyboard shortcuts
  useHotkeys({
    tracks,
    selectedTrackId,
    speed,
    isPaused,
    phase,
    onSelectTrack: selectTrack,
    onAcknowledge: acknowledgeTrack,
    onClassify: classifyTrack,
    onEngage: engageTrack,
    onHoldFire: holdFireTrack,
    onTogglePause: togglePause,
    onSetSpeed: setSpeedMultiplier,
    onToggleEoLock: () => {
      if (view?.eo.lockedTrackId !== undefined) {
        releaseEo();
      } else if (selectedTrackId !== null) {
        lockEoTrack(selectedTrackId);
      }
    },
    onToggleEoChannel: toggleEoChannel,
  });

  return (
    <div className="console-layout">
      {/* Top Bar is always visible */}
      <TopBar
        tick={currentTick}
        speed={speed}
        isPaused={isPaused}
        autopilot={autopilot}
        seed={seed}
        phase={phase}
        scenarioId={scenarioId}
        environment={view?.environment}
        onTogglePause={togglePause}
        onSetSpeed={setSpeedMultiplier}
        onToggleAutopilot={toggleAutopilot}
      />

      {/* Setup Phase */}
      {phase === 'setup' && <MissionSetup onStart={startMission} />}

      {/* Running Phase */}
      {phase === 'running' && (
        <div className="console-grid">
          {/* Left Column: Scope + Track Table + Hotkeys Legend */}
          <div className="radar-section">
            <RadarScope
              view={view}
              trailHistory={trailHistory}
              selectedTrackId={selectedTrackId}
              onSelectTrack={selectTrack}
            />

            <TrackTable
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              onSelectTrack={selectTrack}
            />

            {/* Hotkeys Legend */}
            <div className="hotkeys-legend">
              <span style={{ fontWeight: 700, color: '#38bdf8', letterSpacing: '0.06em' }}>HOTKEYS:</span>
              <span className="legend-item">
                <kbd className="legend-key">Tab</kbd> Next Track
              </span>
              <span className="legend-item">
                <kbd className="legend-key">N</kbd> Next Unclass
              </span>
              <span className="legend-item">
                <kbd className="legend-key">A</kbd> Ack
              </span>
              <span className="legend-item">
                <kbd className="legend-key">Shift+A</kbd> Ack All
              </span>
              <span className="legend-item">
                <kbd className="legend-key">1-7, 0</kbd> Classify
              </span>
              <span className="legend-item">
                <kbd className="legend-key">J</kbd> Jammer
              </span>
              <span className="legend-item">
                <kbd className="legend-key">G</kbd> Gun
              </span>
              <span className="legend-item">
                <kbd className="legend-key">H</kbd> Hold Fire
              </span>
              <span className="legend-item">
                <kbd className="legend-key">E</kbd> Lock EO
              </span>
              <span className="legend-item">
                <kbd className="legend-key">T</kbd> Toggle TV/IR
              </span>
              <span className="legend-item">
                <kbd className="legend-key">Space</kbd> Pause
              </span>
              <span className="legend-item">
                <kbd className="legend-key">+/-</kbd> Speed
              </span>
              <span className="legend-item">
                <kbd className="legend-key">Esc</kbd> Deselect
              </span>
            </div>
          </div>

          {/* Right Column: Track Detail Actions + EO Panel + Effectors + Events */}
          <div className="sidebar-section">
            <TrackDetail
              track={selectedTrack}
              currentTick={currentTick}
              effectors={effectors}
              missionEnded={missionEnded}
              onAcknowledge={acknowledgeTrack}
              onClassify={classifyTrack}
              onEngage={engageTrack}
              onHoldFire={holdFireTrack}
            />

            <EoPanel
              eo={
                view?.eo ?? {
                  state: 'idle',
                  channel: view?.environment.timeOfDay === 'night' ? 'ir' : 'tv',
                  level: 'none',
                  quality: 0,
                }
              }
              selectedTrackId={selectedTrackId}
              timeOfDay={view?.environment.timeOfDay}
              weather={view?.environment.weather}
              onLock={lockEoTrack}
              onRelease={releaseEo}
              onToggleChannel={toggleEoChannel}
            />

            <EffectorPanel effectors={effectors} currentTick={currentTick} />

            <EventFeed events={events} />
          </div>
        </div>
      )}

      {/* Debrief Phase */}
      {phase === 'ended' && scoreReport && (
        <DebriefScreen
          score={scoreReport}
          scoreV2={scoreReportV2 ?? undefined}
          sessionLog={sessionLog}
          storageStatus={storageStatus}
          seed={seed}
          scenarioId={scenarioId}
          environment={view?.environment}
          onReplaySameSeed={() => startMission(seed, scenarioId)}
          onNewRandomSeed={() => {
            const arr = new Uint8Array(4);
            crypto.getRandomValues(arr);
            const newSeed = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
            resetToSetup(newSeed);
          }}
        />
      )}
    </div>
  );
}
