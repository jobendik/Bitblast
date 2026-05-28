// Lobby Manager
// Handles matchmaking queue, party management, and game mode selection

import {
  GameModeInfo,
  MatchFoundData,
  QueueStatus,
  Party,
  LobbyEventType,
  DEFAULT_GAME_MODES,
} from './types';
import { getSocketIOPath } from '../config/network';

// Socket types for dynamic import
interface Socket {
  connected: boolean;
  emit: (event: string, data?: unknown) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback?: (...args: unknown[]) => void) => void;
}

/**
 * Lobby Manager - Handles matchmaking and social features
 */
export class LobbyManager {
  private socket: Socket | null = null;
  private serverUrl: string;
  private userId: string = '';

  // Queue state
  private isQueued: boolean = false;
  private currentModeId: string | null = null;
  private queueStartTime: number = 0;
  private queueTimer: number | null = null;

  // Match state
  private pendingMatch: MatchFoundData | null = null;

  // Party state
  private currentParty: Party | null = null;

  // Available modes
  private gameModes: GameModeInfo[] = [...DEFAULT_GAME_MODES];

  // Event callbacks
  private eventListeners: Map<LobbyEventType, Set<(data: unknown) => void>> = new Map();

  // Socket.IO reference
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private io: any = null;

  constructor(serverUrl: string = '/') {
    this.serverUrl = serverUrl;
  }

  /**
   * Connect to lobby server
   */
  public async connect(token: string): Promise<boolean> {
    if (this.socket?.connected) {
      return true;
    }

    this.userId = this.extractUserId(token);

    try {
      // Dynamic import for socket.io-client
      const socketIo = await import('socket.io-client');
      this.io = socketIo.io || (socketIo.default as any)?.io;

      if (!this.io) {
        throw new Error('socket.io-client not loaded');
      }

      const socketPath = getSocketIOPath();

      this.socket = this.io(this.serverUrl, {
        path: socketPath,
        auth: { token },
        transports: ['websocket'],
      }) as Socket;

      this.setupListeners();
      return true;
    } catch (error) {
      console.warn('Lobby connection failed:', error);
      return false;
    }
  }

  private extractUserId(token: string): string {
    const parts = token.split('-');
    return parts[parts.length - 1] || '0';
  }

  /**
   * Setup socket event listeners
   */
  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
    });

    this.socket.on('disconnect', () => {
      this.stopQueueTimer();
      this.isQueued = false;
    });

    this.socket.on('match_found', (data: unknown) => {
      const matchData = data as MatchFoundData;
      this.pendingMatch = matchData;
      this.isQueued = false;
      this.stopQueueTimer();
      this.emit(LobbyEventType.MATCH_FOUND, matchData);
    });

    this.socket.on('match_start', (data: unknown) => {
      this.pendingMatch = null;
      this.emit(LobbyEventType.MATCH_STARTING, data);
    });

    this.socket.on('match_cancelled', (data: unknown) => {
      this.pendingMatch = null;
      this.emit(LobbyEventType.MATCH_CANCELLED, data);
    });

    this.socket.on('party_update', (data: unknown) => {
      this.currentParty = data as Party;
      this.emit(LobbyEventType.PARTY_JOINED, data);
    });

    this.socket.on('party_disbanded', () => {
      this.currentParty = null;
      this.emit(LobbyEventType.PARTY_DISBANDED, null);
    });

    this.socket.on('invite_received', (data: unknown) => {
      this.emit(LobbyEventType.INVITE_RECEIVED, data);
    });
  }

  // ========== Queue Management ==========

  /**
   * Start matchmaking queue
   */
  public startQueue(modeId: string): boolean {
    if (!this.socket?.connected) {
      console.warn('Not connected to lobby server');
      return false;
    }

    // Validate mode
    const mode = this.gameModes.find(m => m.id === modeId);
    if (!mode || !mode.enabled) {
      console.warn('Invalid or disabled game mode:', modeId);
      return false;
    }

    // Check party constraints
    if (this.currentParty && this.currentParty.leaderId !== this.userId) {
      console.warn('Only party leader can start queue');
      return false;
    }

    this.isQueued = true;
    this.currentModeId = modeId;
    this.queueStartTime = Date.now();

    // Get username from localStorage if available
    const username = localStorage.getItem('bitblast_username') || `Player_${this.userId.slice(0, 4)}`;
    this.socket.emit('start_queue', { modeId, username });
    this.startQueueTimer();
    this.emit(LobbyEventType.QUEUE_STARTED, { modeId });

    return true;
  }

  /**
   * Cancel matchmaking queue
   */
  public cancelQueue(): void {
    if (!this.socket?.connected) return;

    this.socket.emit('cancel_queue');
    this.isQueued = false;
    this.currentModeId = null;
    this.stopQueueTimer();
    this.emit(LobbyEventType.QUEUE_CANCELLED, null);
  }

  /**
   * Get current queue status
   */
  public getQueueStatus(): QueueStatus {
    const mode = this.currentModeId ? this.gameModes.find(m => m.id === this.currentModeId) : null;
    
    return {
      isQueued: this.isQueued,
      modeId: this.currentModeId,
      queueTime: this.isQueued ? Math.floor((Date.now() - this.queueStartTime) / 1000) : 0,
      estimatedWait: mode?.estimatedWaitTime || 0,
    };
  }

  private startQueueTimer(): void {
    this.stopQueueTimer();
    this.queueTimer = window.setInterval(() => {
      this.emit(LobbyEventType.QUEUE_UPDATE, this.getQueueStatus());
    }, 1000);
  }

  private stopQueueTimer(): void {
    if (this.queueTimer !== null) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
  }

  // ========== Match Management ==========

  /**
   * Accept found match
   */
  public acceptMatch(): void {
    if (!this.socket?.connected || !this.pendingMatch) return;

    this.socket.emit('accept_match', { matchId: this.pendingMatch.id });
    this.emit(LobbyEventType.MATCH_ACCEPTED, this.pendingMatch);
  }

  /**
   * Decline found match
   */
  public declineMatch(): void {
    if (!this.socket?.connected || !this.pendingMatch) return;

    this.socket.emit('decline_match', { matchId: this.pendingMatch.id });
    this.pendingMatch = null;
    this.emit(LobbyEventType.MATCH_DECLINED, null);
  }

  /**
   * Get pending match
   */
  public getPendingMatch(): MatchFoundData | null {
    return this.pendingMatch;
  }

  // ========== Party Management ==========

  /**
   * Create a party
   */
  public createParty(): void {
    if (!this.socket?.connected) return;
    this.socket.emit('create_party');
  }

  /**
   * Invite player to party
   */
  public inviteToParty(playerId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('invite_to_party', { playerId });
  }

  /**
   * Join party by invite
   */
  public joinParty(partyId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('join_party', { partyId });
  }

  /**
   * Leave current party
   */
  public leaveParty(): void {
    if (!this.socket?.connected || !this.currentParty) return;
    this.socket.emit('leave_party');
    this.currentParty = null;
    this.emit(LobbyEventType.PARTY_LEFT, null);
  }

  /**
   * Get current party
   */
  public getParty(): Party | null {
    return this.currentParty;
  }

  /**
   * Check if user is party leader
   */
  public isPartyLeader(): boolean {
    return this.currentParty?.leaderId === this.userId;
  }

  // ========== Game Modes ==========

  /**
   * Get available game modes
   */
  public getGameModes(): GameModeInfo[] {
    return this.gameModes.filter(m => m.enabled);
  }

  /**
   * Get all game modes including disabled
   */
  public getAllGameModes(): GameModeInfo[] {
    return [...this.gameModes];
  }

  /**
   * Get game mode by ID
   */
  public getGameMode(modeId: string): GameModeInfo | undefined {
    return this.gameModes.find(m => m.id === modeId);
  }

  /**
   * Get modes by category
   */
  public getModesByCategory(category: string): GameModeInfo[] {
    return this.gameModes.filter(m => m.category === category && m.enabled);
  }

  // ========== Event System ==========

  /**
   * Subscribe to lobby event
   */
  public on(event: LobbyEventType, callback: (data: unknown) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit event to listeners
   */
  private emit(event: LobbyEventType, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  // ========== Getters ==========

  public getUserId(): string {
    return this.userId;
  }

  public isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  public isInQueue(): boolean {
    return this.isQueued;
  }

  // ========== Cleanup ==========

  public disconnect(): void {
    this.stopQueueTimer();
    
    if (this.socket) {
      this.socket.emit('disconnect');
      this.socket = null;
    }

    this.isQueued = false;
    this.currentModeId = null;
    this.pendingMatch = null;
    this.currentParty = null;
    this.eventListeners.clear();
  }
}
