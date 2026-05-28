/**
 * ServerBotManager.js - Manages server-side YUKA bots
 * 
 * This is the main integration point that:
 * - Loads the NavMesh
 * - Creates and manages ServerBot instances
 * - Runs the YUKA EntityManager
 * - Broadcasts bot states to clients
 */

// Polyfill for requestIdleCallback (browser API not available in Node.js)
if (typeof global.requestIdleCallback === 'undefined') {
    global.requestIdleCallback = function (callback, options) {
        const timeout = options?.timeout || 50;
        return setTimeout(() => {
            callback({
                didTimeout: false,
                timeRemaining: () => Math.max(0, 50 - (Date.now() % 50))
            });
        }, 1);
    };
    global.cancelIdleCallback = function (id) {
        clearTimeout(id);
    };
}

const YUKA = require('yuka');
const { loadNavMesh } = require('./ServerNavMeshLoader');
const { ServerBot, ServerPathPlanner, BOT_CONFIG, STATUS_ALIVE, STATUS_DEAD, STATUS_WAITING_RESPAWN } = require('./ServerBot');
const { ServerLevelOccluder } = require('./ServerLevelOccluder');
const path = require('path');

// Gamer names for bots
const GAMER_NAMES = [
    'xShadowKiller', 'NightHawk99', 'VelocityX', 'StormBringer', 'PhantomAce',
    'CyberWolf', 'BlazeMaster', 'IronReaper', 'QuantumFury', 'SteelVenom',
    'DarkSpectre', 'ThunderBolt', 'RapidFire', 'SilentStrike', 'NovaFlash',
    'ZeroGravity', 'ToxicViper', 'GhostRider', 'AlphaStorm', 'NeonBlade',
    'SkyFall', 'OmegaWolf', 'CrimsonFang', 'FrostBite', 'EliteSniper',
    'WarMachine', 'ShadowFox', 'BulletProof', 'DeathMatch', 'HyperX',
    'TurboKill', 'NightOwl', 'FireStorm', 'IceBreaker', 'VenomStrike',
    'DarkKnight', 'StealthMode', 'RogueAgent', 'SpeedDemon', 'AcidRain'
];

/**
 * ServerWorld - Simplified world for server-side bots
 * Contains NavMesh, competitors list, level occluder, and other shared data
 */
class ServerWorld {
    constructor() {
        this.navMesh = null;
        this.pathPlanner = null;
        this.competitors = []; // All bots + player representations
        this.deltaTime = 0;

        // Level occluder for LOS blocking (BVH from level.glb mesh)
        this.levelOccluder = null;

        // Reusable vectors for raycast calculations
        this._rayTestPoint = new YUKA.Vector3();
        this._rayDirection = new YUKA.Vector3();
    }

    getCompetitors() {
        return this.competitors;
    }

    /**
     * Get competitor by ID (player or bot)
     * Used by bots to track attackers
     * @param {string} id - The competitor's ID
     * @returns {object|null} The competitor or null if not found
     */
    getCompetitorById(id) {
        for (const competitor of this.competitors) {
            if (competitor.oderId === id || competitor.uuid === id) {
                return competitor;
            }
        }
        return null;
    }

    /**
     * Get the level occluder for vision obstacle
     * @returns {ServerLevelOccluder|null}
     */
    getLevelOccluder() {
        return this.levelOccluder;
    }

    /**
     * Raycast for vision tests using level mesh BVH.
     * 
     * Uses the actual level.glb geometry with YUKA BVH for accurate LOS blocking.
     * This matches the client-side behavior exactly.
     * 
     * @param {Vector3} from - Start position (head height)
     * @param {Vector3} to - End position (target head height)
     * @returns {Object|null} - Intersection object {point, distance} or null if clear LOS
     */
    raycast(from, to) {
        // Use level mesh BVH for LOS blocking if available
        if (this.levelOccluder && this.levelOccluder.isLoaded) {
            return this.levelOccluder.raycast(from, to);
        }

        // Fallback: no occluder loaded, allow direct line of sight
        // FOV and range checks will still limit vision appropriately
        return null;
    }
}

/**
 * ServerBotManager - Manages all bots on the server
 */
class ServerBotManager {
    constructor(io, matchId) {
        this.io = io;
        this.matchId = matchId;

        // YUKA entity manager
        this.entityManager = new YUKA.EntityManager();

        // Server world (holds NavMesh, competitors, etc.)
        this.world = new ServerWorld();

        // Bots map
        this.bots = new Map(); // botId -> ServerBot

        // Player representations for bot vision
        this.players = new Map(); // oderId -> player state

        // Spawn points
        this.spawnPoints = [
            { position: { x: -33.5, y: -4.9, z: 42 }, rotation: { x: 0, y: 0, z: 0 } },
            { position: { x: 29.5, y: -7.17, z: -27.5 }, rotation: { x: 0, y: Math.PI, z: 0 } },
            { position: { x: -50.5, y: -4.52, z: -14 }, rotation: { x: 0, y: -Math.PI / 2, z: 0 } },
            { position: { x: 39.7, y: -7.17, z: 35 }, rotation: { x: 0, y: Math.PI / 2, z: 0 } }
        ];

        // Timing
        this.lastUpdateTime = Date.now();
        this.updateInterval = null;
        this.tickRate = 20; // Hz
        this.broadcastRate = 10; // Hz
        this.tickCount = 0;

        // Loaded state
        this.isReady = false;
    }

    /**
     * Initialize the bot manager - load NavMesh, level mesh, and set up systems
     */
    async initialize(navMeshPath) {
        try {
            console.log('[ServerBotManager] Initializing...');

            // Load NavMesh
            const resolvedPath = path.resolve(navMeshPath);
            this.world.navMesh = await loadNavMesh(resolvedPath);

            // Create path planner
            this.world.pathPlanner = new ServerPathPlanner(this.world.navMesh);

            // Load level mesh for LOS blocking
            // Level mesh path: public/assets/models/environment/level.glb
            // NavMesh path is: public/assets/data/navmeshes/navmesh.glb
            // Navigate: navmeshes -> data -> assets -> models/environment
            const navMeshDir = path.dirname(resolvedPath);  // .../navmeshes
            const dataDir = path.dirname(navMeshDir);       // .../data
            const assetsDir = path.dirname(dataDir);        // .../assets
            const levelPath = path.join(assetsDir, 'models', 'environment', 'level.glb');

            this.world.levelOccluder = new ServerLevelOccluder();
            const occluderLoaded = await this.world.levelOccluder.load(levelPath, 'level');

            if (occluderLoaded) {
                console.log('[ServerBotManager] LOS blocking enabled with',
                    this.world.levelOccluder.getTriangleCount(), 'triangles from level mesh');
            } else {
                console.warn('[ServerBotManager] LOS blocking disabled - bots may see through walls');
            }

            // Register path planner with entity manager for updates
            // (PathPlanner.update() needs to be called each tick)

            this.isReady = true;
            console.log('[ServerBotManager] Ready! NavMesh loaded with',
                this.world.navMesh.regions.length, 'regions');

            return true;
        } catch (error) {
            console.error('[ServerBotManager] Failed to initialize:', error);
            return false;
        }
    }

    /**
     * Spawn bots for a match (legacy method - generates its own IDs)
     */
    spawnBots(count, usedSpawnIndices = []) {
        console.log(`[ServerBotManager] Spawning ${count} bots...`);

        // Get available spawn points (not used by humans)
        const availableSpawns = this.spawnPoints
            .map((sp, idx) => ({ ...sp, index: idx }))
            .filter((_, idx) => !usedSpawnIndices.includes(idx));

        for (let i = 0; i < count; i++) {
            const botId = `bot_${i}_${Date.now()}`;
            const username = GAMER_NAMES[i % GAMER_NAMES.length];

            // Pick spawn point
            const spawnIndex = i % availableSpawns.length;
            const spawnPoint = availableSpawns[spawnIndex] || this.spawnPoints[0];

            // Create bot
            const bot = new ServerBot(this.world, botId, username, spawnPoint);

            // Add to entity manager
            this.entityManager.add(bot);

            // Track in our map
            this.bots.set(botId, bot);

            // Add to competitors list
            this.world.competitors.push(bot);

            console.log(`[ServerBotManager] Spawned bot: ${username} (${botId})`);
        }
    }

    /**
     * Spawn bots with specific configurations (used by main server for ID consistency)
     * @param {Array} botConfigs - Array of bot configs: { oderId, username, position, rotation }
     */
    spawnBotsWithConfig(botConfigs) {
        console.log(`[ServerBotManager] Spawning ${botConfigs.length} bots with configs...`);

        for (const config of botConfigs) {
            const botId = config.oderId;
            const username = config.username;
            const spawnPoint = {
                position: config.position,
                rotation: config.rotation
            };

            // Create bot with exact ID from config
            const bot = new ServerBot(this.world, botId, username, spawnPoint);

            // Add to entity manager
            this.entityManager.add(bot);

            // Track in our map
            this.bots.set(botId, bot);

            // Add to competitors list
            this.world.competitors.push(bot);

            console.log(`[ServerBotManager] Spawned bot: ${username} (${botId}) at (${spawnPoint.position.x.toFixed(1)}, ${spawnPoint.position.y.toFixed(1)}, ${spawnPoint.position.z.toFixed(1)})`);
        }
    }

    /**
     * Update player state (for bot vision)
     */
    updatePlayer(playerData) {
        let player = this.players.get(playerData.oderId);

        if (!player) {
            // Create player representation for bot perception
            player = new YUKA.GameEntity();
            player.oderId = playerData.oderId;
            player.name = playerData.username || playerData.oderId; // Set name for logging
            player.isBot = false;
            player.isPlayer = true; // Mark as player (matches original)
            player.head = new YUKA.GameEntity();
            player.head.position.set(0, 1.7, 0); // Player head height
            player.add(player.head);
            this.players.set(playerData.oderId, player);
            this.world.competitors.push(player);

            console.log(`[ServerBotManager] Added player ${player.name} to competitors list`);
        }

        // Update position
        player.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );

        if (playerData.rotation) {
            if (typeof playerData.rotation.y === 'number') {
                player.rotation.fromEuler(0, playerData.rotation.y, 0);
            }
        }

        player.health = playerData.health || 100;
        player.maxHealth = 100;
        player.status = playerData.isAlive !== false ? STATUS_ALIVE : STATUS_DEAD;
        player.active = playerData.isAlive !== false;
    }

    /**
     * Remove player
     */
    removePlayer(oderId) {
        const player = this.players.get(oderId);
        if (player) {
            // Remove from competitors
            const idx = this.world.competitors.indexOf(player);
            if (idx !== -1) {
                this.world.competitors.splice(idx, 1);
            }
            this.players.delete(oderId);
        }
    }

    /**
     * Handle bot taking damage (from player)
     */
    damageBot(botId, damage, attackerId) {
        const bot = this.bots.get(botId);
        if (!bot) return null;

        const wasAlive = bot.status === STATUS_ALIVE;
        bot.takeDamage(damage, attackerId);

        // Return kill event if bot died
        if (wasAlive && bot.status !== STATUS_ALIVE) {
            return {
                botId: botId,
                killerId: attackerId,
                botUsername: bot.name
            };
        }

        return null;
    }

    /**
     * Start the update loop
     */
    start() {
        if (!this.isReady) {
            console.error('[ServerBotManager] Cannot start - not initialized');
            return;
        }

        console.log('[ServerBotManager] Starting update loop at', this.tickRate, 'Hz');

        this.lastUpdateTime = Date.now();

        this.updateInterval = setInterval(() => {
            this.update();
        }, 1000 / this.tickRate);
    }

    /**
     * Stop the update loop
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Main update loop - runs YUKA AI
     */
    update() {
        const now = Date.now();
        const deltaMs = now - this.lastUpdateTime;
        const delta = deltaMs / 1000;
        this.lastUpdateTime = now;

        this.world.deltaTime = delta;

        // Update path planner
        if (this.world.pathPlanner) {
            this.world.pathPlanner.update();
        }

        // Update YUKA entity manager (updates all bots)
        this.entityManager.update(delta);

        // Handle bot respawns
        this.handleRespawns();

        // Collect and broadcast attacks
        this.broadcastAttacks();

        // Broadcast bot states (at lower rate)
        this.tickCount++;
        if (this.tickCount % Math.floor(this.tickRate / this.broadcastRate) === 0) {
            this.broadcastBotStates();

            // Debug: Log competitor count periodically (uncomment for debugging)
            // if (this.tickCount % (this.tickRate * 10) === 0) {
            //     const botCount = this.bots.size;
            //     const playerCount = this.players.size;
            //     console.log(`[ServerBotManager] Competitors: ${this.world.competitors.length} total (${botCount} bots, ${playerCount} players)`);
            // }
        }
    }

    /**
     * Handle bot respawns
     */
    handleRespawns() {
        const now = Date.now() / 1000;

        for (const [botId, bot] of this.bots) {
            if (bot.status === STATUS_WAITING_RESPAWN && bot.currentTime >= bot.respawnTime) {
                // Pick random spawn point
                const spawnIndex = Math.floor(Math.random() * this.spawnPoints.length);
                const spawnPoint = this.spawnPoints[spawnIndex];

                bot.respawn(spawnPoint);

                // Broadcast respawn event
                this.io.to(`match_${this.matchId}`).emit('bot_respawned', {
                    botId: botId,
                    position: spawnPoint.position,
                    rotation: spawnPoint.rotation
                });

                console.log(`[ServerBotManager] Bot ${bot.name} respawned`);
            }
        }
    }

    /**
     * Broadcast bot attack events (hits and misses)
     */
    broadcastAttacks() {
        for (const [botId, bot] of this.bots) {
            // Handle successful hits
            if (bot.pendingAttack) {
                const attack = bot.pendingAttack;

                // Broadcast attack for visual effects
                this.io.to(`match_${this.matchId}`).emit('bot_attack', {
                    botId: botId,
                    targetId: attack.targetId,
                    damage: attack.damage
                });

                // Check if target is a player
                const targetPlayer = this.players.get(attack.targetId);
                if (targetPlayer) {
                    // Bot hit a player - track stats and notify player of damage
                    bot.shotsHit = (bot.shotsHit || 0) + 1;
                    bot.damageDealt = (bot.damageDealt || 0) + attack.damage;

                    this.io.to(`match_${this.matchId}`).emit('bot_hit_player', {
                        botId: botId,
                        targetId: attack.targetId,
                        damage: attack.damage
                    });
                } else {
                    // Bot hit another bot - apply damage server-side
                    const targetBot = this.bots.get(attack.targetId);
                    if (targetBot) {
                        // Track stats for hitting another bot
                        bot.shotsHit = (bot.shotsHit || 0) + 1;
                        bot.damageDealt = (bot.damageDealt || 0) + attack.damage;

                        const killEvent = this.damageBot(attack.targetId, attack.damage, botId);

                        if (killEvent) {
                            bot.kills++;
                            this.io.to(`match_${this.matchId}`).emit('bot_killed', killEvent);
                        }
                    }
                }

                bot.pendingAttack = null;
            }

            // Handle misses - broadcast for visual effects (tracer/muzzle flash without damage)
            if (bot.pendingMiss) {
                const miss = bot.pendingMiss;

                // Broadcast miss for visual effects (tracer, muzzle flash)
                this.io.to(`match_${this.matchId}`).emit('bot_attack_miss', {
                    botId: botId,
                    targetId: miss.targetId,
                    aimPosition: miss.aimPosition,
                    weaponType: miss.weaponType
                });

                bot.pendingMiss = null;
            }
        }
    }

    /**
     * Broadcast all bot states to clients
     */
    broadcastBotStates() {
        const botStates = [];

        for (const [botId, bot] of this.bots) {
            botStates.push(bot.getNetworkState());
        }

        if (botStates.length > 0) {
            this.io.to(`match_${this.matchId}`).emit('bot_states', botStates);
        }
    }

    /**
     * Get all bot states (for initial sync)
     */
    getAllBotStates() {
        const states = [];
        for (const [botId, bot] of this.bots) {
            states.push(bot.getNetworkState());
        }
        return states;
    }

    /**
     * Get bot scores for leaderboard
     */
    getBotScores() {
        const scores = {};
        for (const [botId, bot] of this.bots) {
            scores[botId] = {
                oderId: botId,
                username: bot.name,
                kills: bot.kills,
                deaths: bot.deaths,
                shotsFired: bot.shotsFired || 0,
                shotsHit: bot.shotsHit || 0,
                damageDealt: bot.damageDealt || 0,
                isBot: true
            };
        }
        return scores;
    }

    /**
     * Get bot count
     */
    getBotCount() {
        return this.bots.size;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stop();

        // Clear all bots from entity manager
        for (const [botId, bot] of this.bots) {
            this.entityManager.remove(bot);
        }

        this.bots.clear();
        this.players.clear();
        this.world.competitors = [];
    }
}

module.exports = {
    ServerBotManager,
    ServerWorld,
    GAMER_NAMES
};
