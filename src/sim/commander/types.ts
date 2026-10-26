import { EwLevel } from '../model/environment.js';
import { ScenarioSpawnSchedule } from '../scenarios/dawnIntrusion.js';

export type CommanderTier = 'recruit' | 'operator' | 'veteran' | 'elite';
export type RoePosture = 'tight' | 'standard' | 'free';
export type MissileAuth = 'hold' | 'asset_threat' | 'free';
export type CommsStatus = 'nominal' | 'degraded' | 'offline';

export interface SiteLinkState {
  status: CommsStatus;
  latencyTicks: number;
}

export interface PendingCommanderCommand {
  type: CommanderCommand['type'];
  siteId: string;
  dispatchTick: number;
  deliveryTick: number;
  payload: Record<string, unknown>;
}

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
  commands: Array<{
    tick: number;
    dispatchTick?: number;
    deliveryTick?: number | null;
    siteId?: string;
    type: string;
    payload: Record<string, unknown>;
    rejected?: boolean;
    reason?: string;
  }>;
  totalTicks: number;
}

export type CommanderCommand =
  | { type: 'ALLOCATE'; tick: number; dispatchTick?: number; deliveryTick?: number; payload: { siteId: string; gunAmmo: number; missiles: number } }
  | { type: 'SET_ROE'; tick: number; dispatchTick?: number; deliveryTick?: number; payload: { siteId: string; roe: RoePosture } }
  | { type: 'SET_MISSILE_AUTH'; tick: number; dispatchTick?: number; deliveryTick?: number; payload: { siteId: string; auth: MissileAuth } }
  | { type: 'RETASK_RESERVE'; tick: number; dispatchTick?: number; deliveryTick?: number; payload: { toSiteId: string; item: 'gunAmmo' | 'missiles'; amount: number } };

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
  linkStatus: CommsStatus;
  linkState: SiteLinkState;
  latencyTicks: number;
  dataAgeTicks: number;
  operatorView: import('../view/traineeView.js').TraineeView;
}

export interface CommanderView {
  tick: number;
  raidId: string;
  sites: CommanderSiteView[];
  totalPool: RaidPlan['totalPool'];
  intel: SiteIntel[];
  pendingTransfers: Array<{ toSiteId: string; item: 'gunAmmo' | 'missiles'; amount: number; dueTick: number }>;
  pendingCommands: PendingCommanderCommand[];
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

