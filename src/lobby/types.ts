// Lobby Types

/**
 * Available game modes for matchmaking
 */
export interface GameModeInfo {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  category: 'Arena' | 'Competitive' | 'Casual';
  estimatedWaitTime: number; // seconds
  enabled: boolean;
}

/**
 * Match found response
 */
export interface MatchFoundData {
  id: string;
  modeId: string;
  opponentIds: string[];
  gameUrl?: string;
}

/**
 * Queue status
 */
export interface QueueStatus {
  isQueued: boolean;
  modeId: string | null;
  queueTime: number;
  estimatedWait: number;
}

/**
 * Player info in lobby
 */
export interface LobbyPlayer {
  id: string;
  username: string;
  level: number;
  status: 'idle' | 'queued' | 'in_game';
  avatar?: string;
}

/**
 * Party data
 */
export interface Party {
  id: string;
  leaderId: string;
  members: LobbyPlayer[];
  maxSize: number;
}

/**
 * Lobby events
 */
export enum LobbyEventType {
  QUEUE_STARTED = 'queue_started',
  QUEUE_CANCELLED = 'queue_cancelled',
  QUEUE_UPDATE = 'queue_update',
  MATCH_FOUND = 'match_found',
  MATCH_ACCEPTED = 'match_accepted',
  MATCH_DECLINED = 'match_declined',
  MATCH_CANCELLED = 'match_cancelled',
  MATCH_STARTING = 'match_starting',
  PARTY_CREATED = 'party_created',
  PARTY_JOINED = 'party_joined',
  PARTY_LEFT = 'party_left',
  PARTY_DISBANDED = 'party_disbanded',
  FRIEND_ONLINE = 'friend_online',
  FRIEND_OFFLINE = 'friend_offline',
  INVITE_RECEIVED = 'invite_received',
}

/**
 * Default game modes available
 */
export const DEFAULT_GAME_MODES: GameModeInfo[] = [
  {
    id: 'ffa',
    name: 'Free For All',
    description: 'Every player for themselves. First to 30 kills wins.',
    minPlayers: 2,
    maxPlayers: 8,
    category: 'Arena',
    estimatedWaitTime: 15,
    enabled: true,
  },
  {
    id: 'tdm',
    name: 'Team Deathmatch',
    description: 'Red vs Blue. Team with most kills wins.',
    minPlayers: 4,
    maxPlayers: 12,
    category: 'Arena',
    estimatedWaitTime: 20,
    enabled: true,
  },
  {
    id: 'survival',
    name: 'Wave Survival',
    description: 'Survive endless waves of enemies.',
    minPlayers: 1,
    maxPlayers: 4,
    category: 'Casual',
    estimatedWaitTime: 5,
    enabled: true,
  },
  {
    id: 'ranked',
    name: 'Ranked Match',
    description: 'Competitive 5v5 with skill-based matchmaking.',
    minPlayers: 10,
    maxPlayers: 10,
    category: 'Competitive',
    estimatedWaitTime: 60,
    enabled: false, // Not implemented yet
  },
];
