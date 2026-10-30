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
import '../console/forkPractice.css';
import '../console/tactical-console.css';

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
    forkContext,
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
    <div className={`console-layout${phase === 'ended' ? ' is-debrief' : ''}`}>
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

      {forkContext && <ForkPracticeBanner forkContext={forkContext} />}

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
              scenarioId={scenarioId}
            />

            <TrackTable
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              onSelectTrack={selectTrack}
            />

            {/* Mil-Spec Tactile Hotkeys Legend Strip */}
            <div className="mil-hotkeys-strip" role="toolbar" aria-label="Console Hotkeys">
              <div className="mil-hotkeys-group">
                <span className="mil-hotkeys-kicker">TARGETING</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">Tab</kbd> Next</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">N</kbd> Unclass</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">Esc</kbd> Deselect</span>
              </div>

              <div className="mil-hotkeys-group">
                <span className="mil-hotkeys-kicker">ACTIONS</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">A</kbd> Ack</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">Shift+A</kbd> All</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">1-7, 0</kbd> Classify</span>
              </div>

              <div className="mil-hotkeys-group">
                <span className="mil-hotkeys-kicker">EFFECTORS</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">J</kbd> Jammer</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">G</kbd> Gun</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">H</kbd> Hold</span>
              </div>

              <div className="mil-hotkeys-group">
                <span className="mil-hotkeys-kicker">OPTRONICS</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">E</kbd> Lock EO</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">T</kbd> TV/IR</span>
              </div>

              <div className="mil-hotkeys-group">
                <span className="mil-hotkeys-kicker">SIM</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">Space</kbd> Pause</span>
                <span className="mil-hotkey-item"><kbd className="mil-keycap">+/-</kbd> Speed</span>
              </div>
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

function formatForkTime(tick: number): string {
  const seconds = Math.floor(tick / 20);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ForkPracticeBanner({ forkContext }: { forkContext: { parentId: string; parentLabel: string; tick: number } }): React.JSX.Element {
  return <div className="fork-practice-banner" role="status">
    <strong>FORK of {forkContext.parentLabel} at {formatForkTime(forkContext.tick)}</strong>
    <span>Hindsight practice, not scored toward your record.</span>
    <button type="button" onClick={() => { window.location.hash = `#/aar/session/${encodeURIComponent(forkContext.parentId)}`; }}>BACK TO REVIEW</button>
  </div>;
}
