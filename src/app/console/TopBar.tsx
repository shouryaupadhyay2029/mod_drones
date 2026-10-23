/* global setTimeout, clearTimeout */
import React, { useState, useRef, useEffect } from 'react';
import { TraineeEnvironmentView } from '../../sim/index.js';
import { NavMiniAsciiPreview } from '../components/NavMiniAsciiPreview.js';
import { TextRoll } from '../components/TextRoll.js';

// Minimalist High-Precision SVG Tactical Icons (replacing generic emojis)
function IconTarget(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function IconMountain(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20L10 6L16 16L18 13L21 20H3Z" />
      <path d="M8 12L10 14L13 9" />
    </svg>
  );
}

function IconCity(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21H21" />
      <path d="M5 21V7L11 3V21" />
      <path d="M11 11L19 7V21" />
      <line x1="8" y1="8" x2="8" y2="8.01" />
      <line x1="8" y1="12" x2="8" y2="12.01" />
      <line x1="8" y1="16" x2="8" y2="16.01" />
      <line x1="15" y1="12" x2="15" y2="12.01" />
      <line x1="15" y1="16" x2="15" y2="16.01" />
    </svg>
  );
}

function IconRadar(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 12L19 5" />
    </svg>
  );
}

function IconJammer(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12C2 6.5 6.5 2 12 2" />
      <path d="M5 12C5 8.1 8.1 5 12 5" />
      <path d="M8 12C8 9.8 9.8 8 12 8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 22C17.5 22 22 17.5 22 12" />
      <path d="M12 19C15.9 19 19 15.9 19 12" />
      <path d="M12 16C14.2 16 16 14.2 16 12" />
    </svg>
  );
}

function IconCiws(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="12" x2="12" y2="12" />
      <line x1="12" y1="8" x2="20" y2="8" />
      <line x1="12" y1="16" x2="20" y2="16" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="3" cy="12" r="1" />
    </svg>
  );
}

function IconShield(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22S4 18 4 12V5L12 2L20 5V12C20 18 12 22 12 22Z" />
      <path d="M9 12L11 14L15 10" />
    </svg>
  );
}

function IconFpv(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <line x1="5" y1="5" x2="9" y2="9" />
      <line x1="19" y1="5" x2="15" y2="9" />
      <line x1="5" y1="19" x2="9" y2="15" />
      <line x1="19" y1="19" x2="15" y2="15" />
      <circle cx="4" cy="4" r="2" />
      <circle cx="20" cy="4" r="2" />
      <circle cx="4" cy="20" r="2" />
      <circle cx="20" cy="20" r="2" />
    </svg>
  );
}

function IconRecon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15 8L22 10L16 14L18 21L12 17L6 21L8 14L2 10L9 8L12 2Z" />
    </svg>
  );
}

function IconQuad(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <line x1="7" y1="7" x2="17" y2="17" />
      <line x1="7" y1="17" x2="17" y2="7" />
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function IconBird(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13C6 9 9 9 12 13C15 9 18 9 21 13" />
      <path d="M7 16C9 14 11 14 12 15C13 14 15 14 17 16" />
    </svg>
  );
}

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

  const openBriefingModal = (scId?: string) => {
    isPinnedRef.current = false;
    setActiveDropdown(null);
    window.dispatchEvent(new CustomEvent('mod:open-briefing', { detail: scId }));
  };

  const handleSelectScenario = (scId: string) => {
    openBriefingModal(scId);
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
        <div style={styles.brandGroup} className="anim-curved-slide anim-delay-1">
          <a href="#/" style={styles.brandLink}>
            <div style={styles.brandIconBox}>
              <img
                src="/vajra-emblem.png"
                alt="VAJRA"
                style={{
                  width: '26px',
                  height: '28px',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
            <div style={styles.brandTextCol}>
              <span style={styles.brandName}>VAJRA</span>
            </div>
          </a>
        </div>

        {/* Center: Luxury Mega-Menu Nav Items */}
        <div style={styles.navCenter}>
          {/* Tab 1: Scenarios */}
          <div
            className="nav-mega-item anim-curved-slide anim-delay-2"
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
                    <div className="mega-menu-item-icon">
                      <IconTarget />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Dawn Intrusion</span>
                        <span style={styles.menuBadgeActive}>BASELINE</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        1 hostile FPV + civilian quad transit + avian clutter in rural dusk.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={() => handleSelectScenario('ridge_runner')}>
                    <div className="mega-menu-item-icon">
                      <IconMountain />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Ridge Runner</span>
                        <span style={styles.menuBadgeTag}>MASKING</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        Terrain masking in hilly fog valleys with light electronic warfare.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={() => handleSelectScenario('city_edge_night')}>
                    <div className="mega-menu-item-icon">
                      <IconCity />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>City Edge Night</span>
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
                    <span className="mega-preview-tag">
                      <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ffd480', boxShadow: '0 0 6px #ffd480' }} />
                      SCENARIO INTEL
                    </span>
                    <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.75)', fontFamily: 'monospace', fontWeight: 600 }}>v2.4 [LIVE]</span>
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
                    onClick={() => openBriefingModal()}
                    style={styles.previewCardBtn}
                  >
                    CONFIGURE & LAUNCH ⚡
                  </button>
                </div>
              </div>
            </div>
          </div>

          <span style={styles.navDivider}>|</span>

          {/* Tab 2: Defense Systems */}
          <div
            className="nav-mega-item anim-curved-slide anim-delay-3"
            onMouseEnter={() => handleDropdownEnter('systems')}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              className={`nav-mega-btn is-disabled ${activeDropdown === 'systems' ? 'is-active' : ''}`}
              onClick={() => handleDropdownToggleClick('systems')}
              style={{ opacity: 0.55 }}
              title="Defense Systems (Telemetry Offline - Informational Only)"
            >
              <span>DEFENSE SYSTEMS</span>
              <span
                style={{
                  fontSize: '9px',
                  marginLeft: '4px',
                  opacity: 0.7,
                  border: '1px solid rgba(0,0,0,0.2)',
                  padding: '0 3px',
                  borderRadius: '2px',
                }}
              >
                OFFLINE
              </span>
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
                    <div className="mega-menu-item-icon">
                      <IconRadar />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Pulse-Doppler Radar</span>
                        <span style={styles.menuBadgeTag}>20Hz SENSOR</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        2D range-azimuth tracking with RCS-dependent Pd, noise & false alarms.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">
                      <IconJammer />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Directional RF Jammer</span>
                        <span style={styles.menuBadgeTag}>1,500m SOFT KILL</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        1,500m standoff RF link disruption for drone command & control.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">
                      <IconCiws />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Kinetic 30mm CIWS</span>
                        <span style={styles.menuBadgeTag}>1,000m HARD KILL</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        1,000m automated rapid-fire anti-air cannon with 20-round magazine.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">
                      <IconShield />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>TraineeView Isolation</span>
                        <span style={styles.menuBadgeActive}>AIR-GAP</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        Cryptographically verified isolation with zero ground-truth leakage.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Preview Card */}
                <div className="mega-preview-card">
                  <div className="mega-preview-header">
                    <span className="mega-preview-tag">
                      <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d4ff3f', boxShadow: '0 0 6px #d4ff3f' }} />
                      INTEGRATED C2 SUITE
                    </span>
                    <span style={{ fontSize: '10px', color: '#d4ff3f', fontFamily: 'monospace', fontWeight: 700 }}>ARMED</span>
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
            className="nav-mega-item anim-curved-slide anim-delay-4"
            onMouseEnter={() => handleDropdownEnter('intel')}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              className={`nav-mega-btn is-disabled ${activeDropdown === 'intel' ? 'is-active' : ''}`}
              onClick={() => handleDropdownToggleClick('intel')}
              style={{ opacity: 0.55 }}
              title="Threat Intel (Database Offline - Informational Only)"
            >
              <span>THREAT INTEL</span>
              <span
                style={{
                  fontSize: '9px',
                  marginLeft: '4px',
                  opacity: 0.7,
                  border: '1px solid rgba(0,0,0,0.2)',
                  padding: '0 3px',
                  borderRadius: '2px',
                }}
              >
                OFFLINE
              </span>
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
                    <div className="mega-menu-item-icon">
                      <IconFpv />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>FPV Kamikaze Drones</span>
                        <span style={styles.menuBadgeAlert}>HOSTILE</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        Small RCS, high speed (&gt;20 m/s), fast closing rate, lethal direct impact.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">
                      <IconRecon />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Reconnaissance UAV</span>
                        <span style={styles.menuBadgeTag}>SURVEILLANCE</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        High altitude, steady linear trajectory, persistent surveillance payload.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">
                      <IconQuad />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Commercial Quadcopters</span>
                        <span style={styles.menuBadgeTag}>CIVILIAN</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        Low speed, civilian telemetry, non-hostile. -25 point penalty if engaged.
                      </span>
                    </div>
                  </div>

                  <div className="mega-menu-card-item" onClick={handleCloseDropdown}>
                    <div className="mega-menu-item-icon">
                      <IconBird />
                    </div>
                    <div className="mega-menu-item-body">
                      <span className="mega-menu-item-title">
                        <span>Avian Biologicals</span>
                        <span style={styles.menuBadgeTag}>CLUTTER</span>
                      </span>
                      <span className="mega-menu-item-desc">
                        Migratory bird tracks with high turn rates. Non-threat clutter.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Preview Card */}
                <div className="mega-preview-card">
                  <div className="mega-preview-header">
                    <span className="mega-preview-tag">
                      <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ffffff', boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)' }} />
                      DOCTRINE & ROE
                    </span>
                    <span style={{ fontSize: '10px', color: '#ffffff', fontFamily: 'monospace', fontWeight: 700 }}>STRICT</span>
                  </div>
                  <NavMiniAsciiPreview modelType="fpv" />
                  <div>
                    <h4 className="mega-preview-title">Rules of Engagement</h4>
                    <p className="mega-preview-text">
                      Maintain &gt;400m standoff defense. Rapid detection, timely classification,
                      and target discrimination govern scoring.
                    </p>
                  </div>
                  <button onClick={() => openBriefingModal()} style={styles.previewCardBtn}>
                    START INTERCEPTION ⚡
                  </button>
                </div>
              </div>
            </div>
          </div>

          <span style={styles.navDivider}>|</span>

          {/* Tab 4: Diagnostics Direct Link */}
          <div className="nav-mega-item anim-curved-slide anim-delay-5">
            <a href="#/check" style={styles.navDirectLink}>
              <span>DIAGNOSTICS</span>
              <span style={{ fontSize: '10px', color: '#d4ff3f' }}>↗</span>
            </a>
          </div>
        </div>

        {/* Right: Contextual Telemetry & Controls or Setup Launch Button */}
        <div style={styles.navRight}>
          {phase === 'setup' ? (
            <div style={styles.setupNavRight} className="anim-curved-slide anim-delay-5">
              <button
                id="btn-nav-launch-mission"
                className="nav-launch-cta-transparent"
                onClick={() => openBriefingModal()}
                title="Launch Mission Simulator"
              >
                <TextRoll center stagger={0.02}>LAUNCH MISSION</TextRoll>
              </button>
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
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                    display: 'inline-block',
                    marginRight: '2px',
                  }}
                />
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
    gap: '8px',
    textDecoration: 'none',
  },
  brandIconBox: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: '15px',
    fontWeight: 900,
    letterSpacing: '0.14em',
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
    padding: '2px 7px',
    borderRadius: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    border: '1px solid rgba(255, 255, 255, 0.45)',
    color: '#ffffff',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.08em',
  },
  menuBadgeTag: {
    fontSize: '9px',
    padding: '2px 7px',
    borderRadius: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: 'rgba(255, 240, 230, 0.88)',
    fontWeight: 600,
    fontFamily: 'monospace',
    letterSpacing: '0.08em',
  },
  menuBadgeAlert: {
    fontSize: '9px',
    padding: '2px 7px',
    borderRadius: '4px',
    backgroundColor: '#b83327',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    color: '#ffffff',
    fontWeight: 800,
    fontFamily: 'monospace',
    letterSpacing: '0.08em',
  },
  previewCardBtn: {
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    color: '#181716',
    border: '1px solid #ffffff',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 800,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.06em',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
    marginTop: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.18s ease',
  },
  previewCardLink: {
    padding: '10px 14px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.28)',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
    textDecoration: 'none',
    textAlign: 'center',
    marginTop: '6px',
    letterSpacing: '0.06em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.18s ease',
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
    gap: '10px',
    flexWrap: 'wrap',
  },
  missionTitle: {
    color: '#181716',
    fontWeight: 800,
    fontSize: '13px',
    letterSpacing: '0.06em',
    fontFamily: 'ui-monospace, monospace',
  },
  envChipBadge: {
    backgroundColor: 'rgba(45, 40, 35, 0.06)',
    border: '1px solid rgba(45, 40, 35, 0.15)',
    color: '#58544e',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  clockBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(45, 40, 35, 0.06)',
    padding: '3px 9px',
    borderRadius: '4px',
    border: '1px solid rgba(45, 40, 35, 0.15)',
    fontFamily: 'ui-monospace, monospace',
  },
  clockLabel: {
    color: '#78746c',
    fontSize: '9.5px',
    fontWeight: 600,
  },
  clockValue: {
    color: '#181716',
    fontSize: '12px',
    fontWeight: 700,
  },
  timeValue: {
    color: '#15803d',
    fontSize: '12px',
    fontWeight: 700,
  },
  seedBadge: {
    backgroundColor: 'rgba(45, 40, 35, 0.06)',
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(45, 40, 35, 0.15)',
    fontSize: '11px',
    fontFamily: 'ui-monospace, monospace',
    display: 'flex',
    gap: '5px',
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
    backgroundColor: 'rgba(45, 40, 35, 0.06)',
    borderRadius: '4px',
    border: '1px solid rgba(45, 40, 35, 0.15)',
    overflow: 'hidden',
  },
  speedButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#58544e',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
  },
  speedActive: {
    backgroundColor: '#181716',
    border: 'none',
    color: '#ffffff',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
    boxShadow: 'none',
  },
  pauseButton: {
    backgroundColor: 'rgba(45, 40, 35, 0.06)',
    border: '1px solid rgba(45, 40, 35, 0.15)',
    color: '#181716',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
  },
  autopilotButton: {
    backgroundColor: 'rgba(45, 40, 35, 0.06)',
    border: '1px solid rgba(45, 40, 35, 0.15)',
    color: '#58544e',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
  },
  autopilotActive: {
    backgroundColor: '#181716',
    border: '1px solid #181716',
    color: '#ffffff',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
  },
  setupNavRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  navLaunchDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#d35623',
    boxShadow: '0 0 6px #d35623',
    display: 'inline-block',
  },
};
