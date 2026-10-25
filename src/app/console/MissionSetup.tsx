import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AdaptiveSession, deriveSkillStates, generateScenario, recommendNext, Tier } from '../../sim/index.js';
import { createLocalId, ensureGuestProfile, listSessions, listTrainees, listUnits, saveTrainee, saveUnit, TraineeRecord, UnitRecord } from '../storage/db.js';
import { DroneHeroSection } from '../components/DroneHeroSection.js';
import { VajraAboutSection } from '../components/VajraAboutSection.js';
import '../styles/about.css';
import { TextRoll } from '../components/TextRoll.js';
import { useLenisScrollRoot } from '../hooks/useLenisScrollRoot.js';
import './training-setup.css';

export interface MissionSetupProps {
  onStart: (seed: string, scenarioId?: string, options?: { traineeId?: string; unitId?: string; avoidFingerprints?: string[] }) => void;
}

interface ScenarioOption {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  chips: string[];
}

const SCENARIO_OPTIONS: ScenarioOption[] = [
  {
    id: 'dawn_intrusion',
    title: 'Dawn Intrusion',
    subtitle: 'Standard Baseline Scenario',
    description:
      'Single hostile FPV ingress with civilian quadcopter transit and avian clutter in rural conditions.',
    chips: ['Rural', 'Clear', 'Dusk', 'EW: None'],
  },
  {
    id: 'ridge_runner',
    title: 'Ridge Runner',
    subtitle: 'Terrain Masking & Low Visibility',
    description:
      'Dual hostile FPV ingress utilizing terrain ridge masking in hilly fog conditions with light EW.',
    chips: ['Hilly', 'Fog', 'Vis 2km', 'Dusk', 'EW: Light'],
  },
  {
    id: 'city_edge_night',
    title: 'City Edge Night',
    subtitle: 'Dense Urban Clutter & Heavy EW',
    description:
      'High-altitude reconnaissance UAV and low-altitude fast strike drone in dense urban clutter with rain and heavy EW.',
    chips: ['Urban', 'Rain', 'Vis 5km', 'Night', 'EW: Heavy'],
  },
];

function generateRandomSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return 's1';
}

export function MissionSetup({ onStart }: MissionSetupProps): React.JSX.Element {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  useLenisScrollRoot(scrollRootRef);
  const [selectedScenario, setSelectedScenario] = useState<string>('dawn_intrusion');
  const [proceduralTier, setProceduralTier] = useState<Tier>('operator');
  const [seedInput, setSeedInput] = useState<string>(() => generateRandomSeed());
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [trainees, setTrainees] = useState<TraineeRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof listSessions>>>([]);
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [newCallsign, setNewCallsign] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [profileMessage, setProfileMessage] = useState('');

  useEffect(() => {
    let active = true;
    const loadProfiles = async () => {
      try {
        const guest = await ensureGuestProfile();
        const [nextTrainees, nextUnits, nextSessions] = await Promise.all([listTrainees(), listUnits(), listSessions()]);
        if (!active) return;
        setTrainees(nextTrainees);
        setUnits(nextUnits);
        setSessions(nextSessions);
        setSelectedTraineeId((current) => current || guest.traineeId);
        setSelectedUnitId((current) => current || guest.unitId);
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : 'Local profile storage is unavailable.');
      }
    };
    void loadProfiles();
    const refresh = () => void loadProfiles();
    window.addEventListener('vajra:data-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('vajra:data-changed', refresh);
    };
  }, []);

  const traineeSessions = useMemo(
    () => sessions.filter((session) => !session.isFork && session.traineeId === selectedTraineeId),
    [sessions, selectedTraineeId]
  );
  const recommendation = useMemo(() => {
    const adaptiveSessions = [...traineeSessions].reverse() as AdaptiveSession[];
    const skillStates = deriveSkillStates(adaptiveSessions);
    const history = adaptiveSessions.map((session) => ({
      total: session.summary.total,
      assetHit: session.summary.assetHit,
      tier: session.tier,
      fingerprint: session.fingerprint,
    }));
    return recommendNext(skillStates, history);
  }, [traineeSessions]);

  const avoidedFingerprints = useMemo(
    () => traineeSessions.filter((session) => session.fingerprint).slice(0, 20).map((session) => session.fingerprint!),
    [traineeSessions]
  );

  const createTrainee = async () => {
    const callsign = newCallsign.trim();
    if (!callsign || !selectedUnitId) return;
    const record: TraineeRecord = { id: createLocalId(), callsign, unitId: selectedUnitId, createdAt: Date.now() };
    await saveTrainee(record);
    setTrainees((current) => [...current, record]);
    setSelectedTraineeId(record.id);
    setNewCallsign('');
    setProfileMessage(`Trainee ${callsign} added.`);
    window.dispatchEvent(new Event('vajra:data-changed'));
  };

  const createUnit = async () => {
    const name = newUnitName.trim();
    if (!name) return;
    const record: UnitRecord = { id: createLocalId(), name, createdAt: Date.now() };
    await saveUnit(record);
    setUnits((current) => [...current, record]);
    setSelectedUnitId(record.id);
    setNewUnitName('');
    setProfileMessage(`Unit ${name} added.`);
    window.dispatchEvent(new Event('vajra:data-changed'));
  };

  const handleUnitSelect = (unitId: string) => {
    setSelectedUnitId(unitId);
    const trainee = trainees.find((item) => item.id === selectedTraineeId);
    if (trainee && unitId !== trainee.unitId) {
      const updated = { ...trainee, unitId };
      setTrainees((current) => current.map((item) => item.id === updated.id ? updated : item));
      void saveTrainee(updated).then(() => window.dispatchEvent(new Event('vajra:data-changed')));
    }
  };

  const startRecommended = () => {
    const clean = seedInput.trim() || 's1';
    onStart(clean, `proc:v1:${recommendation.tier}:${recommendation.focus}`, {
      traineeId: selectedTraineeId,
      unitId: selectedUnitId,
      avoidFingerprints: avoidedFingerprints,
    });
  };

  const procPreview = useMemo(() => {
    if (selectedScenario !== 'procedural') return null;
    try {
      const cleanSeed = seedInput.trim() || 's1';
      const scenario = generateScenario(cleanSeed, proceduralTier);
      const env = scenario.environment;
      const chips = [
        env.terrainKind.toUpperCase(),
        env.weather.toUpperCase(),
        `VIS ${env.visibilityKm}KM`,
        env.timeOfDay.toUpperCase(),
        `EW: ${env.ewLevel === 'heavy' ? 'HEAVY' : env.ewLevel === 'light' ? 'LIGHT' : 'NONE'}`,
      ];
      const swarmSizeLine =
        proceduralTier === 'recruit'
          ? 'Expected swarm size: low'
          : proceduralTier === 'operator'
            ? 'Expected swarm size: moderate'
            : proceduralTier === 'veteran'
              ? 'Expected swarm size: substantial'
              : 'Expected swarm size: severe (multi-axis swarm + pop-up)';
      return {
        chips,
        swarmSizeLine,
        description: `Procedurally generated ${proceduralTier} tier engagement. Dynamic terrain, weather, and adversarial threat formations with seeded jitter. ${swarmSizeLine}.`,
      };
    } catch {
      return {
        chips: ['DYNAMIC', '4 TIERS', 'SWARMS'],
        swarmSizeLine: 'Expected swarm size: moderate',
        description: 'Procedurally generated threat simulation with dynamic tactical formations.',
      };
    }
  }, [selectedScenario, seedInput, proceduralTier]);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<string | undefined>;
      if (
        customEvent.detail &&
        ['dawn_intrusion', 'ridge_runner', 'city_edge_night', 'procedural'].includes(
          customEvent.detail
        )
      ) {
        setSelectedScenario(customEvent.detail);
      }
      setIsModalOpen(true);
    };

    const handleClose = () => setIsModalOpen(false);

    window.addEventListener('mod:select-scenario', handleOpen);
    window.addEventListener('mod:open-briefing', handleOpen);
    window.addEventListener('mod:close-briefing', handleClose);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mod:select-scenario', handleOpen);
      window.removeEventListener('mod:open-briefing', handleOpen);
      window.removeEventListener('mod:close-briefing', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleRandomize = () => {
    setSeedInput(generateRandomSeed());
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    const clean = seedInput.trim() || 's1';
    const targetScenarioId = selectedScenario === 'procedural' ? `proc:v1:${proceduralTier}:none` : selectedScenario;
    onStart(clean, targetScenarioId, {
      traineeId: selectedTraineeId,
      unitId: selectedUnitId,
      avoidFingerprints: avoidedFingerprints,
    });
  };

  const activeScenario =
    selectedScenario === 'procedural'
      ? {
          id: 'procedural',
          title: `Procedural Swarm (${proceduralTier.toUpperCase()})`,
          subtitle: 'Multi-Tier Procedural Adversary Generator',
          description: procPreview?.description ?? 'Procedural adversary swarm simulation.',
          chips: procPreview?.chips ?? ['DYNAMIC', 'SWARMS'],
        }
      : SCENARIO_OPTIONS.find((s) => s.id === selectedScenario) || SCENARIO_OPTIONS[0]!;

  return (
    <div ref={scrollRootRef} style={styles.container} data-scroll-root="" tabIndex={0}>
      <div data-lenis-content="">
      {/* 1. Viewport-Sticky Companion 3D ASCII Drone Layer */}
      <div className="hero-drone-layer" style={styles.stickyDroneLayer} aria-hidden="true">
        <DroneHeroSection />
      </div>

      {/* 2. Scroll Spacer for the Hero view so page starts at the top */}
      <div className="mission-hero-backdrop" style={styles.heroScrollSpacer}>
        <div className="vj-scroll-cue" aria-hidden="true">
          <span>SCROLL</span>
          <i />
        </div>
      </div>

      {/* 3. Scroll story: What is VAJRA? */}
      <VajraAboutSection />

      {/* Tactical Mission Briefing Modal Overlay (Triggered from Navbar or Hero) */}
      <div
        className={`briefing-modal-overlay ${isModalOpen ? 'is-open' : ''}`}
        style={{
          display: isModalOpen ? 'flex' : 'none',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsModalOpen(false);
        }}
      >
        <div id="scenario-selection-card" style={styles.cardModal} className="briefing-modal-card" data-lenis-prevent="">
          <div style={styles.modalHeaderRow}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <img src="/vajra-emblem.png" alt="VAJRA" style={{ width: '18px', height: '20px', opacity: 0.85 }} />
              <div style={styles.missionTag}>VAJRA // MISSION BRIEFING</div>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="modal-close-button"
              aria-label="Close Briefing"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          <div style={styles.header}>
            <h2 style={styles.title}>
              <TextRoll center stagger={0.025}>{activeScenario.title}</TextRoll>
            </h2>
            <p style={styles.subtitle}>
              Autonomous Asset Defense • Radar Surveillance & Threat Interception
            </p>
          </div>

          {/* Scenario Selection Cards */}
          <div style={styles.scenarioList}>
            {SCENARIO_OPTIONS.map((sc) => {
              const isSelected = sc.id === selectedScenario;
              return (
                <div
                  key={sc.id}
                  className={`briefing-scenario-card${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedScenario(sc.id)}
                  style={{
                    ...styles.scenarioCard,
                    borderColor: isSelected ? '#181716' : 'rgba(45, 40, 35, 0.18)',
                    backgroundColor: isSelected ? '#f2ece0' : '#ded8cd',
                    boxShadow: isSelected ? '0 3px 12px rgba(0, 0, 0, 0.08)' : 'none',
                  }}
                >
                  <div style={styles.scenarioCardHeader}>
                    <input
                      type="radio"
                      name="scenarioPicker"
                      checked={isSelected}
                      onChange={() => setSelectedScenario(sc.id)}
                      style={{ cursor: 'pointer', accentColor: '#181716' }}
                    />
                    <span style={styles.scenarioCardTitle}>
                      <TextRoll stagger={0.02}>{sc.title}</TextRoll>
                    </span>
                  </div>
                  <div style={styles.scenarioCardSubtitle}>{sc.subtitle}</div>
                  <div style={styles.chipsRow}>
                    {sc.chips.map((chip, idx) => (
                      <span key={idx} style={styles.chipTag}>
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Procedural Card below the scripted 3 */}
            <div
              key="procedural"
              id="card-procedural"
              className={`briefing-scenario-card${selectedScenario === 'procedural' ? ' is-selected' : ''}`}
              onClick={() => setSelectedScenario('procedural')}
              style={{
                ...styles.scenarioCard,
                borderColor: selectedScenario === 'procedural' ? '#181716' : 'rgba(45, 40, 35, 0.18)',
                backgroundColor: selectedScenario === 'procedural' ? '#f2ece0' : '#ded8cd',
                boxShadow: selectedScenario === 'procedural' ? '0 3px 12px rgba(0, 0, 0, 0.08)' : 'none',
              }}
            >
              <div style={styles.scenarioCardHeader}>
                <input
                  type="radio"
                  id="radio-procedural"
                  name="scenarioPicker"
                  checked={selectedScenario === 'procedural'}
                  onChange={() => setSelectedScenario('procedural')}
                  style={{ cursor: 'pointer', accentColor: '#181716' }}
                />
                <span style={styles.scenarioCardTitle}>
                  <TextRoll stagger={0.02}>Procedural Swarm</TextRoll>
                </span>
              </div>
              <div style={styles.scenarioCardSubtitle}>Dynamic Multi-Tier Procedural Adversary</div>

              <div
                style={{
                  marginTop: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <label
                  htmlFor="tierSelect"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#181716',
                    fontFamily: 'monospace',
                  }}
                >
                  TIER:
                </label>
                <select
                  id="tierSelect"
                  value={proceduralTier}
                  onChange={(e) => setProceduralTier(e.target.value as Tier)}
                  style={styles.tierSelect}
                >
                  <option value="recruit">Recruit</option>
                  <option value="operator">Operator</option>
                  <option value="veteran">Veteran</option>
                  <option value="elite">Elite</option>
                </select>
              </div>

              <div style={styles.chipsRow}>
                {(selectedScenario === 'procedural' && procPreview?.chips
                  ? procPreview.chips
                  : ['DYNAMIC', '4 TIERS', 'SWARMS']
                ).map((chip, idx) => (
                  <span key={idx} style={styles.chipTag}>
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="briefing-box" style={styles.briefingBox}>
            <h3 style={styles.briefingHeading}>SITUATION REPORT</h3>
            <p style={styles.briefingText}>{activeScenario.description}</p>
            {selectedScenario === 'procedural' && procPreview?.swarmSizeLine && (
              <div
                style={{
                  marginBottom: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#181716',
                  fontFamily: 'monospace',
                }}
              >
                {procPreview.swarmSizeLine}
              </div>
            )}
            <ul style={styles.briefingList}>
              <li>
                <strong>Detect & Acknowledge:</strong> Swiftly acknowledge incoming radar tracks
                (under 3.0s latency for full marks).
              </li>
              <li>
                <strong>Classify:</strong> Assess kinematics, closing rate, altitude, and radar cross
                section (RCS) to classify bird, civilian quadcopter, hostile FPV, recon UAV, or clutter.
              </li>
              <li>
                <strong>Decide & Engage:</strong> Neutralize confirmed hostile threats with Jammer
                (&le;1.5km) or Gun (&le;1.0km). Exercise strict fire discipline for non-hostiles and clutter blips.
              </li>
            </ul>
          </div>

          <section className="training-profile-panel" aria-label="Trainee and unit selection">
            <div className="training-panel-heading"><div><span>TRAINING RECORD</span><h3>Who is taking this session?</h3></div><small>Stored locally</small></div>
            <div className="training-profile-grid">
              <label>TRAINEE
                <select value={selectedTraineeId} onChange={(event) => {
                  const traineeId = event.target.value;
                  setSelectedTraineeId(traineeId);
                  const trainee = trainees.find((item) => item.id === traineeId);
                  if (trainee) setSelectedUnitId(trainee.unitId);
                }}>
                  {trainees.map((trainee) => <option key={trainee.id} value={trainee.id}>{trainee.callsign}{trainee.callsign === 'Guest' ? ' · Guest' : ''}</option>)}
                </select>
              </label>
              <label>UNIT
                <select value={selectedUnitId} onChange={(event) => handleUnitSelect(event.target.value)}>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
            </div>
            <div className="training-create-row">
              <input aria-label="New trainee callsign" value={newCallsign} onChange={(event) => setNewCallsign(event.target.value)} placeholder="New callsign" maxLength={40} />
              <button type="button" onClick={() => void createTrainee()} disabled={!newCallsign.trim() || !selectedUnitId}>ADD TRAINEE</button>
              <input aria-label="New unit name" value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} placeholder="New unit name" maxLength={60} />
              <button type="button" onClick={() => void createUnit()} disabled={!newUnitName.trim()}>ADD UNIT</button>
            </div>
            {profileMessage && <p className="training-inline-status" aria-live="polite">{profileMessage}</p>}
          </section>

          <section className="recommended-next-card" aria-label="Recommended next training mission">
            <div className="training-panel-heading"><div><span>ADAPTIVE SELECTION</span><h3>Recommended next</h3></div><strong>{recommendation.tier.toUpperCase()} / {recommendation.focus.toUpperCase()}</strong></div>
            <ul>{recommendation.rationale.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <button type="button" onClick={startRecommended}>START RECOMMENDED SESSION ↗</button>
          </section>

          <form onSubmit={handleStart} style={styles.form}>
            <div style={styles.inputGroup}>
              <label htmlFor="missionSeed" style={styles.label}>
                SIMULATION SEED
              </label>
              <div style={styles.inputRow}>
                <input
                  id="missionSeed"
                  type="text"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  style={styles.input}
                  placeholder="Enter seed (e.g. s1, 42, delta-9)"
                />
                <button
                  type="button"
                  onClick={handleRandomize}
                  style={styles.buttonRandom}
                >
                  🎲 <TextRoll stagger={0.02}>Random</TextRoll>
                </button>
              </div>
              <span style={styles.hint}>
                Same seed always generates the exact same radar noise and flight paths.
              </span>
            </div>

            <button type="submit" id="btn-start-mission" style={styles.buttonStart}>
              <TextRoll center duration={0.32} stagger={0.025}>START MISSION</TextRoll>
            </button>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'block',
    flex: 1,
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    overflowX: 'hidden',
    overflowY: 'auto',
    width: '100%',
    height: '100%',
    minHeight: 0,
    position: 'relative',
    outline: 'none',
  },
  stickyDroneLayer: {
    position: 'fixed',
    top: '68px',
    left: 0,
    width: 'calc(100vw - 12px)',
    height: 'calc(100vh - 68px)',
    pointerEvents: 'none',
    zIndex: 10,
    overflow: 'hidden',
  },
  heroScrollSpacer: {
    width: '100%',
    height: 'calc(100vh - 68px)',
    minHeight: 'calc(100vh - 68px)',
    pointerEvents: 'auto',
    position: 'relative',
  },
  modalHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingBottom: '2px',
  },
  cardModal: {
    width: '100%',
    maxWidth: '860px',
    backgroundColor: '#e7e2d6',
    border: '1px solid rgba(45, 40, 35, 0.22)',
    borderRadius: '12px',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: '860px',
    backgroundColor: '#e7e2d6',
    border: '1px solid rgba(45, 40, 35, 0.16)',
    borderRadius: '10px',
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 20px 40px rgba(45, 40, 35, 0.08)',
    marginTop: '28px',
  },
  header: {
    borderBottom: '1px solid rgba(45, 40, 35, 0.14)',
    paddingBottom: '12px',
  },
  missionTag: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#6b518c',
    letterSpacing: '0.1em',
    marginBottom: '4px',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '22px',
    fontWeight: 700,
    color: '#181716',
    letterSpacing: '0.02em',
  },
  subtitle: {
    margin: 0,
    fontSize: '12px',
    color: '#635e57',
  },
  scenarioList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
    gap: '10px',
  },
  scenarioCard: {
    border: '1px solid',
    borderRadius: '6px',
    padding: '10px 12px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    transition: 'all 0.15s ease',
  },
  scenarioCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  scenarioCardTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#181716',
  },
  scenarioCardSubtitle: {
    fontSize: '10px',
    color: '#635e57',
    marginLeft: '24px',
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '6px',
    marginLeft: '24px',
  },
  chipTag: {
    fontSize: '9px',
    backgroundColor: '#eae5dc',
    color: '#526f0f',
    border: '1px solid rgba(82, 111, 15, 0.25)',
    padding: '2px 5px',
    borderRadius: '3px',
    fontWeight: 600,
  },
  briefingBox: {
    backgroundColor: '#ded8cd',
    border: '1px solid rgba(45, 40, 35, 0.14)',
    borderRadius: '6px',
    padding: '12px 16px',
  },
  briefingHeading: {
    margin: '0 0 6px 0',
    fontSize: '11px',
    fontWeight: 700,
    color: '#526f0f',
    letterSpacing: '0.08em',
  },
  briefingText: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    lineHeight: '1.4',
    color: '#2d2b28',
  },
  briefingList: {
    margin: 0,
    paddingLeft: '18px',
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#4a4742',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#6b518c',
    letterSpacing: '0.05em',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#eae5dc',
    border: '1px solid rgba(45, 40, 35, 0.2)',
    borderRadius: '6px',
    color: '#181716',
    fontSize: '13px',
    fontFamily: 'monospace',
    outline: 'none',
  },
  buttonRandom: {
    padding: '8px 14px',
    backgroundColor: '#ded8cd',
    border: '1px solid rgba(45, 40, 35, 0.25)',
    borderRadius: '6px',
    color: '#181716',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  hint: {
    fontSize: '11px',
    color: '#78746c',
    fontStyle: 'italic',
  },
  buttonStart: {
    padding: '12px 18px',
    backgroundColor: '#181716',
    color: '#ded7ca',
    border: '1px solid #181716',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.16)',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    marginTop: '4px',
  },
  tierSelect: {
    backgroundColor: '#ded8cd',
    border: '1px solid rgba(45, 40, 35, 0.25)',
    borderRadius: '4px',
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#181716',
    fontFamily: 'monospace',
    cursor: 'pointer',
    outline: 'none',
  },
};
