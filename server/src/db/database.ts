import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  User, Organization, Plan, Subscription, Invoice, Sport, 
  Tournament, RegistrationLink, Team, Player, RegistrationPayment, 
  RegistrationReceipt, Venue, Match, FootballMatchState, CricketMatchState, 
  Standing, Sponsor, Advertisement, Announcement, AuditLog, PlatformSettings,
  Auction, AuctionPlayer, PlayerStats
} from '../types.js';
import { getInitialSeedData } from './seedData.js';

export interface DatabaseSchema {
  users: User[];
  organizations: Organization[];
  plans: Plan[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  sports: Sport[];
  tournaments: Tournament[];
  registration_links: RegistrationLink[];
  teams: Team[];
  players: Player[];
  registration_payments: RegistrationPayment[];
  registration_receipts: RegistrationReceipt[];
  venues: Venue[];
  matches: Match[];
  football_matches: FootballMatchState[];
  cricket_matches: CricketMatchState[];
  standings: Standing[];
  sponsors: Sponsor[];
  advertisements: Advertisement[];
  announcements: Announcement[];
  auctions: Auction[];
  auction_players: AuctionPlayer[];
  player_stats: PlayerStats[];
  audit_logs: AuditLog[];
  platform_settings: PlatformSettings;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'sports_saas.json');

class Database {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDataDir();
    this.data = this.loadData();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData(): DatabaseSchema {
    const seed = getInitialSeedData();
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const merged: DatabaseSchema = {
          ...seed,
          ...parsed,
          auctions: (parsed.auctions && parsed.auctions.length > 0) ? parsed.auctions : seed.auctions,
          auction_players: (parsed.auction_players && parsed.auction_players.length > 0) ? parsed.auction_players : seed.auction_players,
          player_stats: (parsed.player_stats && parsed.player_stats.length > 0) ? parsed.player_stats : seed.player_stats,
        };
        return merged;
      } catch (err) {
        console.error('Failed to parse database file, resetting to seed data:', err);
      }
    }
    this.saveDataImmediate(seed);
    return seed;
  }

  public resetToSeed(): DatabaseSchema {
    const seed = getInitialSeedData();
    this.data = seed;
    this.saveDataImmediate(seed);
    return this.data;
  }

  private saveDataImmediate(dataToSave: DatabaseSchema) {
    this.ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
  }

  public save() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveDataImmediate(this.data);
    }, 100);
  }

  public get users() { return this.data.users; }
  public get organizations() { return this.data.organizations; }
  public get plans() { return this.data.plans; }
  public get subscriptions() { return this.data.subscriptions; }
  public get invoices() { return this.data.invoices; }
  public get sports() { return this.data.sports; }
  public get tournaments() { return this.data.tournaments; }
  public get registration_links() { return this.data.registration_links; }
  public get teams() { return this.data.teams; }
  public get players() { return this.data.players; }
  public get registration_payments() { return this.data.registration_payments; }
  public get registration_receipts() { return this.data.registration_receipts; }
  public get venues() { return this.data.venues; }
  public get matches() { return this.data.matches; }
  public get football_matches() { return this.data.football_matches; }
  public get cricket_matches() { return this.data.cricket_matches; }
  public get standings() { return this.data.standings; }
  public get sponsors() { return this.data.sponsors; }
  public get advertisements() { return this.data.advertisements; }
  public get announcements() { return this.data.announcements; }
  public get auctions() { if (!this.data.auctions) this.data.auctions = []; return this.data.auctions; }
  public get auction_players() { if (!this.data.auction_players) this.data.auction_players = []; return this.data.auction_players; }
  public get player_stats() { if (!this.data.player_stats) this.data.player_stats = []; return this.data.player_stats; }
  public get audit_logs() { return this.data.audit_logs; }
  public get platform_settings() { return this.data.platform_settings; }

  public logAudit(log: Omit<AuditLog, 'id' | 'created_at'>) {
    const newLog: AuditLog = {
      ...log,
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      created_at: new Date().toISOString()
    };
    this.data.audit_logs.unshift(newLog);
    // Keep max 2000 logs
    if (this.data.audit_logs.length > 2000) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 2000);
    }
    this.save();
    return newLog;
  }
}

export const db = new Database();
