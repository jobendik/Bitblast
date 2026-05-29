// RIFT Game Server - Multiplayer version with YUKA AI Bots
// Run with: node server/standalone.cjs

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Import YUKA-based server bot system
const { ServerBotManager } = require('./yuka-bot/ServerBotManager');

const app = express();
const server = http.createServer(app);

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function getPublicServerUrlFromSocket(socket) {
  const headers = (socket && socket.handshake && socket.handshake.headers) ? socket.handshake.headers : {};
  const forwardedProto = (headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const proto = forwardedProto || 'http';

  const forwardedHost = (headers['x-forwarded-host'] || '').toString().split(',')[0].trim();
  const host = forwardedHost || (headers.host ? headers.host.toString() : '');

  const port = process.env.PORT || 3000;
  const fallbackHost = `localhost:${port}`;

  return `${proto}://${host || fallbackHost}`;
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // In dev, allow all origins (needed for LAN/mobile testing).
      if (!isProduction()) return callback(null, true);

      // In prod, be stricter.
      if (!origin) return callback(null, true);
      const allowed = new Set([
        'https://playrift.no',
        'http://playrift.no'
      ]);
      return callback(null, allowed.has(origin));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: (origin, callback) => {
    if (!isProduction()) return callback(null, true);
    if (!origin) return callback(null, true);
    const allowed = new Set([
      'https://playrift.no',
      'http://playrift.no'
    ]);
    return callback(null, allowed.has(origin));
  },
  credentials: true
}));
app.use(express.json());

// ============== State ==============
const connectedPlayers = new Map(); // socketId -> playerData
const activeMatches = new Map();    // matchId -> { players, scores, state }

// Realistic gamer names pool - bots will use these to blend in with real players
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

// Get a random gamer name for bots
function getRandomGamerName(index) {
  return GAMER_NAMES[index % GAMER_NAMES.length];
}

// Use a SHARED match for development - all players join the same match
const SHARED_MATCH_ID = 'rift_arena_1';
let matchCreated = false;

// Matchmaking settings
const MAX_PLAYERS = 4;
const MATCHMAKING_COUNTDOWN_SECONDS = 10;
let matchmakingTimer = null;
let countdownRemaining = 0;
const playersInQueue = new Set(); // socket IDs of players waiting

// Spawn points from level.json - 4 corners of the map
const SPAWN_POINTS = [
  { position: { x: -33.5, y: -4.9, z: 42 }, rotation: { x: 0, y: 0, z: 0 } },
  { position: { x: 29.5, y: -7.17, z: -27.5 }, rotation: { x: 0, y: Math.PI, z: 0 } },
  { position: { x: -50.5, y: -4.52, z: -14 }, rotation: { x: 0, y: -Math.PI / 2, z: 0 } },
  { position: { x: 39.7, y: -7.17, z: 35 }, rotation: { x: 0, y: Math.PI / 2, z: 0 } }
];

// ============== Input validation / anti-cheat ==============
// The client is still responsible for hit detection, but the server validates and
// clamps everything it receives so a tampered client can't deal absurd damage,
// teleport, send NaN/Infinity, or flood events.
const ARENA_HALF = 90;   // generous playable half-extent (meters)
const ARENA_MIN_Y = -20;
const ARENA_MAX_Y = 60;
const MAX_CHAT_LENGTH = 200;

// Max plausible single-hit damage per weapon (body damage x headshot multiplier),
// mirrored from src/config/weaponConfigs.ts. Anything above this is rejected/clamped.
const WEAPON_MAX_DAMAGE = {
  AK47: 35, AWP: 158, LMG: 29, M4: 30, Pistol: 28,
  Scar: 40, Shotgun: 96, Sniper: 170, Tec9: 20,
};
const DEFAULT_MAX_DAMAGE = 170;

const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isValidVec3 = (v) => v && isFiniteNum(v.x) && isFiniteNum(v.y) && isFiniteNum(v.z);

function clampVec3InArena(v) {
  return {
    x: Math.max(-ARENA_HALF, Math.min(ARENA_HALF, v.x)),
    y: Math.max(ARENA_MIN_Y, Math.min(ARENA_MAX_Y, v.y)),
    z: Math.max(-ARENA_HALF, Math.min(ARENA_HALF, v.z)),
  };
}

const maxDamageFor = (weapon) => WEAPON_MAX_DAMAGE[weapon] ?? DEFAULT_MAX_DAMAGE;

// Per-socket token-bucket rate limiter. Returns false when the caller should drop
// the event. `perSecond` is both the sustained rate and the burst size.
function allowEvent(player, key, perSecond) {
  if (!player) return false;
  const now = Date.now();
  if (!player._rate) player._rate = {};
  const bucket = player._rate[key] || { tokens: perSecond, last: now };
  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(perSecond, bucket.tokens + elapsed * perSecond);
  bucket.last = now;
  player._rate[key] = bucket;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// ============== Server-Authoritative YUKA Bot System ==============
// Full YUKA AI running on server - preserves all 6 months of AI development!
let serverBotManager = null;

// Path to NavMesh file (relative to server directory when running)
const NAVMESH_PATH = path.join(__dirname, '..', 'public', 'assets', 'data', 'navmeshes', 'navmesh.glb');

// Initialize YUKA bot manager at server startup (but don't spawn bots yet)
async function initializeYukaBotSystem() {
  console.log('🧠 Initializing YUKA AI Bot System...');

  serverBotManager = new ServerBotManager(io, SHARED_MATCH_ID);

  const success = await serverBotManager.initialize(NAVMESH_PATH);

  if (success) {
    console.log('✅ YUKA AI Bot System ready! (waiting for match to spawn bots)');
    // DON'T spawn bots here - wait for a match to start
    // Bots will be spawned when players join via initializeMatchBots()
  } else {
    console.warn('⚠️ YUKA Bot System failed to initialize - bots will use fallback behavior');
  }

  return success;
}

// Initialize bots for a match (called when match starts)
// Returns a Promise that resolves when bots are ready
function initializeMatchBots(bots, usedSpawnIndices) {
  console.log(`🤖 initializeMatchBots called with ${bots.length} bots`);

  if (!serverBotManager) {
    console.error('❌ Cannot initialize bots - ServerBotManager not ready');
    return Promise.resolve();
  }

  // Clear any existing bots
  console.log('🧹 Destroying existing bot manager...');
  serverBotManager.destroy();

  // Re-create manager for this match
  console.log('🔧 Creating new ServerBotManager...');
  serverBotManager = new ServerBotManager(io, SHARED_MATCH_ID);

  console.log('⏳ ServerBotManager.initialize() starting (async)...');
  return serverBotManager.initialize(NAVMESH_PATH).then(() => {
    console.log('✅ ServerBotManager initialized, spawning bots...');

    // Spawn bots with the exact configurations from the match (including oderId)
    serverBotManager.spawnBotsWithConfig(bots);

    // Start the AI simulation
    serverBotManager.start();

    console.log(`🤖 YUKA bots initialized: ${bots.length} bots spawned and AI started`);
    console.log(`📊 Bot scores available: ${Object.keys(serverBotManager.getBotScores()).length}`);

    // Broadcast score update to all clients to include bot scores in leaderboard
    io.to(`match_${SHARED_MATCH_ID}`).emit('score_update', getMatchState(SHARED_MATCH_ID));
    console.log('📊 Score update broadcast after bot initialization');
  }).catch(err => {
    console.error('❌ Failed to initialize ServerBotManager:', err);
  });
}

// Handle player position updates for bot vision
function updatePlayerForBots(playerData) {
  if (serverBotManager) {
    serverBotManager.updatePlayer(playerData);
  }
}

// Handle bot taking damage from player
function handleBotDamage(botId, damage, attackerId) {
  if (!serverBotManager) return null;

  const killEvent = serverBotManager.damageBot(botId, damage, attackerId);

  if (killEvent) {
    // Credit kill to attacker
    for (const [socketId, player] of connectedPlayers) {
      if (player.oderId === attackerId) {
        player.kills++;
        break;
      }
    }

    // Broadcast kill event
    io.to(`match_${SHARED_MATCH_ID}`).emit('bot_killed', killEvent);
    // Send score update to refreshing leaderboards
    io.to(`match_${SHARED_MATCH_ID}`).emit('score_update', getMatchState(SHARED_MATCH_ID));
    console.log(`💀 Bot ${killEvent.botUsername} killed by ${attackerId}`);
  }

  return killEvent;
}

// Get bot count for API
function getBotCount() {
  return serverBotManager ? serverBotManager.getBotCount() : 0;
}

// ============== API Routes ==============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', players: connectedPlayers.size, matches: activeMatches.size, bots: getBotCount() });
});

// ============== Socket Handlers ==============
io.on('connection', (socket) => {
  const token = socket.handshake.auth.token || 'anonymous-' + socket.id.slice(0, 6);
  const oderId = token.includes('-') ? token.split('-').pop() : token;

  console.log(`🎮 Player connected: ${oderId} (${socket.id})`);

  // Log ALL incoming events for debugging
  socket.onAny((eventName, ...args) => {
    console.log(`📨 Event from ${oderId}: ${eventName}`, args.length > 0 ? JSON.stringify(args[0]).slice(0, 100) : '');
  });

  connectedPlayers.set(socket.id, {
    id: socket.id,
    oderId: oderId,
    userId: oderId,
    username: `Player_${oderId.slice(0, 4)}`,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0 },
    matchId: null,
    team: null,
    isAlive: true,
    kills: 0,
    deaths: 0,
    health: 100 // Server-side authoritative health (matches CONFIG.PLAYER.MAX_HEALTH)
  });

  // Join lobby room for lobby chat (before entering a match)
  socket.join('lobby');

  // ========== Matchmaking ==========
  socket.on('start_queue', (data) => {
    const modeId = data?.modeId || 'ffa';
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    // Update username if provided
    if (data?.username && typeof data.username === 'string' && data.username.trim()) {
      player.username = data.username.trim().slice(0, 24); // Limit to 24 chars
    }

    console.log(`📋 ${player.username} (${oderId}) queuing for ${modeId}`);

    // Ensure shared match exists
    if (!matchCreated) {
      createMatch(SHARED_MATCH_ID, []);
      matchCreated = true;
      console.log(`🏟️ Created shared match: ${SHARED_MATCH_ID}`);
    }

    // Add to queue
    playersInQueue.add(socket.id);

    // Add player to the shared match
    const match = activeMatches.get(SHARED_MATCH_ID);
    if (match && !match.players.includes(socket.id)) {
      match.players.push(socket.id);
    }

    const humanCount = playersInQueue.size;
    console.log(`👥 Players in queue: ${humanCount}/${MAX_PLAYERS}`);

    // Send queue status to this player
    socket.emit('queue_status', {
      position: humanCount,
      waiting: true,
      playersFound: humanCount,
      maxPlayers: MAX_PLAYERS
    });

    // Notify all queued players about updated count
    playersInQueue.forEach(socketId => {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.emit('queue_update', {
          playersFound: humanCount,
          maxPlayers: MAX_PLAYERS,
          countdown: countdownRemaining
        });
      }
    });

    // If we have max players, start immediately
    if (humanCount >= MAX_PLAYERS) {
      console.log(`✅ Max players reached! Starting match immediately`);
      if (matchmakingTimer) {
        clearInterval(matchmakingTimer);
        matchmakingTimer = null;
      }
      startMatchForQueue(modeId);
      return;
    }

    // Start countdown if this is the first player
    if (humanCount === 1 && !matchmakingTimer) {
      countdownRemaining = MATCHMAKING_COUNTDOWN_SECONDS;
      console.log(`⏱️ Starting ${MATCHMAKING_COUNTDOWN_SECONDS}s matchmaking countdown...`);

      matchmakingTimer = setInterval(() => {
        countdownRemaining--;

        // Broadcast countdown to all queued players
        playersInQueue.forEach(socketId => {
          const sock = io.sockets.sockets.get(socketId);
          if (sock) {
            sock.emit('queue_countdown', {
              countdown: countdownRemaining,
              playersFound: playersInQueue.size,
              maxPlayers: MAX_PLAYERS
            });
          }
        });

        console.log(`⏱️ Countdown: ${countdownRemaining}s (${playersInQueue.size} players)`);

        if (countdownRemaining <= 0) {
          console.log('⏱️ Countdown finished! Starting match...');
          clearInterval(matchmakingTimer);
          matchmakingTimer = null;
          startMatchForQueue(modeId);
        }
      }, 1000);
    }
  });

  // Function to start match with bots filling empty slots
  function startMatchForQueue(modeId) {
    console.log('🎮 startMatchForQueue() called');
    const humanCount = playersInQueue.size;
    const botsNeeded = MAX_PLAYERS - humanCount;

    console.log(`🚀 Starting match with ${MAX_PLAYERS} players`);

    // Create bot players - assign spawn points AFTER human players
    // Humans get spawn indices 0, 1, ... (humanCount-1)
    // Bots get spawn indices humanCount, humanCount+1, ... (MAX_PLAYERS-1)
    const bots = [];
    for (let i = 0; i < botsNeeded; i++) {
      const botId = `bot_${i + 1}`;
      const botSpawnIndex = humanCount + i; // Start after human spawn indices
      const botSpawnPoint = SPAWN_POINTS[botSpawnIndex % SPAWN_POINTS.length];
      bots.push({
        oderId: botId,
        username: getRandomGamerName(i),
        isBot: true,
        spawnIndex: botSpawnIndex,
        position: botSpawnPoint.position,
        rotation: botSpawnPoint.rotation
      });
      console.log(`📍 Bot ${botId} (${getRandomGamerName(i)}) assigned spawn ${botSpawnIndex}: (${botSpawnPoint.position.x}, ${botSpawnPoint.position.y}, ${botSpawnPoint.position.z})`);
    }

    // Send match_found immediately (without revealing bot information)
    const queuedPlayers = Array.from(playersInQueue);
    queuedPlayers.forEach(socketId => {
      const sock = io.sockets.sockets.get(socketId);
      const player = connectedPlayers.get(socketId);
      if (sock && player) {
        const publicServerUrl = getPublicServerUrlFromSocket(sock);
        // IMPORTANT: Do not expose bot counts to clients - show as full player match
        sock.emit('match_found', {
          matchId: SHARED_MATCH_ID,
          modeId,
          players: MAX_PLAYERS,
          serverUrl: publicServerUrl
        });
      }
    });

    const match = activeMatches.get(SHARED_MATCH_ID);
    if (match) {
      match.bots = bots;
    }

    // Initialize server-side YUKA bot AI with full AI behaviors
    // Wait for bots to be ready before sending match_start
    const usedSpawnIndices = Array.from({ length: humanCount }, (_, i) => i);
    initializeMatchBots(bots, usedSpawnIndices).then(() => {
      console.log('🎮 Bots initialized, sending match_start to players...');

      // Now send match_start to all players (bots are ready)
      queuedPlayers.forEach(socketId => {
        const sock = io.sockets.sockets.get(socketId);
        const player = connectedPlayers.get(socketId);
        if (sock && player) {
          const publicServerUrl = getPublicServerUrlFromSocket(sock);
          sock.emit('match_start', {
            matchId: SHARED_MATCH_ID,
            modeId,
            serverUrl: publicServerUrl,
            token: `match-token-${player.oderId}`,
            gameUrl: `/?matchId=${SHARED_MATCH_ID}`,
            bots: bots
          });
        }
      });
    });

    // Clear the queue (but don't reset match - players will rejoin via join_match)
    playersInQueue.clear();

    // Reset for next match after this one
    // Cleanup Timer (120s) - destroys bots/match after generous buffer
    // This ensures bots stay alive even if client loading takes 30-40s
    setTimeout(() => {
      matchCreated = false;
      activeMatches.delete(SHARED_MATCH_ID);
      if (serverBotManager) {
        serverBotManager.destroy();
      }
      console.log(`🔄 Match ${SHARED_MATCH_ID} cleanup - ready for new match (120s timeout)`);
    }, 120000); // 2 minutes to cover full round + loading + end screen
  }

  socket.on('cancel_queue', () => {
    console.log(`❌ ${oderId} cancelled queue`);
    playersInQueue.delete(socket.id);

    // Notify remaining players about updated count
    playersInQueue.forEach(socketId => {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.emit('queue_update', {
          playersFound: playersInQueue.size,
          maxPlayers: MAX_PLAYERS,
          countdown: countdownRemaining
        });
      }
    });

    // If no players left, cancel countdown
    if (playersInQueue.size === 0 && matchmakingTimer) {
      clearInterval(matchmakingTimer);
      matchmakingTimer = null;
      countdownRemaining = 0;
      console.log(`⏱️ Countdown cancelled - no players in queue`);
    }
  });

  // ========== Match Events ==========
  socket.on('join_match', (payload) => {
    const matchId = (typeof payload === 'string') ? payload : payload?.matchId;
    if (!matchId) {
      socket.emit('error', { message: 'Invalid matchId' });
      return;
    }
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    // Use shared match
    const actualMatchId = matchId || SHARED_MATCH_ID;

    // Ensure match exists
    if (!activeMatches.has(actualMatchId)) {
      createMatch(actualMatchId, []);
    }

    const match = activeMatches.get(actualMatchId);

    // Check if this is the first player joining and no bots are spawned yet (dev mode)
    // In dev mode, players join directly without going through matchmaking
    const currentHumanCount = match.players.filter(sid => connectedPlayers.has(sid)).length;
    const botsNeeded = MAX_PLAYERS - currentHumanCount - 1; // -1 for this joining player

    if (serverBotManager && serverBotManager.getBotCount() === 0 && botsNeeded > 0) {
      console.log(`🎮 First player joining directly (dev mode) - spawning ${botsNeeded} bots`);

      // Create bot configs
      const bots = [];
      for (let i = 0; i < botsNeeded; i++) {
        const botSpawnIndex = currentHumanCount + 1 + i; // After this player
        const botSpawnPoint = SPAWN_POINTS[botSpawnIndex % SPAWN_POINTS.length];
        bots.push({
          oderId: `bot_${i + 1}`,
          username: getRandomGamerName(i),
          isBot: true,
          spawnIndex: botSpawnIndex,
          position: botSpawnPoint.position,
          rotation: botSpawnPoint.rotation
        });
      }

      // Spawn bots
      serverBotManager.spawnBotsWithConfig(bots);
      serverBotManager.start();
      console.log(`🤖 Dev mode: ${botsNeeded} bots spawned and AI started`);
    }

    // Assign spawn index based on order of joining (0-3)
    let spawnIndex = match.players.length; // Next available index
    if (!match.players.includes(socket.id)) {
      match.players.push(socket.id);
    } else {
      // Player already in match, find their index
      spawnIndex = match.players.indexOf(socket.id);
    }

    // Assign spawn point to player
    const spawnPoint = SPAWN_POINTS[spawnIndex % SPAWN_POINTS.length];
    player.spawnIndex = spawnIndex;
    player.assignedSpawn = spawnPoint;

    // Set initial position to spawn point
    player.position = { ...spawnPoint.position };

    player.matchId = actualMatchId;
    socket.join(`match_${actualMatchId}`);

    // Notify ALL players in match about this new player (include spawn position)
    io.to(`match_${actualMatchId}`).emit('player_joined', {
      userId: player.userId,
      team: player.team,
      username: player.username,
      spawnIndex: spawnIndex,
      spawnPosition: spawnPoint.position
    });

    // Send current match state to joining player (include their spawn point)
    const matchState = getMatchState(actualMatchId);
    matchState.yourSpawnIndex = spawnIndex;
    matchState.yourSpawnPosition = spawnPoint.position;
    matchState.yourSpawnRotation = spawnPoint.rotation;
    socket.emit('match_state', matchState);

    console.log(`📍 Assigned spawn point ${spawnIndex} to ${player.username}: (${spawnPoint.position.x}, ${spawnPoint.position.y}, ${spawnPoint.position.z})`);

    // Register player with bot system at spawn position (so bots can see them immediately)
    updatePlayerForBots({
      oderId: player.oderId,
      username: player.username,
      position: spawnPoint.position,
      rotation: spawnPoint.rotation || { x: 0, y: 0, z: 0 },
      health: player.health || 100,
      isAlive: true
    });

    // Tell this player about all OTHER players already in the match
    match.players.forEach((existingSocketId, index) => {
      if (existingSocketId !== socket.id) {
        const existingPlayer = connectedPlayers.get(existingSocketId);
        if (existingPlayer) {
          socket.emit('player_joined', {
            userId: existingPlayer.userId || existingPlayer.oderId,
            team: existingPlayer.team,
            username: existingPlayer.username,
            spawnIndex: existingPlayer.spawnIndex,
            spawnPosition: existingPlayer.assignedSpawn?.position
          });
          // Also send their current position
          socket.emit('player_update', {
            userId: existingPlayer.userId,
            position: existingPlayer.position,
            rotation: existingPlayer.rotation,
            velocity: { x: 0, y: 0, z: 0 },
            isSprinting: false,
            isGrounded: true
          });
        }
      }
    });

    console.log(`🏟️ ${oderId} joined match ${actualMatchId} (${match.players.length} players total)`);
  });

  // ========== Game Sync Events ==========
  socket.on('player_update', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId) return;

    // Throttle and validate: ignore floods and reject non-finite positions.
    if (!allowEvent(player, 'update', 40)) return;
    if (!data || !isValidVec3(data.position)) return;

    // Clamp position into the arena so a tampered client can't teleport out of bounds.
    player.position = clampVec3InArena(data.position);
    if (data.rotation && isFiniteNum(data.rotation.x) && isFiniteNum(data.rotation.y)) {
      player.rotation = data.rotation;
    }
    player.isSprinting = !!data.isSprinting;
    player.isGrounded = !!data.isGrounded;
    if (typeof data.weapon === 'string') {
      player.weapon = data.weapon;
    }

    // Update player position for YUKA bot vision/perception
    updatePlayerForBots({
      oderId: player.oderId,
      username: player.username,
      position: player.position,
      rotation: player.rotation,
      health: player.health,
      isAlive: player.isAlive
    });

    // Broadcast the validated state to other players (velocity is unused by the
    // receiver, so it's intentionally dropped to save bandwidth).
    socket.to(`match_${player.matchId}`).emit('player_update', {
      userId: oderId,
      position: player.position,
      rotation: player.rotation,
      isSprinting: player.isSprinting,
      isGrounded: player.isGrounded,
      weapon: player.weapon
    });
  });

  socket.on('weapon_switch', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId) return;

    console.log(`🔫 ${oderId} switched to ${data.weapon}`);

    // Store current weapon on player
    player.weapon = data.weapon;

    // Broadcast to all OTHER players in the match
    socket.to(`match_${player.matchId}`).emit('weapon_switch', {
      userId: oderId,
      weapon: data.weapon
    });
  });

  socket.on('player_shoot', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId) return;

    console.log(`🔫 ${oderId} fired ${data.weaponType || 'weapon'}`);

    socket.to(`match_${player.matchId}`).emit('player_shoot', {
      userId: oderId,
      origin: data.origin,
      direction: data.direction,
      weaponType: data.weaponType
    });
  });

  // Bullet impact event - for tracers, decals, and particle effects
  socket.on('bullet_impact', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId) return;

    socket.to(`match_${player.matchId}`).emit('bullet_impact', {
      userId: oderId,
      muzzlePos: data.muzzlePos,
      hitPos: data.hitPos,
      hitNormal: data.hitNormal,
      material: data.material,
      hitEntity: data.hitEntity
    });
  });

  // Reload event
  socket.on('player_reload', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId) return;

    console.log(`🔄 ${oderId} reloading ${data.weaponType}`);

    socket.to(`match_${player.matchId}`).emit('player_reload', {
      userId: oderId,
      weaponType: data.weaponType
    });
  });

  // Chat message event
  socket.on('chat_message', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    // Throttle, validate, length-cap and strip angle brackets to avoid HTML injection.
    if (!allowEvent(player, 'chat', 3)) return;
    if (!data || typeof data.message !== 'string') return;
    const message = data.message.replace(/[<>]/g, '').slice(0, MAX_CHAT_LENGTH).trim();
    if (!message) return;

    const chatPayload = {
      userId: oderId,
      username: player.username || `Player_${oderId.slice(0, 4)}`,
      message: message
    };

    if (player.matchId) {
      // In a match - broadcast to match room
      io.to(`match_${player.matchId}`).emit('chat_message', chatPayload);
    } else {
      // In lobby - broadcast to lobby room
      io.to('lobby').emit('chat_message', chatPayload);
    }
  });

  socket.on('player_hit', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId || !data) return;

    // Anti-cheat: throttle, require a living attacker, and validate the damage.
    if (!allowEvent(player, 'hit', 30)) return;
    if (!player.isAlive) return; // a dead player can't deal damage
    if (!isFiniteNum(data.damage) || data.damage <= 0) return;

    // Find target player
    let targetPlayer = null;
    for (const [, p] of connectedPlayers) {
      if (p.userId === data.targetId) {
        targetPlayer = p;
        break;
      }
    }

    if (!targetPlayer || !targetPlayer.isAlive) return; // no target or already dead
    if (targetPlayer === player) return;                // can't damage yourself here
    // Friendly fire is decided server-side, not by the (untrusted) client.
    if (player.team && targetPlayer.team && player.team === targetPlayer.team) return;

    // Clamp damage to the maximum the attacker's current weapon can plausibly deal.
    const damage = Math.min(data.damage, maxDamageFor(player.weapon));
    targetPlayer.health = Math.max(0, targetPlayer.health - damage);

    io.to(`match_${player.matchId}`).emit('player_damaged', {
      targetId: targetPlayer.userId,
      attackerId: oderId,
      damage: damage,
      hitLocation: data.hitLocation
    });

    // Check for death (Authoritative)
    if (targetPlayer && targetPlayer.health <= 0) {
      console.log(`[SERVER] Player ${targetPlayer.userId} died from damage (health 0)`);

      targetPlayer.isAlive = false;
      targetPlayer.deaths++;
      player.kills++; // Attacker gets a kill

      io.to(`match_${player.matchId}`).emit('player_killed', {
        victimId: targetPlayer.userId,
        attackerId: oderId,
        weaponType: player.weapon || 'weapon'
      });

      // Send score update
      io.to(`match_${player.matchId}`).emit('score_update', getMatchState(player.matchId));

      // SERVER-SIDE RESPAWN: Auto-respawn after 5 seconds
      const respawnTargetId = targetPlayer.userId;
      const respawnMatchId = player.matchId;
      setTimeout(() => {
        // Find the player again
        for (const [sid, p] of connectedPlayers) {
          if (p.userId === respawnTargetId && !p.isAlive) {
            console.log(`[SERVER] ⏰ Auto-respawning player ${respawnTargetId}`);
            p.isAlive = true;
            p.health = 100;

            // Assign new random spawn point
            const spawnPoint = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
            p.position = { ...spawnPoint.position };

            io.to(`match_${respawnMatchId}`).emit('player_respawned', {
              userId: respawnTargetId,
              team: p.team,
              position: spawnPoint.position,
              rotation: spawnPoint.rotation
            });
            break;
          }
        }
      }, 5000); // 5 second respawn timer (death animation is ~3s)

      // Check for match end
      const match = activeMatches.get(player.matchId);
      if (match) {
        const maxKills = Math.max(...Array.from(connectedPlayers.values())
          .filter(p => p.matchId === player.matchId)
          .map(p => p.kills));

        if (maxKills >= 25) {
          io.to(`match_${player.matchId}`).emit('match_ended', getMatchState(player.matchId));
        }
      }
    }
  });

  // Handle player hitting a bot (server-authoritative bot damage)
  socket.on('bot_hit', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId || !data) return;

    // Anti-cheat: throttle, require a living attacker, validate + clamp damage.
    if (!allowEvent(player, 'hit', 30)) return;
    if (!player.isAlive) return;
    if (!isFiniteNum(data.damage) || data.damage <= 0) return;
    if (typeof data.botId !== 'string') return;

    const damage = Math.min(data.damage, maxDamageFor(player.weapon));

    // Use the new YUKA-based bot damage handler
    handleBotDamage(data.botId, damage, player.oderId);
  });

  // A client reports its OWN death (e.g. killed by a server bot). This is only a
  // death/killfeed hint — it must NOT award kills, otherwise a tampered client
  // could inflate any player's score. Human-vs-human kills are scored
  // authoritatively in 'player_hit'.
  socket.on('player_died', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId) return;
    if (!player.isAlive) return; // already processed (avoids double-counting deaths)
    if (!allowEvent(player, 'died', 2)) return;

    player.isAlive = false;
    player.deaths++;

    // Cosmetic killfeed only; attackerId is not trusted for scoring.
    io.to(`match_${player.matchId}`).emit('player_killed', {
      victimId: oderId,
      attackerId: typeof data?.attackerId === 'string' ? data.attackerId : 'unknown',
      weaponType: typeof data?.weaponType === 'string' ? data.weaponType : 'unknown'
    });

    // Broadcast the authoritative scoreboard (unchanged by this event).
    io.to(`match_${player.matchId}`).emit('score_update', getMatchState(player.matchId));
  });

  socket.on('player_respawn', (data) => {
    console.log(`📥 [RESPAWN] Received player_respawn from ${oderId}`);
    const player = connectedPlayers.get(socket.id);
    if (!player?.matchId) {
      console.log(`❌ [RESPAWN] Player ${oderId} has no matchId, ignoring`);
      return;
    }

    const oldHealth = player.health;
    const wasAlive = player.isAlive;
    player.isAlive = true;
    player.health = 100; // Reset health to max (matches CONFIG.PLAYER.MAX_HEALTH)

    // Assign new random spawn point
    const spawnPoint = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
    player.position = { ...spawnPoint.position };

    console.log(`🔄 [RESPAWN] ${oderId} respawned at (${spawnPoint.position.x}, ${spawnPoint.position.y}, ${spawnPoint.position.z})`);
    console.log(`🔄 [RESPAWN] ${oderId} respawned: health ${oldHealth} -> ${player.health}, isAlive ${wasAlive} -> true`);
    console.log(`🔄 [RESPAWN] Broadcasting to match_${player.matchId}`);

    io.to(`match_${player.matchId}`).emit('player_respawned', {
      userId: oderId,
      team: player.team,
      position: spawnPoint.position,
      rotation: spawnPoint.rotation
    });
  });

  // ========== Disconnect ==========
  socket.on('disconnect', () => {
    const player = connectedPlayers.get(socket.id);

    // Remove from queue if they were waiting
    if (playersInQueue.has(socket.id)) {
      playersInQueue.delete(socket.id);
      console.log(`👋 ${oderId} left queue (disconnected)`);

      // Notify remaining players
      playersInQueue.forEach(socketId => {
        const sock = io.sockets.sockets.get(socketId);
        if (sock) {
          sock.emit('queue_update', {
            playersFound: playersInQueue.size,
            maxPlayers: MAX_PLAYERS,
            countdown: countdownRemaining
          });
        }
      });

      // Cancel countdown if no players left
      if (playersInQueue.size === 0 && matchmakingTimer) {
        clearInterval(matchmakingTimer);
        matchmakingTimer = null;
        countdownRemaining = 0;
      }
    }

    if (player) {
      // Notify match
      if (player.matchId) {
        const match = activeMatches.get(player.matchId);
        if (match) {
          const idx = match.players.indexOf(socket.id);
          if (idx !== -1) match.players.splice(idx, 1);
        }
        io.to(`match_${player.matchId}`).emit('player_left', { userId: player.userId });
      }

      // Remove from bot perception system
      if (serverBotManager) {
        serverBotManager.removePlayer(player.oderId);
      }
    }

    connectedPlayers.delete(socket.id);
    console.log(`👋 Player disconnected: ${oderId}`);
  });
});

// ============== Match Functions ==============
function createMatch(matchId, players) {
  activeMatches.set(matchId, {
    id: matchId,
    players: players,
    createdAt: Date.now(),
    state: 'active',
    scores: {}
  });
}

function getMatchState(matchId) {
  const match = activeMatches.get(matchId);
  if (!match) return null;

  const scores = {};
  const teams = {};

  // Add player scores
  for (const [socketId, player] of connectedPlayers) {
    if (player.matchId === matchId) {
      scores[player.userId] = {
        oderId: player.userId,
        username: player.username,
        kills: player.kills,
        deaths: player.deaths,
        team: player.team,
        isBot: false
      };
      if (player.team) {
        teams[player.userId] = player.team;
      }
    }
  }

  console.log(`[getMatchState] Player scores: ${Object.keys(scores).length}`);

  // Add bot scores to leaderboard
  if (serverBotManager && serverBotManager.isReady) {
    const botScores = serverBotManager.getBotScores();
    console.log(`[getMatchState] Bot scores to merge: ${Object.keys(botScores).length}`, Object.keys(botScores));
    Object.assign(scores, botScores);
  } else if (serverBotManager) {
    // Bot manager exists but not ready yet
    console.log(`[getMatchState] WARNING: serverBotManager not ready yet (isReady=${serverBotManager.isReady})`);
  } else {
    console.log(`[getMatchState] WARNING: serverBotManager is null/undefined!`);
  }

  console.log(`[getMatchState] Final scores total: ${Object.keys(scores).length}`, Object.keys(scores));

  return {
    matchId,
    state: match.state,
    scores,
    teams,
    killLimit: 25,
    playerCount: match.players.length
  };
}

// ============== Periodic Score Updates ==============
// Send score updates every 2 seconds to keep leaderboards in sync
setInterval(() => {
  const match = activeMatches.get(SHARED_MATCH_ID);
  if (match && connectedPlayers.size > 0) {
    io.to(`match_${SHARED_MATCH_ID}`).emit('score_update', getMatchState(SHARED_MATCH_ID));
  }
}, 2000);

// ============== Start Server ==============
const PORT = process.env.PORT || 3000;

// Fail gracefully if the port is already taken (e.g. a previous server is still running)
// instead of dumping a raw stack trace.
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`✖ Port ${PORT} is already in use — another server instance is probably still running.`);
    console.error('  Fix it with one of:');
    console.error(`    • Windows : Get-NetTCPConnection -LocalPort ${PORT} -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`);
    console.error(`    • macOS/Linux : lsof -ti tcp:${PORT} | xargs kill -9`);
    console.error(`    • Or start on a different port:  $env:PORT=3001; npm run server:standalone`);
    console.error('');
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

// Initialize YUKA bot system before starting server
initializeYukaBotSystem().then((success) => {
  server.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           🎮 RIFT Multiplayer Server Running 🎮            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 HTTP:   http://localhost:${PORT}                           ║`);
    console.log(`║  🔌 Socket: ws://localhost:${PORT}                             ║`);
    console.log('║  📊 Health: /api/health                                    ║');
    console.log('║                                                            ║');
    console.log('║  🧠 YUKA AI: ' + (success ? 'ENABLED ✅' : 'FALLBACK ⚠️') + '                                   ║');
    console.log('║  ⚡ All players join SHARED match: rift_arena_1            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Waiting for players to connect...');
  });
}).catch((error) => {
  console.error('Failed to initialize YUKA bot system:', error);
  // Start server anyway
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (YUKA bots disabled)`);
  });
});
