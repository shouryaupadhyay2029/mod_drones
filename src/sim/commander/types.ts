import { EwLevel } from '../model/environment.js';
import { ScenarioSpawnSchedule } from '../scenarios/dawnIntrusion.js';

export type CommanderTier = 'recruit' | 'operator' | 'veteran' | 'elite';
export type RoePosture = 'tight' | 'standard' | 'free';
export type MissileAuth = 'hold' | 'asset_threat' | 'free';

export interface CommanderSite {
  id: string;
  name: string;
  valueUnits: number;
  mapPosKm: { x: number; y: number };
  inventory: { gunAmmo: number; missiles: number };
  roe: RoePosture;
  missileAuth: MissileAuth;
}

export interface RaidPlan {
  id: string;
  seed: string | number;
  tier: CommanderTier;
  sites: CommanderSite[];
  schedules: Record<string, ScenarioSpawnSchedule[]>;
  siteNeeds: Record<string, { gunAmmo: number; missiles: number }>;
  scarcity: number;
  totalPool: { gunAmmo: number; missiles: number; reserve: { gunAmmo: number; missiles: number } };
  mainEffortSiteId: string;
  feintSiteIds: string[];
  ewLevel: EwLevel;
  fingerprint: string;
}

export interface SiteIntel {
  siteId: string;
  threatBand: 'low' | 'med' | 'high';
}

export interface CommanderLog {
  formatVersion: 1;
  raidId: string;
  seed: string | number;
  tier: CommanderTier;
  commands: Array<{ tick: number; siteId?: string; type: string; payload: Record<string, unknown> }>;
  totalTicks: number;
}

export type CommanderCommand =
  | { type: 'ALLOCATE'; tick: number; payload: { siteId: string; gunAmmo: number; missiles: number } }
  | { type: 'SET_ROE'; tick: number; payload: { siteId: string; roe: RoePosture } }
  | { type: 'SET_MISSILE_AUTH'; tick: number; payload: { siteId: string; auth: MissileAuth } }
  | { type: 'RETASK_RESERVE'; tick: number; payload: { toSiteId: string; item: 'gunAmmo' | 'missiles'; amount: number } };

export interface CommanderSiteView {
  siteId: string;
  valueUnits: number;
  threatBand: 'low' | 'med' | 'high';
  status: 'green' | 'amber' | 'red';
  confirmedInboundCount: number;
  inventory: { gunAmmo: number; missiles: number };
  allocated: { gunAmmo: number; missiles: number };
  lastEngagementResult?: string;
  damagePercent: number;
  reportLatencyTicks: number;
  operatorView: import('../view/traineeView.js').TraineeView;
}

export interface CommanderView {
  tick: number;
  raidId: string;
  sites: CommanderSiteView[];
  totalPool: RaidPlan['totalPool'];
  intel: SiteIntel[];
  pendingTransfers: Array<{ toSiteId: string; item: 'gunAmmo' | 'missiles'; amount: number; dueTick: number }>;
}

export interface SiteRunReport {
  siteId: string;
  damagePercent: number;
  attackerCostDestroyed: number;
  preventedDamageUnits: number;
  defenderSpend: number;
  defenderSpendByEffector: { gun: number; jammer: number; missile: number };
  hits: number;
  falseEngagements: number;
  causes: string[];
  scoreSessionV2: import('../scoring/doctrine.js').ScoreReportV2;
}

export interface RaidScoreReport {
  scoreVersion: 'raid-1.1';
  total: number;
  grade: 'Unsatisfactory' | 'Marginal' | 'Competent' | 'Proficient';
  subscores: { assetPreservation: number; costExchange: number; resourceManagement: number; commandDiscipline: number };
  sites: SiteRunReport[];
  costLedger: { attackerDestroyed: number; preventedDamageUnits: number; defenderSpent: number; defenderSpendByEffector: { gun: number; jammer: number; missile: number }; cer: number };
  decisionCauses: string[];
  commandTimeline: CommanderLog['commands'];
  missionAssetValue: number;
}

