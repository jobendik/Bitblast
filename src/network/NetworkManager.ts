// Network Manager
// Handles multiplayer networking via Socket.IO

import * as THREE from 'three';
import {
  NetworkConfig,
  DEFAULT_NETWORK_CONFIG,
  NetworkMatchState,
} from './types';
import { RemotePlayer } from './RemotePlayer';
import { getSocketIOPath } from '../config/network';

// Socket.IO types (dynamic import for optional multiplayer)
interface Socket {
  connected: boolean;
  emit: (event: string, data?: unknown) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback?: (...args: unknown[]) => void) => void;
}

type IoFunction = (url: string, options?: any) => Socket;

/**
 * Network Manager - Handles all multiplayer networking
 * 
 * Features:
 * - Socket.IO connection management
 * - Player state synchronization
 * - Remote player management
 * - Kill/damage events
 * - Team management
 */
export class NetworkManager {
  private socket: Socket | null = null;
  private config: NetworkConfig;
  private scene: THREE.Scene;

  // Remote players
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private deadPlayers: Set<string> = new Set();
  // Cache for bot weapons to show correct weapon in killfeed
  private botWeapons: Map<string, string> = new Map();

  // Local player info
  public myUserId: string = '';
  public myTeam: string = '';
  public playerTeams: Map<string, string> = new Map();

  // Match state
  private matchId: string = '';
  private matchState: NetworkMatchState | null = null;
  // Track local player's current weapon
  public currentWeapon: string = 'AK47';

  // Update timing
  private lastUpdate: number = 0;

  // Event callbacks
  private onKillCallback?: (attackerId: string, victimId: string, weaponType: string) => void;
  private onDamageCallback?: (targetId: string, attackerId: string, damage: number) => void;
  private onMatchEndCallback?: (state: NetworkMatchState) => void;
  private onScoreUpdateCallback?: (state: NetworkMatchState) => void;
  private onLocalDeathCallback?: (attackerId: string, weaponType: string) => void;
  private onBulletImpactCallback?: (
    muzzlePos: THREE.Vector3,
    hitPos: THREE.Vector3,
    hitNormal: THREE.Vector3,
    material: string,
    hitEntity: boolean
  ) => void;
  private onChatMessageCallback?: (userId: string, username: string, message: string) => void;
  private onPlayerLeftCallback?: (userId: string) => void;
  private onPlayerJoinedCallback?: (userId: string, username: string) => void;
  private onSpawnAssignedCallback?: (position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) => void;

  // Bot event callbacks (server-authoritative bots)
  private onBotStatesCallback?: (states: Array<{
    id: string;
    oderId: string;
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    health: number;
    isAlive: boolean;
    animation: string;
    weaponType?: string | number;
  }>) => void;
  private onBotAttackCallback?: (botId: string, targetId: string, damage: number) => void;
  private onBotKilledCallback?: (botId: string, botUsername: string, killerId: string, weaponType: string) => void;
  private onBotRespawnedCallback?: (botId: string, position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) => void;

  // Assigned spawn position from server
  public assignedSpawnPosition: { x: number; y: number; z: number } | null = null;
  public assignedSpawnRotation: { x: number; y: number; z: number } | null = null;

  // Socket.IO reference (loaded dynamically)
  private io: IoFunction | null = null;

  private assetManager: any; // Store assetManager

  constructor(scene: THREE.Scene, assetManager: any, config?: Partial<NetworkConfig>) {
    this.scene = scene;
    this.assetManager = assetManager;
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
  }

  /**
   * Initialize network connection.
   * @param serverUrl - The server URL
   * @param token - The authentication token
   * @param matchId - The match ID
   * @param existingSocket - Optional existing socket to reuse (e.g., from lobby)
   */
  public async connect(serverUrl: string, token: string, matchId: string = 'default_match', existingSocket?: any): Promise<boolean> {
    // If we have an existing socket from the lobby, reuse it
    if (existingSocket && existingSocket.connected) {
      this.socket = existingSocket;
      this.matchId = matchId;
      this.myUserId = this.extractUserId(token);

      // Setup listeners on the existing socket
      this.setupListeners();

      // Emit join_match to ensure we're in the match room
      this.socket.emit('join_match', matchId);

      return true;
    }

    if (this.socket?.connected) {
      return true;
    }

    this.matchId = matchId;
    this.myUserId = this.extractUserId(token);

    try {
      // Dynamically import socket.io-client
      // @ts-ignore - socket.io-client is an optional dependency
      const socketIo: any = await import('socket.io-client');
      this.io = socketIo.io || socketIo.default?.io;

      if (!this.io) {
        throw new Error('socket.io-client not properly loaded');
      }

      const socketPath = getSocketIOPath();

      this.socket = this.io(serverUrl, {
        path: socketPath,
        auth: { token },
        transports: ['websocket'],
      });

      this.setupListeners();
      return true;
    } catch (error) {
      console.warn('Socket.IO not available, multiplayer disabled:', error);
      return false;
    }
  }

  /**
   * Extract user ID from token
   */
  private extractUserId(token: string): string {
    const parts = token.split('-');
    return parts[parts.length - 1] || '0';
  }

  /**
   * Setup socket event listeners
   */
  private setupListeners(): void {
    if (!this.socket) {
      console.error('[NetworkManager] No socket to setup listeners on!');
      return;
    }

    this.socket.on('connect', () => {
      this.socket?.emit('join_match', this.matchId);
    });

    // If already connected, emit join_match immediately
    if (this.socket.connected) {
      this.socket.emit('join_match', this.matchId);
    }

    this.socket.on('connect_error', (error: any) => {
      console.error('[NetworkManager] ❌ Connection error:', error.message);
    });

    this.socket.on('disconnect', (reason: string) => {
    });

    this.socket.on('player_joined', (data: unknown) => {
      const { userId, team, username } = data as { userId: string; team?: string; username?: string };

      if (team) {
        this.playerTeams.set(userId, team);
      }

      if (userId !== this.myUserId && !this.remotePlayers.has(userId)) {
        this.addRemotePlayer(userId, username);

        // Notify listeners that a player joined
        if (this.onPlayerJoinedCallback) {
          this.onPlayerJoinedCallback(userId, username || 'Player');
        }
      }
    });

    // Log first few player_update events
    let updateLogCount = 0;
    this.socket.on('player_update', (data: unknown) => {
      const { userId, position, rotation, isSprinting, isGrounded, weapon } = data as {
        userId: string;
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number };
        isSprinting: boolean;
        isGrounded: boolean;
        weapon?: string;
      };

      const userIdStr = String(userId);

      // Ignore dead players and self
      if (this.deadPlayers.has(userIdStr) || userIdStr === this.myUserId) {
        return;
      }

      let remotePlayer = this.remotePlayers.get(userIdStr);
      if (!remotePlayer) {
        remotePlayer = this.addRemotePlayer(userIdStr);
      }

      remotePlayer.updateState(position, rotation, isSprinting, isGrounded);

      // Update weapon if provided and different
      if (weapon && remotePlayer.currentWeapon !== weapon) {
        remotePlayer.switchWeapon(weapon as any);
      }
    });

    this.socket.on('weapon_switch', (data: unknown) => {
      const { userId, weapon } = data as { userId: string; weapon: string };
      const userIdStr = String(userId);

      if (userIdStr === this.myUserId) {
        return;
      }

      const remotePlayer = this.remotePlayers.get(userIdStr);
      if (remotePlayer && weapon) {
        remotePlayer.switchWeapon(weapon as any);
      }
    });

    this.socket.on('player_shoot', (data: unknown) => {
      const { userId } = data as { userId: string };
      const userIdStr = String(userId);

      // Don't show muzzle flash for ourselves
      if (userIdStr === this.myUserId) return;

      const remotePlayer = this.remotePlayers.get(userIdStr);
      if (remotePlayer) {
        remotePlayer.showMuzzleFlash();
      }
    });

    // Bullet impact - tracers, decals, particles
    this.socket.on('bullet_impact', (data: unknown) => {
      const { userId, muzzlePos, hitPos, hitNormal, material, hitEntity } = data as {
        userId: string;
        muzzlePos: { x: number; y: number; z: number };
        hitPos: { x: number; y: number; z: number };
        hitNormal: { x: number; y: number; z: number };
        material: string;
        hitEntity: boolean;
      };
      const userIdStr = String(userId);

      // Don't show our own impacts
      if (userIdStr === this.myUserId) return;

      // Trigger callback to spawn effects
      if (this.onBulletImpactCallback) {
        this.onBulletImpactCallback(
          new THREE.Vector3(muzzlePos.x, muzzlePos.y, muzzlePos.z),
          new THREE.Vector3(hitPos.x, hitPos.y, hitPos.z),
          new THREE.Vector3(hitNormal.x, hitNormal.y, hitNormal.z),
          material,
          hitEntity
        );
      }
    });

    // Reload event
    this.socket.on('player_reload', (data: unknown) => {
      const { userId, weaponType } = data as { userId: string; weaponType: string };
      const userIdStr = String(userId);

      if (userIdStr === this.myUserId) return;

      const remotePlayer = this.remotePlayers.get(userIdStr);
      if (remotePlayer) {
        remotePlayer.playReload(weaponType);
      }
    });

    this.socket.on('player_damaged', (data: unknown) => {
      const { targetId, attackerId, damage } = data as {
        targetId: string;
        attackerId: string;
        damage: number;
      };

      const targetIdStr = String(targetId);

      // 1. If we are the target, call the callback (updates HUD, stats)
      if (targetIdStr === this.myUserId) {
        if (this.onDamageCallback) {
          this.onDamageCallback(targetIdStr, attackerId, damage);
        } else {
          console.error('[NetworkManager] Received damage but onDamageCallback is NOT bound!');
        }
      }
      // 2. If it's a remote player, update them
      else {
        const remotePlayer = this.remotePlayers.get(targetIdStr);
        if (remotePlayer) {
          remotePlayer.takeDamage(damage);
        }
      }
    });

    this.socket.on('player_killed', (data: unknown) => {
      const { victimId, attackerId, weaponType } = data as {
        victimId: string;
        attackerId: string;
        weaponType: string;
      };

      const victimIdStr = String(victimId);
      this.deadPlayers.add(victimIdStr);

      // Remove dead player mesh (Remote Player)
      const deadPlayer = this.remotePlayers.get(victimIdStr);
      if (deadPlayer) {
        deadPlayer.die();
        // Delay destruction to allow death animation to play
        // Server respawns at 5s, so wait 6s before destroying
        // Only destroy if player is still dead (hasn't respawned)
        setTimeout(() => {
          const playerAfterTimeout = this.remotePlayers.get(victimIdStr);
          if (playerAfterTimeout && playerAfterTimeout.isDead) {
            playerAfterTimeout.destroy();
            this.remotePlayers.delete(victimIdStr);
          }
        }, 6000); // 6s - server respawns at 5s
      }

      // Trigger callback
      if (this.onKillCallback) {
        this.onKillCallback(attackerId, victimId, weaponType);
      }

      // Check if WE died
      // Normalize IDs to strings for comparison
      const myIdStr = String(this.myUserId);
      if (victimIdStr === myIdStr) {
        if (this.onLocalDeathCallback) {
          this.onLocalDeathCallback(attackerId, weaponType);
        } else {
          console.error('[NetworkManager] onLocalDeathCallback is NOT bound!');
        }
      }
    });

    this.socket.on('player_respawned', (data: unknown) => {
      const { userId, team, position, rotation } = data as {
        userId: string;
        team?: string;
        position?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
      };
      const userIdStr = String(userId);

      if (team) {
        this.playerTeams.set(userIdStr, team);
      }

      this.deadPlayers.delete(userIdStr);

      if (userIdStr === this.myUserId) {
        if (position && this.onSpawnAssignedCallback) {
          const rot = rotation || { x: 0, y: 0, z: 0 };
          this.onSpawnAssignedCallback(position, rot);
        }
      } else {
        const existingPlayer = this.remotePlayers.get(userIdStr);
        // Convert plain object to Vector3 if needed, or pass as is (RemotePlayer accepts {x,y,z})
        const posVec = position ? new THREE.Vector3(position.x, position.y, position.z) : undefined;

        if (existingPlayer) {
          // Player exists - call respawn to reset their state
          existingPlayer.respawn(posVec);
        } else {
          // Player doesn't exist (was destroyed) - create new one
          const newPlayer = this.addRemotePlayer(userIdStr);
          if (posVec) {
            newPlayer.respawn(posVec);
          }
        }
      }
    });

    this.socket.on('match_state', (data: unknown) => {
      this.matchState = data as NetworkMatchState;

      // Extract assigned spawn position if present
      const stateWithSpawn = this.matchState as any;
      if (stateWithSpawn.yourSpawnPosition) {
        this.assignedSpawnPosition = stateWithSpawn.yourSpawnPosition;
        this.assignedSpawnRotation = stateWithSpawn.yourSpawnRotation || { x: 0, y: 0, z: 0 };

        if (this.onSpawnAssignedCallback) {
          this.onSpawnAssignedCallback(this.assignedSpawnPosition, this.assignedSpawnRotation);
        }
      }

      // Sync teams
      if (this.matchState.teams) {
        Object.entries(this.matchState.teams).forEach(([uid, team]) => {
          this.playerTeams.set(uid, team);
          if (uid === this.myUserId) {
            this.myTeam = team;
          } else {
            const rp = this.remotePlayers.get(uid);
            if (rp) rp.setTeam(team);
          }
        });
      }

      // Trigger score update if needed
      if (this.onScoreUpdateCallback) {
        this.onScoreUpdateCallback(this.matchState);
      }
    });

    this.socket.on('score_update', (data: unknown) => {
      // console.log('[NetworkManager] 🏆 Score update received:', data);
      if (this.onScoreUpdateCallback) {
        this.onScoreUpdateCallback(data as NetworkMatchState);
      }
    });

    this.socket.on('match_ended', (data: unknown) => {
      const state = data as NetworkMatchState;
      if (this.onMatchEndCallback) {
        this.onMatchEndCallback(state);
      }
    });

    // Chat message received
    this.socket.on('chat_message', (data: unknown) => {
      const { userId, username, message } = data as {
        userId: string;
        username: string;
        message: string;
      };

      if (this.onChatMessageCallback) {
        this.onChatMessageCallback(userId, username, message);
      }
    });

    // Player left the match
    this.socket.on('player_left', (data: unknown) => {
      const { userId } = data as { userId: string };
      const userIdStr = String(userId);

      // Remove remote player from scene
      const remotePlayer = this.remotePlayers.get(userIdStr);
      if (remotePlayer) {
        remotePlayer.destroy();
        this.remotePlayers.delete(userIdStr);
      }

      // Remove from dead players set
      this.deadPlayers.delete(userIdStr);

      // Trigger callback
      if (this.onPlayerLeftCallback) {
        this.onPlayerLeftCallback(userIdStr);
      }
    });

    // ============== Server-Authoritative Bot Events ==============

    // Receive bot state updates from server
    this.socket.on('bot_states', (states: unknown) => {
      const botStates = states as Array<{
        id: string;
        oderId: string;
        username: string;
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        health: number;
        isAlive: boolean;
        animation: string;
        weaponType?: string | number; // Added weapon syncing
      }>;

      // Trigger callback to update bots
      if (this.onBotStatesCallback) {
        this.onBotStatesCallback(botStates);
      }

      // Update bot weapon cache
      botStates.forEach(state => {
        if (state.weaponType !== undefined) {
          let weaponName = 'Weapon';
          if (typeof state.weaponType === 'string') {
            weaponName = state.weaponType;
          } else if (typeof state.weaponType === 'number') {
            // Map numeric types if needed (matching RemoteBot logic)
            if (state.weaponType === 1) weaponName = 'Pistol';
            else if (state.weaponType === 2) weaponName = 'Shotgun';
            else if (state.weaponType === 3) weaponName = 'AK47';
          }
          this.botWeapons.set(state.id, weaponName);
          // Also cache by oderId to cover both ID types
          if (state.oderId) {
            this.botWeapons.set(state.oderId, weaponName);
          }
          // console.log(`[NetworkManager] Cached weapon for bot ${state.id}/${state.oderId} (${state.username}): ${weaponName}`);
        }
      });
    });

    // Bot attack event (for visual effects)
    this.socket.on('bot_attack', (data: unknown) => {
      const { botId, targetId, damage } = data as {
        botId: string;
        targetId: string;
        damage: number;
      };

      if (this.onBotAttackCallback) {
        this.onBotAttackCallback(botId, targetId, damage);
      }
    });

    // Bot hit player event
    this.socket.on('bot_hit_player', (data: unknown) => {
      const { botId, targetId, damage } = data as {
        botId: string;
        targetId: string;
        damage: number;
      };

      // If we're the target, call the damage callback
      if (targetId === this.myUserId) {
        if (this.onDamageCallback) {
          this.onDamageCallback(this.myUserId, botId, damage);
        }
      }
    });

    // Bot killed event
    this.socket.on('bot_killed', (data: unknown) => {
      const { botId, botUsername, killerId, respawnTime } = data as {
        botId: string;
        botUsername: string;
        killerId: string;
        respawnTime: number;
      };

      // Resolve weapon from the KILLER
      const weapon = this.resolveWeapon(killerId);

      if (this.onBotKilledCallback) {
        this.onBotKilledCallback(botId, botUsername, killerId, weapon);
      }

      // Trigger kill callback for killfeed
      if (this.onKillCallback) {
        // Use the actual bot username provided by server
        this.onKillCallback(killerId, botUsername, weapon);
      }
    });

    // Bot respawned event
    this.socket.on('bot_respawned', (data: unknown) => {
      const { botId, position, rotation } = data as {
        botId: string;
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
      };

      if (this.onBotRespawnedCallback) {
        this.onBotRespawnedCallback(botId, position, rotation);
      }
    });
  }

  /**
   * Helper to resolve weapon name for a killer ID
   * Checks local player, remote players, and cached bot weapons
   */
  private resolveWeapon(killerId: string): string {
    // Ensure string ID
    const killerIdStr = String(killerId);

    // console.log(`[NetworkManager] resolving weapon for killerId: ${killerIdStr}`);

    // 1. Check local player
    if (killerIdStr === this.myUserId) {
      // console.log(`[NetworkManager] Killer is local player. Weapon: ${this.currentWeapon}`);
      return this.currentWeapon;
    }

    // 2. Check remote players
    const remotePlayer = this.remotePlayers.get(killerIdStr);
    if (remotePlayer && remotePlayer.currentWeapon) {
      // console.log(`[NetworkManager] Killer is remote player. Weapon: ${remotePlayer.currentWeapon}`);
      return remotePlayer.currentWeapon;
    }

    // 3. Check bots
    const botWeapon = this.botWeapons.get(killerIdStr);
    if (botWeapon) {
      // console.log(`[NetworkManager] Killer is cached bot. Weapon: ${botWeapon}`);
      return botWeapon;
    }

    // Warn if not found
    console.warn(`[NetworkManager] Could not resolve weapon for killer ${killerIdStr}. MyID: ${this.myUserId}. BotCount: ${this.botWeapons.size}. RemotePlayerCount: ${this.remotePlayers.size}`);
    return 'Weapon';
  }

  /**
   * Helper to get a remote player's name
   */
  public getRemotePlayerName(userId: string): string | undefined {
    // Check remote players
    const remotePlayer = this.remotePlayers.get(userId);
    if (remotePlayer) {
      return remotePlayer.username;
    }
    // Check if it's me
    if (userId === this.myUserId) {
      return 'YOU';
    }
    return undefined;
  }

  /**
   * Add a remote player to the scene
   */
  private addRemotePlayer(userId: string, username?: string): RemotePlayer {
    // Pass assetManager and username for model loading
    const player = new RemotePlayer(this.scene, this.assetManager, userId, username);
    this.remotePlayers.set(userId, player);

    const team = this.playerTeams.get(userId);
    if (team) {
      player.setTeam(team);
    }

    return player;
  }

  /**
   * Update network state - call each frame
   */
  private updateCounter = 0;
  private loggedNotConnected = false;
  public update(
    delta: number,
    localPlayer: { position: THREE.Vector3; rotation: THREE.Quaternion; velocity: THREE.Vector3; isSprinting: boolean; isGrounded: boolean },
    camera: THREE.Camera,
    currentWeapon?: string
  ): void {
    if (currentWeapon) {
      this.currentWeapon = currentWeapon;
    }

    // Update remote players interpolation
    this.remotePlayers.forEach(p => p.update(delta));

    // Check if we're connected
    if (!this.socket?.connected) {
      return;
    }

    // Send local player update at fixed rate
    const now = Date.now();
    if (now - this.lastUpdate > this.config.updateRate) {
      this.sendPlayerUpdate(localPlayer, camera, currentWeapon);
      this.lastUpdate = now;
      this.updateCounter++;
    }
  }

  /**
   * Send local player state to server
   */
  private sendPlayerUpdate(
    player: { position: THREE.Vector3; rotation: THREE.Quaternion; velocity: THREE.Vector3; isSprinting: boolean; isGrounded: boolean },
    camera: THREE.Camera,
    currentWeapon?: string
  ): void {
    if (!this.socket?.connected) return;

    // Convert player quaternion to Euler to get Y rotation (Yaw)
    // CRITICAL: Explicitly construct THREE.Quaternion to ensure compatibility with Yuka rotation
    const q = new THREE.Quaternion(player.rotation.x, player.rotation.y, player.rotation.z, player.rotation.w);
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');

    // Send player's base position (feet), not camera position (head)
    // Remote players need the feet position to render correctly on the ground
    this.socket.emit('player_update', {
      matchId: this.matchId,
      position: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      },
      rotation: {
        x: camera.rotation.x, // Pitch from camera
        y: euler.y,           // Yaw from player body
      },
      velocity: {
        x: player.velocity.x,
        y: player.velocity.y,
        z: player.velocity.z,
      },
      isSprinting: player.isSprinting,
      isGrounded: (player as any).onGround ?? true, // Fix: Player uses onGround, not isGrounded
      weapon: currentWeapon,
    });
  }

  /**
   * Send shoot event
   */
  public sendShoot(origin: THREE.Vector3, direction: THREE.Vector3, weaponType: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('player_shoot', {
      matchId: this.matchId,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      weaponType,
    });
  }

  /**
   * Send weapon switch event
   */
  public sendWeaponSwitch(weapon: string): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('weapon_switch', {
      matchId: this.matchId,
      weapon,
    });
  }

  /**
   * Send hit event
   */
  public sendPlayerHit(targetId: string, damage: number, hitLocation: THREE.Vector3): void {
    if (!this.socket?.connected) {
      return;
    }

    // Check friendly fire
    const targetTeam = this.playerTeams.get(targetId);
    if (this.myTeam && targetTeam && this.myTeam === targetTeam) {
      return;
    }

    this.socket.emit('player_hit', {
      matchId: this.matchId,
      targetId,
      damage,
      hitLocation: { x: hitLocation.x, y: hitLocation.y, z: hitLocation.z },
    });
  }

  /**
   * Send bot hit event (damage to server-authoritative bot)
   */
  public sendBotHit(botId: string, damage: number): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('bot_hit', {
      matchId: this.matchId,
      botId,
      damage,
    });
  }

  /**
   * Send bullet impact event - for tracers, decals, and particles
   */
  public sendBulletImpact(
    muzzlePos: THREE.Vector3,
    hitPos: THREE.Vector3,
    hitNormal: THREE.Vector3,
    material: string,
    hitEntity: boolean
  ): void {
    if (!this.socket?.connected) return;

    this.socket.emit('bullet_impact', {
      matchId: this.matchId,
      muzzlePos: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
      hitPos: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
      hitNormal: { x: hitNormal.x, y: hitNormal.y, z: hitNormal.z },
      material,
      hitEntity,
    });
  }

  /**
   * Send reload event
   */
  public sendReload(weaponType: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('player_reload', {
      matchId: this.matchId,
      weaponType,
    });
  }

  /**
   * Send chat message
   */
  public sendChatMessage(message: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('chat_message', {
      matchId: this.matchId,
      message,
    });
  }

  /**
   * Send death event
   */
  public sendPlayerDied(attackerId: string, weaponType: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('player_died', {
      matchId: this.matchId,
      attackerId,
      weaponType,
    });
  }

  /**
   * Send respawn event
   */
  public sendPlayerRespawn(): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('player_respawn', {
      matchId: this.matchId,
    });
  }

  // ========== Event Callbacks ==========

  public onKill(callback: (attackerId: string, victimId: string, weaponType: string) => void): void {
    this.onKillCallback = callback;
  }

  public onDamage(callback: (targetId: string, attackerId: string, damage: number) => void): void {
    this.onDamageCallback = callback;
  }

  public onMatchEnd(callback: (state: NetworkMatchState) => void): void {
    this.onMatchEndCallback = callback;
  }

  public onScoreUpdate(callback: (state: NetworkMatchState) => void): void {
    this.onScoreUpdateCallback = callback;

    // If we already have match state (received before callback registered), trigger it now
    if (this.matchState) {
      callback(this.matchState);
    }
  }

  public onLocalDeath(callback: (attackerId: string, weaponType: string) => void): void {
    this.onLocalDeathCallback = callback;
  }

  public onBulletImpact(callback: (
    muzzlePos: THREE.Vector3,
    hitPos: THREE.Vector3,
    hitNormal: THREE.Vector3,
    material: string,
    hitEntity: boolean
  ) => void): void {
    this.onBulletImpactCallback = callback;
  }

  public onChatMessage(callback: (userId: string, username: string, message: string) => void): void {
    this.onChatMessageCallback = callback;
  }

  public onPlayerLeft(callback: (userId: string) => void): void {
    this.onPlayerLeftCallback = callback;
  }

  public onPlayerJoined(callback: (userId: string, username: string) => void): void {
    this.onPlayerJoinedCallback = callback;
  }

  public onSpawnAssigned(callback: (position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) => void): void {
    this.onSpawnAssignedCallback = callback;
  }

  // Bot event callbacks (server-authoritative bots)
  public onBotStates(callback: (states: Array<{
    id: string;
    oderId: string;
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    health: number;
    isAlive: boolean;
    animation: string;
  }>) => void): void {
    this.onBotStatesCallback = callback;
  }

  public onBotAttack(callback: (botId: string, targetId: string, damage: number) => void): void {
    this.onBotAttackCallback = callback;
  }

  public onBotKilled(callback: (botId: string, botUsername: string, killerId: string, weaponType: string) => void): void {
    this.onBotKilledCallback = callback;
  }

  public onBotRespawned(callback: (botId: string, position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) => void): void {
    this.onBotRespawnedCallback = callback;
  }

  // ========== Getters ==========

  public get otherPlayers(): Map<string, RemotePlayer> {
    return this.remotePlayers;
  }

  public getRemotePlayers(): RemotePlayer[] {
    return Array.from(this.remotePlayers.values());
  }

  public getMatchState(): NetworkMatchState | null {
    return this.matchState;
  }

  public isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ========== Cleanup ==========

  public disconnect(): void {
    if (this.socket) {
      this.socket.off('connect');
      this.socket.off('disconnect');
      this.socket.off('player_joined');
      this.socket.off('player_update');
      this.socket.off('player_shoot');
      this.socket.off('bullet_impact');
      this.socket.off('player_reload');
      this.socket.off('chat_message');
      this.socket.off('player_left');
      this.socket.off('player_damaged');
      this.socket.off('player_killed');
      this.socket.off('player_respawned');
      this.socket.off('match_state');
      this.socket.off('score_update');
      this.socket.off('score_update');
      this.socket.off('match_ended');
    }
    this.remotePlayers.clear();
    this.deadPlayers.clear();
  }
}
