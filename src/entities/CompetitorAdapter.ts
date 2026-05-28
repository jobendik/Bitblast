// Competitor Adapter
// Adapts existing Player and Bot entities to the ICompetitor interface
// This provides a unified way to interact with all game participants

import { Vector3 } from 'yuka';
import { ICompetitor, CompetitorType, CompetitorState } from '../types/competitor';
import { Player } from './Player';
import { Bot } from './Bot';
import { RemotePlayer } from '../network/RemotePlayer';
import { STATUS_ALIVE } from '../core/Constants';

/**
 * Adapt a Player entity to ICompetitor interface
 */
export class PlayerCompetitor implements ICompetitor {
  private player: Player;
  
  public kills: number = 0;
  public deaths: number = 0;
  public team?: string;
  
  constructor(player: Player, team?: string) {
    this.player = player;
    this.team = team;
  }
  
  // Identity
  get competitorId(): string {
    return this.player.uuid;
  }
  
  get competitorType(): CompetitorType {
    return 'human';
  }
  
  get displayName(): string {
    return this.player.name || 'Player';
  }
  
  // State
  get health(): number {
    return this.player.health;
  }
  
  set health(value: number) {
    this.player.health = value;
  }
  
  get maxHealth(): number {
    return this.player.maxHealth;
  }
  
  isAlive(): boolean {
    return this.player.status === STATUS_ALIVE;
  }
  
  getPosition(): Vector3 {
    return this.player.position.clone();
  }
  
  getForward(): Vector3 {
    const forward = new Vector3(0, 0, -1);
    if (this.player.head) {
      this.player.head.getWorldDirection(forward);
    }
    return forward;
  }
  
  // Combat
  takeDamage(amount: number, attacker: ICompetitor | null, _weaponType?: string): number {
    // Damage is handled through the existing message system
    // This is a direct damage method for network/unified handling
    const prevHealth = this.player.health;
    this.player.health = Math.max(0, this.player.health - amount);
    
    // Update UI
    if (this.player.world.uiManager) {
      this.player.world.uiManager.updateHealthStatus();
    }
    
    // Check death
    if (this.player.health <= 0 && prevHealth > 0) {
      this.onDeath(attacker);
    }
    
    return prevHealth - this.player.health;
  }
  
  onDeath(killer: ICompetitor | null, weaponType?: string): void {
    this.deaths++;
    
    if (killer && killer !== this) {
      killer.kills++;
    }
    
    // Initialize death animation/state
    // Note: The actual death logic is in Player.initDeath()
    // This method is called when death is triggered externally (network)
  }
  
  respawn(position: Vector3): void {
    this.player.position.copy(position);
    this.player.reset();
  }
  
  // Serialization
  getState(): CompetitorState {
    return {
      id: this.competitorId,
      type: this.competitorType,
      health: this.health,
      maxHealth: this.maxHealth,
      position: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
      },
      rotation: {
        x: this.player.head?.rotation.x || 0,
        y: this.player.head?.rotation.y || 0,
      },
      team: this.team,
      isAlive: this.isAlive(),
      kills: this.kills,
      deaths: this.deaths,
    };
  }
  
  // Access underlying entity
  getEntity(): Player {
    return this.player;
  }
}

/**
 * Adapt a Bot entity to ICompetitor interface
 */
export class BotCompetitor implements ICompetitor {
  private bot: Bot;
  
  public kills: number = 0;
  public deaths: number = 0;
  public team?: string;
  
  constructor(bot: Bot, team?: string) {
    this.bot = bot;
    this.team = team;
  }
  
  // Identity
  get competitorId(): string {
    return this.bot.uuid;
  }
  
  get competitorType(): CompetitorType {
    return 'bot';
  }
  
  get displayName(): string {
    return this.bot.name || 'Bot';
  }
  
  // State
  get health(): number {
    return this.bot.health;
  }
  
  set health(value: number) {
    this.bot.health = value;
  }
  
  get maxHealth(): number {
    return this.bot.maxHealth;
  }
  
  isAlive(): boolean {
    return this.bot.status === STATUS_ALIVE;
  }
  
  getPosition(): Vector3 {
    return this.bot.position.clone();
  }
  
  getForward(): Vector3 {
    return this.bot.forward.clone();
  }
  
  // Combat
  takeDamage(amount: number, attacker: ICompetitor | null, _weaponType?: string): number {
    const prevHealth = this.bot.health;
    this.bot.health = Math.max(0, this.bot.health - amount);
    
    // Check death
    if (this.bot.health <= 0 && prevHealth > 0) {
      this.onDeath(attacker);
    }
    
    return prevHealth - this.bot.health;
  }
  
  onDeath(killer: ICompetitor | null, weaponType?: string): void {
    this.deaths++;
    
    if (killer && killer !== this) {
      killer.kills++;
    }
  }
  
  respawn(position: Vector3): void {
    this.bot.position.copy(position);
    // Bot respawn logic would go here
  }
  
  // Serialization
  getState(): CompetitorState {
    return {
      id: this.competitorId,
      type: this.competitorType,
      health: this.health,
      maxHealth: this.maxHealth,
      position: {
        x: this.bot.position.x,
        y: this.bot.position.y,
        z: this.bot.position.z,
      },
      rotation: {
        x: this.bot.rotation.x,
        y: this.bot.rotation.y,
      },
      team: this.team,
      isAlive: this.isAlive(),
      kills: this.kills,
      deaths: this.deaths,
    };
  }
  
  // Access underlying entity
  getEntity(): Bot {
    return this.bot;
  }
}

/**
 * Adapt a RemotePlayer to ICompetitor interface
 */
export class RemoteCompetitor implements ICompetitor {
  private remotePlayer: RemotePlayer;
  private _health: number = 100;
  private _maxHealth: number = 100;
  private _isAlive: boolean = true;
  
  public kills: number = 0;
  public deaths: number = 0;
  public team?: string;
  
  constructor(remotePlayer: RemotePlayer, team?: string) {
    this.remotePlayer = remotePlayer;
    this.team = team;
  }
  
  // Identity
  get competitorId(): string {
    return this.remotePlayer.userId;
  }
  
  get competitorType(): CompetitorType {
    return 'remote';
  }
  
  get displayName(): string {
    return `Player_${this.remotePlayer.userId.slice(-4)}`;
  }
  
  // State
  get health(): number {
    return this._health;
  }
  
  set health(value: number) {
    this._health = value;
  }
  
  get maxHealth(): number {
    return this._maxHealth;
  }
  
  isAlive(): boolean {
    return this._isAlive;
  }
  
  getPosition(): Vector3 {
    const mesh = this.remotePlayer.getMesh();
    if (mesh) {
      return new Vector3(mesh.position.x, mesh.position.y, mesh.position.z);
    }
    return new Vector3();
  }
  
  getForward(): Vector3 {
    // Would need to be calculated from rotation
    return new Vector3(0, 0, -1);
  }
  
  // Combat
  takeDamage(amount: number, attacker: ICompetitor | null, _weaponType?: string): number {
    // Remote player damage is handled server-side
    // This just updates local state from server events
    const prevHealth = this._health;
    this._health = Math.max(0, this._health - amount);
    
    if (this._health <= 0 && prevHealth > 0) {
      this.onDeath(attacker);
    }
    
    return prevHealth - this._health;
  }
  
  onDeath(killer: ICompetitor | null, _weaponType?: string): void {
    this._isAlive = false;
    this.deaths++;
    
    if (killer) {
      killer.kills++;
    }
    
    // Trigger death animation
    this.remotePlayer.die();
  }
  
  respawn(position: Vector3): void {
    this._isAlive = true;
    this._health = this._maxHealth;
    this.remotePlayer.respawn(position);
  }
  
  // Serialization
  getState(): CompetitorState {
    const pos = this.getPosition();
    return {
      id: this.competitorId,
      type: this.competitorType,
      health: this.health,
      maxHealth: this.maxHealth,
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: 0, y: 0 },
      team: this.team,
      isAlive: this.isAlive(),
      kills: this.kills,
      deaths: this.deaths,
    };
  }
  
  // Access underlying entity
  getEntity(): RemotePlayer {
    return this.remotePlayer;
  }
  
  // Update from network
  updateFromNetwork(state: Partial<CompetitorState>): void {
    if (state.health !== undefined) this._health = state.health;
    if (state.isAlive !== undefined) this._isAlive = state.isAlive;
    if (state.kills !== undefined) this.kills = state.kills;
    if (state.deaths !== undefined) this.deaths = state.deaths;
    if (state.team !== undefined) this.team = state.team;
  }
}

/**
 * Create appropriate competitor adapter for an entity
 */
export function createCompetitor(
  entity: Player | Bot | RemotePlayer,
  team?: string
): ICompetitor {
  if (entity instanceof Player) {
    return new PlayerCompetitor(entity, team);
  } else if (entity instanceof Bot) {
    return new BotCompetitor(entity, team);
  } else if (entity instanceof RemotePlayer) {
    return new RemoteCompetitor(entity, team);
  }
  throw new Error('Unknown entity type');
}
