import React, { useState, useRef, useEffect } from 'react';
import { TraineeEnvironmentView } from '../../sim/index.js';
import { NavMiniAsciiPreview } from '../components/NavMiniAsciiPreview.js';
import { TextRoll } from '../components/TextRoll.js';

export interface TopBarProps {
  tick: number;
  speed: 1 | 2 | 4;
  isPaused: boolean;
  autopilot: boolean;
  seed: string;
  phase: 'setup' | 'running' | 'ended';
  scenarioId?: string;
  environment?: TraineeEnvironmentView;
  onTogglePause: () => void;
  onSetSpeed: (speed: 1 | 2 | 4) => void;
  onToggleAutopilot: () => void;
}

function formatClock(tick: number): string {
  const totalSec = Math.floor(tick / 20);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TopBar({
  tick,
  speed,
  isPaused,
  autopilot,
  seed,
  phase,
  scenarioId,
  environment,
  onTogglePause,
  onSetSpeed,
  onToggleAutopilot,
}: TopBarProps): React.JSX.Element {
  const [activeDropdown, setActiveDropdown] = useState<'scenarios' | 'systems' | 'intel' | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinnedRef = useRef<boolean>(false);
  const navRef = useRef<HTMLElement>(null);

  const scTitle =
    scenarioId === 'ridge_runner'
      ? 'RIDGE RUNNER'
      : scenarioId === 'city_edge_night'
        ? 'CITY EDGE NIGHT'
        : 'DAWN INTRUSION';

  const envStr = environment
    ? `${environment.timeOfDay} · ${environment.weather} · Vis ${environment.visibilityKm}km · ${environment.terrainKind}`
    : null;

  const handleDropdownEnter = (menu: 'scenarios' | 'systems' | 'intel') => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (!isPinnedRef.current || activeDropdown === menu) {
      setActiveDropdown(menu);
    }
  };

  const handleDropdownLeave = () => {
    if (isPinnedRef.current) return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 280);
  };

  const handleDropdownToggleClick = (menu: 'scenarios' | 'systems' | 'intel') => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (activeDropdown === menu && isPinnedRef.current) {
      isPinnedRef.current = false;
      setActiveDropdown(null);
    } else {
      isPinnedRef.current = true;
      setActiveDropdown(menu);
    }
  };

  const handleCloseDropdown = () => {
    isPinnedRef.current = false;
    setActiveDropdown(null);
  };

  const handleSelectScenario = (scId: string) => {
    isPinnedRef.current = false;
    setActiveDropdown(null);
    window.dispatchEvent(new CustomEvent('mod:select-scenario', { detail: scId }));
    const el = document.getElementById('scenario-selection-card');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToBriefing = () => {
    isPinnedRef.current = false;
    setActiveDropdown(null);
    const el = document.getElementById('scenario-selection-card');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        isPinnedRef.current = false;
        setActiveDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        isPinnedRef.current = false;
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  return (
    <header style={styles.headerRoot}>
      {/* Luxury Integrated Navigation Bar — Part of the page background */}
      <nav ref={navRef} style={styles.mainNav}>
        {/* Left: Brand Identity */}
        <div style={styles.brandGroup}>
          <a href="#/" style={styles.brandLink}>
            <div style={styles.brandIconBox}>
              <span style={styles.brandCrosshair}>✛</span>
            </div>
            <div style={styles.brandTextCol}>
              <span style={styles.brandName}>MoD // AIR DEFENSE</span>
              <span style={styles.brandTagline}>COUNTER-UAS SIMULATOR</span>
            </div>
          </a>
        </div>

        {/* Center: Luxury Mega-Menu Nav Items */}
        <div style={styles.navCenter}>
          {/* Tab 1: Scenarios */}
          <div
            className="nav-mega-item"
            onMouseEnter={() => handleDropdownEnter('scenarios')}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              className={`nav-mega-btn ${activeDropdown === 'scenarios' ? 'is-active' : ''}`}
              onClick={() => handleDropdownToggleClick('scenarios')}
            >
              <span>SCENARIOS</span>
              <span className="nav-mega-chevron">▾</span>
            </button>

            {/* Mega Dropdown Panel: Scenarios */}
            <div
              className={`mega-dropdown-panel ${activeDropdown === 'scenarios' ? 'is-open' : ''}`}
              onMouseEnter={() => {
                if (leaveTimerRef.current) {
                  clearTimeout(leaveTimerRef.current);
                  leaveTimerRef.current = null;
                }
              }}
              onMouseLeave={handleDropdownLeave}
            >
              <div className="mega-menu-grid">
                <div className="mega-menu-list">
                  <div className="mega-menu-card-item" onClick={() => handleSelectScenario('dawn_intrusion')}>
                    <div className="mega-menu-item-icon">🎯</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        Dawn Intrusion
                        <span style={styles.menuBadgeActive}>BASELINE</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        1 hostile FPV + civilian quad transit + avian clutter in rural dusk.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={() => handleSelectScenario('ridge_runner')}>
                    <div className="mega-menu-item-icon">⛰️</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        Ridge Runner
                        <span style={styles.menuBadgeTag}>MASKING</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        Terrain masking in hilly fog valleys with light electronic warfare.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={() => handleSelectScenario('city_edge_night')}>
                    <div className="mega-menu-item-icon">🏙️</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        City Edge Night
                        <span style={styles.menuBadgeTag}>HEAVY EW</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        High-altitude recon UAV + low strike drone in dense urban clutter.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Preview Card */}
                <div className="mega-preview-card">
                  <div className="mega-preview-header">
                    <span className="mega-preview-tag">SCENARIO INTELLIGENCE</span>
                    <span style={{ fontSize: '11px', color: '#ffe0cc', fontWeight: 700 }}>v2.4</span>
                  </div>
                  <NavMiniAsciiPreview modelType="terrain" />
                  <div>
                    <h4 className="mega-preview-title">Autonomous Mission Suite</h4>
                    <p className="mega-preview-text">
                      Three operational environments testing radar horizon line-of-sight, terrain
                      masking, and electronic counter-measures.
                    </p>
                  </div>
                  <button
                    onClick={scrollToBriefing}
                    style={styles.previewCardBtn}
                  >
                    SELECT SCENARIO ↓
                  </button>
                </div>
              </div>
            </div>
          </div>

          <span style={styles.navDivider}>|</span>

          {/* Tab 2: Defense Systems */}
          <div
            className="nav-mega-item"
            onMouseEnter={() => handleDropdownEnter('systems')}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              className={`nav-mega-btn ${activeDropdown === 'systems' ? 'is-active' : ''}`}
              onClick={() => handleDropdownToggleClick('systems')}
            >
              <span>DEFENSE SYSTEMS</span>
              <span className="nav-mega-chevron">▾</span>
            </button>

            {/* Mega Dropdown Panel: Systems */}
            <div
              className={`mega-dropdown-panel ${activeDropdown === 'systems' ? 'is-open' : ''}`}
              onMouseEnter={() => {
                if (leaveTimerRef.current) {
                  clearTimeout(leaveTimerRef.current);
                  leaveTimerRef.current = null;
                }
              }}
              onMouseLeave={handleDropdownLeave}
            >
              <div className="mega-menu-grid">
                <div className="mega-menu-list">
                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">📡</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">Pulse-Doppler Radar</span>
                      <span className="mega-menu-item-desc">
                        2D range-azimuth tracking with RCS-dependent Pd, noise & false alarms.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">⚡</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">Directional RF Jammer</span>
                      <span className="mega-menu-item-desc">
                        1,500m standoff RF link disruption for drone command & control.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">💥</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">Kinetic 30mm CIWS</span>
                      <span className="mega-menu-item-desc">
                        1,000m automated rapid-fire anti-air cannon with 20-round magazine.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">🛡️</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">TraineeView Isolation</span>
                      <span className="mega-menu-item-desc">
                        Cryptographically verified isolation with zero ground-truth leakage.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Preview Card */}
                <div className="mega-preview-card">
                  <div className="mega-preview-header">
                    <span className="mega-preview-tag">INTEGRATED C2 SUITE</span>
                    <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 800 }}>ARMED</span>
                  </div>
                  <NavMiniAsciiPreview modelType="radar" />
                  <div>
                    <h4 className="mega-preview-title">Layered Air Defense</h4>
                    <p className="mega-preview-text">
                      Multi-tier counter-UAS pairing non-kinetic RF interference at 1.5 km with
                      kinetic point-defense cannon at 1.0 km.
                    </p>
                  </div>
                  <a href="#/check" onClick={handleCloseDropdown} style={styles.previewCardLink}>
                    DIAGNOSTICS & VERIFY ↗
                  </a>
                </div>
              </div>
            </div>
          </div>

          <span style={styles.navDivider}>|</span>

          {/* Tab 3: Threat Intel */}
          <div
            className="nav-mega-item"
            onMouseEnter={() => handleDropdownEnter('intel')}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              className={`nav-mega-btn ${activeDropdown === 'intel' ? 'is-active' : ''}`}
              onClick={() => handleDropdownToggleClick('intel')}
            >
              <span>THREAT INTEL</span>
              <span className="nav-mega-chevron">▾</span>
            </button>

            {/* Mega Dropdown Panel: Intel */}
            <div
              className={`mega-dropdown-panel ${activeDropdown === 'intel' ? 'is-open' : ''}`}
              onMouseEnter={() => {
                if (leaveTimerRef.current) {
                  clearTimeout(leaveTimerRef.current);
                  leaveTimerRef.current = null;
                }
              }}
              onMouseLeave={handleDropdownLeave}
            >
              <div className="mega-menu-grid">
                <div className="mega-menu-list">
                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">🚀</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        FPV Kamikaze Drones
                        <span style={styles.menuBadgeAlert}>HOSTILE</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        Small RCS, high speed (&gt;20 m/s), fast closing rate, lethal direct impact.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">✈️</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">Reconnaissance UAV</span>
                      <span className="mega-menu-item-desc">
                        High altitude, steady linear trajectory, persistent surveillance payload.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">🚁</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">Commercial Quadcopters</span>
                      <span className="mega-menu-item-desc">
                        Low speed, civilian telemetry, non-hostile. -25 point penalty if engaged.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">🦅</div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">Avian Biologicals</span>
                      <span className="mega-menu-item-desc">
                        Migratory bird tracks with high turn rates. Non-threat clutter.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Preview Card */}
                <div className="mega-preview-card">
                  <div className="mega-preview-header">
                    <span className="mega-preview-tag">DOCTRINE & ROE</span>
                    <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 800 }}>STRICT</span>
                  </div>
                  <NavMiniAsciiPreview modelType="fpv" />
                  <div>
                    <h4 className="mega-preview-title">Rules of Engagement</h4>
                    <p className="mega-preview-text">
                      Maintain &gt;400m standoff defense. Rapid detection, timely classification,
                      and target discrimination govern scoring.
                    </p>
                  </div>
                  <button onClick={scrollToBriefing} style={styles.previewCardBtn}>
                    START INTERCEPTION ⚡
                  </button>
                </div>
              </div>
            </div>
          </div>

          <span style={styles.navDivider}>|</span>

          {/* Tab 4: Diagnostics Direct Link */}
          <div className="nav-mega-item">
            <a href="#/check" style={styles.navDirectLink}>
              <span>DIAGNOSTICS</span>
              <span style={{ fontSize: '10px', color: '#d4ff3f' }}>↗</span>
            </a>
          </div>
        </div>

        {/* Right: Contextual Telemetry & Controls */}
        <div style={styles.navRight}>
          {phase === 'setup' ? (
            <div style={styles.setupActionCluster}>
              <div style={styles.statusPulse}>
                <span style={styles.pulseDot} />
                <span style={styles.pulseText}>STANDBY</span>
              </div>

              <span style={styles.navDivider}>|</span>

              <a href="#/check" style={styles.sysCheckLink}>
                <TextRoll stagger={0.02}>System Check ↗</TextRoll>
              </a>

              <span style={styles.navDivider}>|</span>

              <div style={styles.scenarioActiveChip} title="Current Scenario Selection">
                <span style={styles.chipDot} />
                <span style={styles.chipText}>{scTitle}</span>
              </div>

              <div style={styles.seedDisplayPill} title="Deterministic Pseudo-Random Seed">
                <span style={styles.seedLabelText}>SEED:</span>
                <span style={styles.seedValueText}>{seed}</span>
              </div>
            </div>
          ) : (
            <div style={styles.runningActionCluster}>
              {/* Mission Scenario and Environment */}
              <div style={styles.missionTitle}>
                <TextRoll center stagger={0.03}>{scTitle}</TextRoll>
              </div>

              {envStr && (
                <div style={styles.envChipBadge}>
                  {envStr}
                </div>
              )}

              <span style={styles.navDivider}>|</span>

              {/* Mission Clock */}
              <div style={styles.clockBox} id="missionClock">
                <span style={styles.clockLabel}>TICK</span>
                <span style={styles.clockValue} id="missionTick">{tick}</span>
                <span style={styles.clockLabel}>TIME</span>
                <span style={styles.timeValue} id="missionTime">{formatClock(tick)}</span>
              </div>

              {/* Seed Badge */}
              <div style={styles.seedBadge}>
                <span style={styles.seedLabel}>SEED:</span>
                <span style={styles.seedValue}>{seed}</span>
              </div>

              {/* Speed Buttons */}
              <div style={styles.buttonGroup}>
                <button
                  id="btn-speed-1"
                  onClick={() => onSetSpeed(1)}
                  style={speed === 1 ? styles.speedActive : styles.speedButton}
                >
                  <TextRoll center>1x</TextRoll>
                </button>
                <button
                  id="btn-speed-2"
                  onClick={() => onSetSpeed(2)}
                  style={speed === 2 ? styles.speedActive : styles.speedButton}
                >
                  <TextRoll center>2x</TextRoll>
                </button>
                <button
                  id="btn-speed-4"
                  onClick={() => onSetSpeed(4)}
                  style={speed === 4 ? styles.speedActive : styles.speedButton}
                >
                  <TextRoll center>4x</TextRoll>
                </button>
              </div>

              {/* Pause Button */}
              <button
                id="btn-toggle-pause"
                onClick={onTogglePause}
                style={styles.pauseButton}
              >
                <TextRoll center>{isPaused ? '▶ RESUME' : '⏸ PAUSE'}</TextRoll>
              </button>

              {/* Autopilot Button */}
              <button
                id="btn-toggle-autopilot"
                onClick={onToggleAutopilot}
                style={autopilot ? styles.autopilotActive : styles.autopilotButton}
              >
                <TextRoll center>{autopilot ? '🤖 AUTOPILOT: ON' : '🤖 AUTOPILOT: OFF'}</TextRoll>
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRoot: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'transparent',
    border: 'none',
    position: 'relative',
    zIndex: 100,
    width: '100%',
  },
  mainNav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    backgroundColor: 'transparent',
    border: 'none',
    maxWidth: '1440px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    gap: '16px',
    flexWrap: 'wrap',
  },
  navDivider: {
    color: 'rgba(45, 40, 35, 0.25)',
    fontSize: '13px',
    padding: '0 2px',
    userSelect: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  statusPulse: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  pulseDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#526f0f',
    boxShadow: '0 0 6px rgba(82, 111, 15, 0.4)',
  },
  pulseText: {
    color: '#526f0f',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    fontFamily: 'monospace',
  },
  sysCheckLink: {
    color: '#6b518c',
    textDecoration: 'none',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  brandGroup: {
    display: 'flex',
    alignItems: 'center',
  },
  brandLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    textDecoration: 'none',
  },
  brandIconBox: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: '#eae5dc',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
  },
  brandCrosshair: {
    color: '#181716',
    fontSize: '16px',
    fontWeight: 900,
  },
  brandTextCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  brandName: {
    color: '#181716',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    fontFamily: 'monospace',
  },
  brandTagline: {
    color: '#6b518c',
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    fontFamily: 'monospace',
  },
  navCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navDirectLink: {
    color: '#58544e',
    textDecoration: 'none',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '8px 12px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.18s ease',
  },
  menuBadgeActive: {
    fontSize: '9px',
    padding: '1px 6px',
    borderRadius: '3px',
    backgroundColor: '#ffffff',
    border: '1px solid #ffffff',
    color: '#b84414',
    fontWeight: 800,
  },
  menuBadgeTag: {
    fontSize: '9px',
    padding: '1px 6px',
    borderRadius: '3px',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    border: '1px solid rgba(255, 255, 255, 0.28)',
    color: '#ffffff',
    fontWeight: 700,
  },
  menuBadgeAlert: {
    fontSize: '9px',
    padding: '1px 6px',
    borderRadius: '3px',
    backgroundColor: '#ffffff',
    border: '1px solid #ffffff',
    color: '#a31f13',
    fontWeight: 800,
  },
  previewCardBtn: {
    padding: '9px 14px',
    backgroundColor: '#ffffff',
    color: '#b84414',
    border: 'none',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 800,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    boxShadow: '0 3px 12px rgba(0, 0, 0, 0.25)',
    marginTop: '6px',
  },
  previewCardLink: {
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
    textDecoration: 'none',
    textAlign: 'center',
    marginTop: '6px',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
  },
  setupActionCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  scenarioActiveChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#eae5dc',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    borderRadius: '6px',
    padding: '6px 10px',
  },
  chipDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#526f0f',
  },
  chipText: {
    color: '#181716',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  seedDisplayPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#eae5dc',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  seedLabelText: {
    color: '#6b518c',
  },
  seedValueText: {
    color: '#181716',
    fontWeight: 600,
  },
  runningActionCluster: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  missionTitle: {
    color: '#181716',
    fontWeight: 800,
    fontSize: '14px',
    letterSpacing: '0.06em',
    fontFamily: 'monospace',
  },
  envChipBadge: {
    backgroundColor: '#eae5dc',
    border: '1px solid rgba(107, 81, 140, 0.3)',
    color: '#6b518c',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  clockBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#eae5dc',
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    fontFamily: 'monospace',
  },
  clockLabel: {
    color: '#78746c',
    fontSize: '10px',
    fontWeight: 600,
  },
  clockValue: {
    color: '#181716',
    fontSize: '13px',
    fontWeight: 700,
  },
  timeValue: {
    color: '#526f0f',
    fontSize: '13px',
    fontWeight: 700,
  },
  seedBadge: {
    backgroundColor: '#eae5dc',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    fontSize: '11px',
    fontFamily: 'monospace',
    display: 'flex',
    gap: '6px',
  },
  seedLabel: {
    color: '#78746c',
  },
  seedValue: {
    color: '#181716',
    fontWeight: 600,
  },
  buttonGroup: {
    display: 'flex',
    backgroundColor: '#eae5dc',
    borderRadius: '4px',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    overflow: 'hidden',
  },
  speedButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#58544e',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  speedActive: {
    backgroundColor: '#181716',
    border: 'none',
    color: '#ded7ca',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 800,
    fontFamily: 'monospace',
    cursor: 'pointer',
    boxShadow: 'none',
  },
  pauseButton: {
    backgroundColor: '#eae5dc',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    color: '#181716',
    padding: '6px 14px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  autopilotButton: {
    backgroundColor: '#eae5dc',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    color: '#58544e',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  autopilotActive: {
    backgroundColor: '#181716',
    border: '1px solid #181716',
    color: '#ded7ca',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
};
