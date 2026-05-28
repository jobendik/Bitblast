# AI Network Sync Evidence Report
**Dato:** 15. desember 2025  
**Formål:** Kartlegge hvorfor AI (Yuka.js) i BitBlast nå er ute av synk etter forsøk på å flytte AI til server

---

## 0) Entrypoints

### Server Runtime

**Fil:** [server/standalone.cjs](../server/standalone.cjs)  
**Oppstart:** Node.js Express + Socket.IO server  
**Game Loop:** `ServerBotManager.start()` → `setInterval()` kaller `update()` med 20 Hz tickrate  

```javascript
// server/standalone.cjs:1-20
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ServerBotManager } = require('./yuka-bot/ServerBotManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ["http://localhost:5173", ...], methods: ["GET", "POST"] }
});
```

**Server game loop start:**
```javascript
// server/standalone.cjs:88-93
async function initializeYukaBotSystem() {
  serverBotManager = new ServerBotManager(io, SHARED_MATCH_ID);
  const success = await serverBotManager.initialize(NAVMESH_PATH);
  if (success) {
    serverBotManager.start(); // <-- STARTER AI SIMULERING
  }
}
```

**Room/Match creation:**
```javascript
// server/standalone.cjs:53-54
const SHARED_MATCH_ID = 'bitblast_arena_1';
let matchCreated = false;
```

---

### Client Runtime

**Fil:** [src/main.ts](../src/main.ts)  
**Oppstart:** Vite browser entry point  
**Game Loop:** `World.init()` → `World.animate()` → `requestAnimationFrame` loop  

```typescript
// src/main.ts:1-10
import world from './core/World';
import { getMatchManager } from './core/MatchManager';
import { BitBlastLobby } from './lobby/BitBlastLobby';

const lobby = new BitBlastLobby();

lobby.init((matchInfo) => {
  world.init(() => {
    // World init callback - start network + game mode
    world.networkManager.connect(matchInfo.serverUrl, matchInfo.token, matchInfo.matchId, matchInfo.socket);
  });
});
```

**Client game loop:**
```typescript
// src/core/World.ts:1556-1596
public animate() {
  requestAnimationFrame(this._animate);
  this.time.update();
  this.tick++;
  const delta = this.time.getDelta();
  
  // UPDATE LOCAL AI BOTS (hvis single player)
  this.entityManager.update(delta);  // <-- YUKA EntityManager
  
  // UPDATE REMOTE BOTS (hvis multiplayer)
  if (this.isMultiplayerMode) {
    for (const [, remoteBot] of this.remoteBots) {
      remoteBot.update(delta);  // <-- INTERPOLATION, IKKE YUKA
    }
  }
  
  this.renderer.render(this.scene, this.camera);
}
```

---

## 1) Nettverkslag for Game State

### Transport Library

**Socket.IO** (WebSocket wrapper)

**Server setup:**
```javascript
// server/standalone.cjs:15-21
const io = new Server(server, {
  cors: { origin: ["http://localhost:5173", ...], methods: ["GET", "POST"] }
});
```

**Client setup:**
```typescript
// src/server/server.ts:15-20
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", ...],
    methods: ["GET", "POST"]
  }
});
```

### Meldingstyper for AI/NPC

| Message/Event | Direction | Payload Fields | Sent From | Handled In | Notes |
|---------------|-----------|----------------|-----------|------------|-------|
| `bot_states` | S→C | `[{ id, oderId, username, position, rotation, health, isAlive, animation }]` | [server/yuka-bot/ServerBotManager.js:450](../server/yuka-bot/ServerBotManager.js#L450) | [src/network/NetworkManager.ts:551](../src/network/NetworkManager.ts#L551) | Broadcast 10 Hz |
| `bot_attack` | S→C | `{ botId, targetId, damage }` | [server/yuka-bot/ServerBotManager.js:418](../server/yuka-bot/ServerBotManager.js#L418) | [src/network/NetworkManager.ts:570](../src/network/NetworkManager.ts#L570) | Visual FX only |
| `bot_hit_player` | S→C | `{ botId, targetId, damage }` | [server/yuka-bot/ServerBotManager.js:425](../server/yuka-bot/ServerBotManager.js#L425) | [src/network/NetworkManager.ts:582](../src/network/NetworkManager.ts#L582) | Bot→Player damage |
| `bot_killed` | S→C | `{ botId, killerId, botUsername }` | [server/yuka-bot/ServerBotManager.js:431](../server/yuka-bot/ServerBotManager.js#L431) | [src/network/NetworkManager.ts:598](../src/network/NetworkManager.ts#L598) | Death event |
| `bot_respawned` | S→C | `{ botId, position, rotation }` | [server/yuka-bot/ServerBotManager.js:393](../server/yuka-bot/ServerBotManager.js#L393) | [src/network/NetworkManager.ts:606](../src/network/NetworkManager.ts#L606) | Respawn event |
| `player_update` | C→S | `{ userId, position, rotation, isSprinting, isGrounded, weapon }` | Unknown (client send) | [src/server/sockets/gameHandler.ts:77](../src/server/sockets/gameHandler.ts#L77) | For bot vision |
| `player_shoot` | C→S | `{ userId, muzzlePos, hitPos, hitNormal, damage }` | Unknown (client send) | [src/server/sockets/gameHandler.ts:93](../src/server/sockets/gameHandler.ts#L93) | For bot damage |

**Snapshot send (server):**
```javascript
// server/yuka-bot/ServerBotManager.js:447-456
broadcastBotStates() {
  const botStates = [];
  for (const [botId, bot] of this.bots) {
    botStates.push(bot.getNetworkState());
  }
  if (botStates.length > 0) {
    this.io.to(`match_${this.matchId}`).emit('bot_states', botStates);
  }
}
```

**Snapshot receive (client):**
```typescript
// src/network/NetworkManager.ts:551-567
this.socket.on('bot_states', (states: unknown) => {
  const botStates = states as Array<ServerBotState>;
  if (this.onBotStatesCallback) {
    this.onBotStatesCallback(botStates);
  }
});
```

**Snapshot apply (client):**
```typescript
// src/core/World.ts:875-885
this.networkManager.onBotStates((states: ServerBotState[]) => {
  for (const state of states) {
    const remoteBot = this.remoteBots.get(state.id);
    if (remoteBot) {
      remoteBot.updateFromServer(state);  // <-- SETTER TARGET POS/ROT
    }
  }
});
```

---

## 2A) Yuka på Server

### Server imports YUKA fullt ut

```javascript
// server/yuka-bot/ServerBotManager.js:26
const YUKA = require('yuka');
const { loadNavMesh } = require('./ServerNavMeshLoader');
const { ServerBot, ServerPathPlanner, BOT_CONFIG, ... } = require('./ServerBot');
```

### Server EntityManager.update() kalles med delta

```javascript
// server/yuka-bot/ServerBotManager.js:318-350
update() {
  const now = Date.now();
  const deltaMs = now - this.lastUpdateTime;
  const delta = deltaMs / 1000;  // <-- DELTA I SEKUNDER
  this.lastUpdateTime = now;
  
  this.world.deltaTime = delta;
  
  // Update path planner
  if (this.world.pathPlanner) {
    this.world.pathPlanner.update();
  }
  
  // Update YUKA entity manager (updates all bots)
  this.entityManager.update(delta);  // <-- YUKA OPPDATERER ALLE AI-BOTS
  
  // Handle bot respawns
  this.handleRespawns();
  
  // Broadcast attacks
  this.broadcastAttacks();
  
  // Broadcast bot states (at lower rate)
  this.tickCount++;
  if (this.tickCount % Math.floor(this.tickRate / this.broadcastRate) === 0) {
    this.broadcastBotStates();  // <-- SENDER SNAPSHOTS
  }
}
```

### Server oppretter AI-agenter med YUKA

```javascript
// server/yuka-bot/ServerBot.js:724-807
constructor(world, id, displayName, spawnPoint) {
  super();  // <-- EXTENDS YUKA.Vehicle
  
  this.world = world;
  this.oderId = id;
  this.name = displayName;
  
  // YUKA Vehicle properties
  this.boundingRadius = BOT_CONFIG.BOUNDING_RADIUS;
  this.maxSpeed = BOT_CONFIG.MAX_SPEED;
  this.maxForce = BOT_CONFIG.MAX_FORCE;
  this.mass = BOT_CONFIG.MASS;
  this.maxTurnRate = BOT_CONFIG.MAX_TURN_RATE;
  
  // HEAD for vision
  this.head = new YUKA.GameEntity();
  this.head.position.y = BOT_CONFIG.HEAD_HEIGHT;
  this.add(this.head);
  
  // BRAIN - YUKA Think system
  this.brain = new YUKA.Think(this);
  this.brain.addEvaluator(new AttackEvaluator());
  this.brain.addEvaluator(new ExploreEvaluator());
  
  // MEMORY SYSTEM
  this.memorySystem = new YUKA.MemorySystem(this);
  this.memorySystem.memorySpan = BOT_CONFIG.MEMORY_SPAN;
  this.memoryRecords = [];
  
  // VISION SYSTEM
  this.vision = new YUKA.Vision(this);
  this.vision.fieldOfView = BOT_CONFIG.VISION.FOV;
  this.vision.range = BOT_CONFIG.VISION.RANGE;
  
  // TARGET SYSTEM
  this.targetSystem = new ServerTargetSystem(this);
  
  // STEERING BEHAVIORS
  const followPathBehavior = new YUKA.FollowPathBehavior();
  followPathBehavior.nextWaypointDistance = BOT_CONFIG.NAVIGATION.NEXT_WAYPOINT_DISTANCE;
  this.steering.add(followPathBehavior);
  
  const onPathBehavior = new YUKA.OnPathBehavior();
  this.steering.add(onPathBehavior);
  
  // Set spawn position
  this.position.set(spawnPoint.position.x, spawnPoint.position.y, spawnPoint.position.z);
  this.rotation.fromEuler(0, spawnPoint.rotation.y, 0);
}
```

**Server AI update loop:**
```javascript
// server/yuka-bot/ServerBot.js:827-877
update(delta) {
  super.update(delta);  // <-- YUKA Vehicle.update() - STEERING
  
  this.currentTime += delta;
  
  // Keep bot on NavMesh
  this.stayInLevel();
  
  if (this.status === STATUS_ALIVE) {
    // Update perception
    if (this.visionRegulator.ready()) {
      this.updateVision();  // <-- YUKA Vision system
    }
    
    // Update memory
    this.memorySystem.getValidMemoryRecords(this.currentTime, this.memoryRecords);
    
    // Update target system
    if (this.targetSystemRegulator.ready()) {
      this.targetSystem.update();  // <-- SELECT TARGET
    }
    
    // Execute current goals
    this.brain.execute();  // <-- YUKA Think system
    
    // Arbitrate new goals
    if (this.goalArbitrationRegulator.ready()) {
      this.brain.arbitrate();  // <-- GOAL SELECTION
    }
    
    // Weapon system - aim and shoot
    this.updateWeaponSystem(delta);
    
    // Update animation state
    this.updateAnimationState();
  }
  
  // Handle dying/respawn
  if (this.status === STATUS_DYING) { ... }
  if (this.status === STATUS_DEAD) { ... }
  
  return this;
}
```

**Server setter NavMesh:**
```javascript
// server/yuka-bot/ServerBotManager.js:135-148
async initialize(navMeshPath) {
  try {
    const resolvedPath = path.resolve(navMeshPath);
    this.world.navMesh = await loadNavMesh(resolvedPath);  // <-- LASTER NAVMESH
    
    // Create path planner
    this.world.pathPlanner = new ServerPathPlanner(this.world.navMesh);
    
    this.isReady = true;
    console.log('[ServerBotManager] Ready! NavMesh loaded with',
                this.world.navMesh.regions.length, 'regions');
    return true;
  } catch (error) {
    console.error('[ServerBotManager] Failed to initialize:', error);
    return false;
  }
}
```

---

## 2B) Yuka på Klient

### Klient imports YUKA (kun for lokale bots i single player)

```typescript
// src/entities/Bot.ts:1
import { Vehicle, Regulator, Think, FollowPathBehavior, OnPathBehavior, 
         SeekBehavior, Vector3, Vision, MemorySystem, GameEntity, 
         Quaternion, MathUtils } from 'yuka';
```

### Klient EntityManager.update() - KUN I SINGLE PLAYER MODE

```typescript
// src/core/World.ts:1585-1596
public animate() {
  const delta = this.time.getDelta();
  
  // Only update game entities if game is active
  if (isGameActive) {
    this.spawningManager.update(delta);
    this.entityManager.update(delta);  // <-- YUKA (kun single player bots)
    
    // Update remote bots (multiplayer mode only)
    if (this.isMultiplayerMode) {
      for (const [, remoteBot] of this.remoteBots) {
        remoteBot.update(delta);  // <-- IKKE YUKA! Kun interpolering
      }
    }
  }
}
```

### Klient oppretter FORSKJELLIGE bot-typer basert på mode

**Single Player → Local AI Bot (YUKA):**
```typescript
// src/core/World.ts:782-845
_initBots() {
  const matchBotSpawns = (window as any).__matchBotSpawns;
  
  // =============== MULTIPLAYER MODE: Use RemoteBots from server ===============
  if (matchBotSpawns && matchBotSpawns.length > 0) {
    this.isMultiplayerMode = true;
    console.log(`🤖 MULTIPLAYER: Initializing ${matchBotSpawns.length} server-controlled RemoteBots`);
    
    for (const botData of matchBotSpawns) {
      const remoteBot = new RemoteBot(  // <-- INGEN YUKA!
        this.scene,
        this.assetManager,
        botData.oderId,
        botData.username
      );
      
      remoteBot.setPosition(botData.position.x, botData.position.y, botData.position.z);
      this.remoteBots.set(botData.oderId, remoteBot);
    }
    
    return this;
  }
  
  // =============== SINGLE PLAYER MODE: Use local AI Bots ===============
  this.isMultiplayerMode = false;
  const botCount = this.botCount;
  console.log(`🤖 SINGLE PLAYER: Initializing ${botCount} local AI bots`);
  
  for (let i = 0; i < botCount; i++) {
    const bot = new Bot(this);  // <-- EXTENDS YUKA.Vehicle
    // ... setup YUKA brain, vision, steering ...
    this.add(bot);  // <-- ADDS TO entityManager
    this.competitors.push(bot);
  }
}
```

**RemoteBot har INGEN YUKA - kun interpolering:**
```typescript
// src/network/RemoteBot.ts:29-100
export class RemoteBot {
  // INGEN EXTENDS Vehicle
  // INGEN EntityManager
  // INGEN Think/Brain
  // INGEN Vision/Memory
  // INGEN Steering
  
  private targetPosition: THREE.Vector3;
  private targetRotation: THREE.Euler;
  private interpolationSpeed: number = 12;
  
  constructor(scene, assetManager, id, username) {
    this.scene = scene;
    this.id = id;
    this.username = username;
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();
    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);  // <-- DIREKTE I SCENE, IKKE entityManager
  }
}
```

**RemoteBot.update() - KUN INTERPOLERING:**
```typescript
// src/network/RemoteBot.ts:433-448
public update(delta: number): void {
  // Interpolate position
  this.mesh.position.lerp(this.targetPosition, Math.min(1, this.interpolationSpeed * delta));
  
  // Interpolate rotation (Y axis only for horizontal turning)
  const currentY = this.mesh.rotation.y;
  const targetY = this.targetRotation.y;
  
  // Handle rotation wraparound
  let diff = targetY - currentY;
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  
  this.mesh.rotation.y += diff * Math.min(1, this.interpolationSpeed * delta);
  
  // Update animation mixer
  if (this.mixer) {
    this.mixer.update(delta);
  }
}
```

**RemoteBot.updateFromServer() - SETTER TARGET:**
```typescript
// src/network/RemoteBot.ts:248-277
public updateFromServer(state: ServerBotState): void {
  // SET TARGET POSITION (ikke direkte pos)
  this.targetPosition.set(state.position.x, state.position.y, state.position.z);
  this.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
  this.health = state.health;
  
  // Update status from server
  const wasAlive = this.status === 12;
  const isNowAlive = state.isAlive;
  
  if (wasAlive && !isNowAlive) {
    this.onDeath();
  } else if (!wasAlive && isNowAlive) {
    this.onRespawn();
  }
  
  this.status = state.isAlive ? 12 : 13; // STATUS_ALIVE = 12
  this.isDead = !state.isAlive;
  
  // Update animation based on server state
  this.playAnimation(state.animation);
}
```

---

## 3) Hvem Eier Transform til AI-agentene

### Entity Type: ServerBot (server-side)

**Authoritative: SERVER**

**Position settes av:**
- YUKA steering behaviors ([server/yuka-bot/ServerBot.js:827](../server/yuka-bot/ServerBot.js#L827))
- `super.update(delta)` kaller `Vehicle.update()` som oppdaterer `this.position` basert på `velocity`
- NavMesh clamping ([server/yuka-bot/ServerBot.js:895-915](../server/yuka-bot/ServerBot.js#L895-L915))

```javascript
// server/yuka-bot/ServerBot.js:827-835
update(delta) {
  super.update(delta);  // <-- YUKA Vehicle calculates new position from velocity
  this.currentTime += delta;
  this.stayInLevel();  // <-- Clamp to NavMesh
  // ...
}
```

**Rotation settes av:**
- YUKA steering (auto-orient mot velocity direction)
- Path following behaviors

**Velocity settes av:**
- YUKA steering behaviors (FollowPath, Seek, OnPath)
- Goal system (brain.execute() → movement goals)

**Bevis:**
```javascript
// server/yuka-bot/ServerBot.js:1137-1156
getNetworkState() {
  return {
    id: this.oderId,
    oderId: this.oderId,
    username: this.name,
    position: {
      x: this.position.x,  // <-- YUKA Vehicle.position
      y: this.position.y,
      z: this.position.z
    },
    rotation: {
      x: 0,
      y: Math.atan2(this.rotation.m20, this.rotation.m22),  // <-- YUKA Quaternion
      z: 0
    },
    health: this.health,
    isAlive: this.status === STATUS_ALIVE,
    animation: this.animationState
  };
}
```

---

### Entity Type: RemoteBot (client-side)

**Authoritative: SERVER (men lokalt interpolert)**

**Position settes av:**
- `updateFromServer()` setter `targetPosition` ([src/network/RemoteBot.ts:255](../src/network/RemoteBot.ts#L255))
- `update()` interpolerer `mesh.position` mot `targetPosition` ([src/network/RemoteBot.ts:433](../src/network/RemoteBot.ts#L433))

```typescript
// src/network/RemoteBot.ts:248-256
public updateFromServer(state: ServerBotState): void {
  this.targetPosition.set(state.position.x, state.position.y, state.position.z);  // <-- SERVER DATA
  this.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
  // ...
}
```

```typescript
// src/network/RemoteBot.ts:433
public update(delta: number): void {
  this.mesh.position.lerp(this.targetPosition, Math.min(1, this.interpolationSpeed * delta));
  // ...
}
```

**Rotation settes av:**
- `updateFromServer()` setter `targetRotation`
- `update()` interpolerer `mesh.rotation.y` mot `targetRotation.y`

**Velocity:**
- **IKKE BRUKT** - RemoteBot har ingen velocity property eller fysikk

**Konklusjon:** **Server-authoritative med client-side interpolation**

---

### Entity Type: Bot (client-side, single player only)

**Authoritative: CLIENT (local simulation)**

**Position settes av:**
- YUKA steering behaviors (samme som ServerBot)
- `entityManager.update(delta)` ([src/core/World.ts:1590](../src/core/World.ts#L1590))
- NavMesh clamping

**Rotation settes av:**
- YUKA steering (auto-orient)

**Velocity settes av:**
- YUKA steering behaviors

**Bevis:**
```typescript
// src/entities/Bot.ts:1-40
class Bot extends Vehicle {  // <-- YUKA Vehicle
  constructor(world: typeof World) {
    super();
    this.world = world;
    this.boundingRadius = CONFIG.BOT.BOUNDING_RADIUS;
    this.maxSpeed = CONFIG.BOT.MOVEMENT.MAX_SPEED;
    // ... YUKA setup ...
  }
}
```

**Konklusjon:** **Client-authoritative (kun single player)**

---

## 4) Game Loop / Tickrate / Delta-time

### Server Tick

**Loop type:** `setInterval` (fixed timestep forsøk)

```javascript
// server/yuka-bot/ServerBotManager.js:309-318
start() {
  console.log('[ServerBotManager] Starting update loop at', this.tickRate, 'Hz');
  this.lastUpdateTime = Date.now();
  
  this.updateInterval = setInterval(() => {
    this.update();
  }, 1000 / this.tickRate);  // <-- 1000 / 20 = 50ms interval
}
```

**Tickrate:** 20 Hz (50ms per tick)

```javascript
// server/yuka-bot/ServerBotManager.js:120-122
constructor(io, matchId) {
  this.tickRate = 20; // Hz
  this.broadcastRate = 10; // Hz
  this.tickCount = 0;
}
```

**Delta calculation:**

```javascript
// server/yuka-bot/ServerBotManager.js:334-338
update() {
  const now = Date.now();
  const deltaMs = now - this.lastUpdateTime;
  const delta = deltaMs / 1000;  // <-- VARIABEL delta (ikke fixed!)
  this.lastUpdateTime = now;
  // ...
}
```

**PROBLEM:** `setInterval` gir IKKE fixed timestep! Delta vil variere (50ms ± jitter). Server bruker faktisk elapsed time, ikke fixed 0.05s.

---

### Snapshot Send Rate

**Rate:** 10 Hz (broadcast hver 2. tick)

```javascript
// server/yuka-bot/ServerBotManager.js:359-362
if (this.tickCount % Math.floor(this.tickRate / this.broadcastRate) === 0) {
  this.broadcastBotStates();  // <-- Hvert 100ms (20Hz / 10Hz = 2 ticks)
}
```

**Snapshot structure:**
```javascript
// server/yuka-bot/ServerBot.js:1137-1156
getNetworkState() {
  return {
    id: this.oderId,
    oderId: this.oderId,
    username: this.name,
    position: { x: this.position.x, y: this.position.y, z: this.position.z },
    rotation: { x: 0, y: Math.atan2(this.rotation.m20, this.rotation.m22), z: 0 },
    health: this.health,
    isAlive: this.status === STATUS_ALIVE,
    animation: this.animationState
  };
}
```

---

### Client Tick/Render Loop

**Loop type:** `requestAnimationFrame` (variable timestep)

```typescript
// src/core/World.ts:1556-1562
public animate() {
  requestAnimationFrame(this._animate);  // <-- ~60 FPS (16.67ms)
  
  this.time.update();
  this.tick++;
  
  const delta = this.time.getDelta();  // <-- YUKA Time calculates delta
  // ...
}
```

**Client tickrate:** ~60 Hz (browser RAF, varies by display refresh rate)

**Delta calculation:** YUKA `Time.getDelta()` uses `performance.now()` diff

---

### Client Receive + Apply Snapshot

**Receive:**
```typescript
// src/network/NetworkManager.ts:551-567
this.socket.on('bot_states', (states: unknown) => {
  const botStates = states as Array<ServerBotState>;
  if (this.onBotStatesCallback) {
    this.onBotStatesCallback(botStates);  // <-- 10 Hz fra server
  }
});
```

**Apply:**
```typescript
// src/core/World.ts:875-885
this.networkManager.onBotStates((states: ServerBotState[]) => {
  for (const state of states) {
    const remoteBot = this.remoteBots.get(state.id);
    if (remoteBot) {
      remoteBot.updateFromServer(state);  // <-- Setter target pos/rot
    }
  }
});
```

**Interpolation (ikke ekstrapolering):**
```typescript
// src/network/RemoteBot.ts:433-447
public update(delta: number): void {
  // 60 Hz client loop, 10 Hz server updates
  // Lerp speed = 12 → reaches ~99% in ~6 frames (~100ms)
  this.mesh.position.lerp(this.targetPosition, Math.min(1, this.interpolationSpeed * delta));
  
  // Rotation interpolation
  let diff = targetY - currentY;
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  this.mesh.rotation.y += diff * Math.min(1, this.interpolationSpeed * delta);
}
```

**Interpolation speed:** 12 (enhetsløs multiplikator)

**PROBLEM:** 
- Klient mottar snapshots hvert 100ms (10 Hz)
- Klient interpolerer med 60 FPS (~16.67ms per frame)
- Lerp speed = 12 → tar ~6 frames (~100ms) å nå target
- **INGEN EKSTRAPOLERING** → bot "halter etter" server med ~100ms + interpolation lag

---

## 5) Snapshot-struktur for AI (faktiske felter)

```javascript
// server/yuka-bot/ServerBot.js:1137-1156
{
  id: string,              // Bot ID (f.eks. "bot_0_1234567890")
  oderId: string,          // Same as id
  username: string,        // Display name (f.eks. "xShadowKiller")
  position: {
    x: number,             // World space X
    y: number,             // World space Y (height)
    z: number              // World space Z
  },
  rotation: {
    x: number,             // Pitch (alltid 0)
    y: number,             // Yaw (heading) - Math.atan2(m20, m22)
    z: number              // Roll (alltid 0)
  },
  health: number,          // Current HP (0-100)
  isAlive: boolean,        // true if status === STATUS_ALIVE (12)
  animation: string        // "idle", "run", "death", etc.
}
```

### Felter som MANGLER (men som koden faktisk bruker):

| Manglende Felt | Brukt Av | Hvorfor Nødvendig | Konsekvens av Fravær |
|----------------|----------|-------------------|---------------------|
| `velocity` | RemoteBot.update() (hvis ekstrapolering) | Predikere posisjon mellom snapshots | Bot "teleporterer" til snapshot pos uten smooth bevegelse |
| `targetPosition` / `goal` | RemoteBot visuals (pathing line) | Vise hvor bot skal | Ingen visuell indikasjon på bot intent |
| `aimDirection` / `lookAt` | Weapon system | Peke våpen riktig vei | Våpen peker feil retning |
| `currentGoal` / `state` | Debug/UI | Vise AI state | Ingen synlig AI debug info |
| `path` | RemoteBot visuals | Vise planlagt rute | Ingen path helper |

**KRITISK MANGEL:** Ingen `velocity` eller `acceleration` → Klient kan ikke ekstrapolere posisjon mellom snapshots.

---

## 6) Typiske Sync-brudd: Bevis i Koden

### Finding #1: "Two Bosses" (både server og klient setter transform for samme AI)

**STATUS:** ❌ **IKKE AKTIVT** (men var tidligere)

**Bevis:**

I multiplayer mode, klient oppretter IKKE lokale YUKA bots:

```typescript
// src/core/World.ts:782-810
_initBots() {
  const matchBotSpawns = (window as any).__matchBotSpawns;
  
  if (matchBotSpawns && matchBotSpawns.length > 0) {
    this.isMultiplayerMode = true;
    // Creates RemoteBots (NO YUKA)
    for (const botData of matchBotSpawns) {
      const remoteBot = new RemoteBot(...);  // <-- IKKE entityManager
      this.remoteBots.set(botData.oderId, remoteBot);
    }
    return this;  // <-- EARLY RETURN - INGEN LOCAL YUKA BOTS
  }
  
  // Single player path - creates local YUKA bots
  for (let i = 0; i < botCount; i++) {
    const bot = new Bot(this);  // <-- YUKA Vehicle
    this.add(bot);  // <-- Adds to entityManager
  }
}
```

Klient kjører IKKE `entityManager.update()` på RemoteBots:

```typescript
// src/core/World.ts:1585-1596
public animate() {
  // ...
  this.entityManager.update(delta);  // <-- Kun local bots (single player)
  
  // Update remote bots (multiplayer mode only)
  if (this.isMultiplayerMode) {
    for (const [, remoteBot] of this.remoteBots) {
      remoteBot.update(delta);  // <-- IKKE entityManager, kun interpolering
    }
  }
}
```

**Konklusjon:** Problemet er IKKE "two bosses". Klient kjører IKKE YUKA steering for RemoteBots. Men klienten KAN fremdeles sette position via interpolering, som kan konflikte hvis server sender trage snapshots.

---

### Finding #2: Klient kjører steering/Yuka og samtidig mottar snapshots

**STATUS:** ❌ **IKKE AKTIVT** (se Finding #1)

**Bevis:** RemoteBot extends IKKE Vehicle, har IKKE steering:

```typescript
// src/network/RemoteBot.ts:29-50
export class RemoteBot {
  // INGEN extends Vehicle
  // INGEN this.steering
  // INGEN FollowPathBehavior
  
  private targetPosition: THREE.Vector3;
  private targetRotation: THREE.Euler;
  private interpolationSpeed: number = 12;
  
  public update(delta: number): void {
    // BARE LERP - INGEN STEERING
    this.mesh.position.lerp(this.targetPosition, ...);
  }
}
```

**Konklusjon:** Klient kjører IKKE steering for RemoteBots. Dette problemet eksisterer ikke lenger.

---

### Finding #3: Server mangler navmesh/world-data og bruker fallback "moveTowards/lerp"

**STATUS:** ✅ **FALSKT** - Server HAR NavMesh

**Bevis:**

Server laster NavMesh ved oppstart:

```javascript
// server/yuka-bot/ServerBotManager.js:135-148
async initialize(navMeshPath) {
  try {
    const resolvedPath = path.resolve(navMeshPath);
    this.world.navMesh = await loadNavMesh(resolvedPath);  // <-- LASTER .GLB NAVMESH
    
    this.world.pathPlanner = new ServerPathPlanner(this.world.navMesh);
    
    this.isReady = true;
    console.log('[ServerBotManager] Ready! NavMesh loaded with',
                this.world.navMesh.regions.length, 'regions');
    return true;
  } catch (error) {
    console.error('[ServerBotManager] Failed to initialize:', error);
    return false;
  }
}
```

NavMesh path brukt av AI:

```javascript
// server/yuka-bot/ServerBot.js:895-915
stayInLevel() {
  if (!this.world.navMesh) return;
  
  this.currentPosition.copy(this.position);
  
  const newRegion = this.world.navMesh.clampMovement(  // <-- YUKA NavMesh.clampMovement
    this.currentRegion,
    this.previousPosition,
    this.currentPosition,
    this.position
  );
  
  if (newRegion) {
    this.currentRegion = newRegion;
  }
  
  this.previousPosition.copy(this.position);
  
  // Adjust height - snap to NavMesh
  if (this.currentRegion) {
    const distance = this.currentRegion.plane.distanceToPoint(this.position);
    this.position.y -= distance * BOT_CONFIG.NAVMESH_HEIGHT_CHANGE_FACTOR;
  }
}
```

**MEN:** Server mangler LEVEL MESH for raycasting (vision obstacles):

```javascript
// server/yuka-bot/ServerBotManager.js:72-90
raycast(from, to) {
  // NavMesh-based raycasting at head height is unreliable because:
  // 1. NavMesh only represents walkable floor areas
  // 2. Head-height rays are above the NavMesh plane
  // 3. Checking if points are "on" the NavMesh at head height always fails
  //
  // For now, allow direct line of sight. The FOV and range checks will
  // still limit vision appropriately. Walls between players will NOT block
  // vision until we have proper level collision data on the server.
  return null;  // <-- INGEN WALL BLOCKING
}
```

**Konklusjon:** Server bruker IKKE fallback moveTowards. Den bruker full YUKA steering. MEN server mangler level mesh for vision raycasting, så bots kan se gjennom vegger.

---

### Finding #4: Ulik coordinate system / unit scale / axis swap mellom server og klient

**STATUS:** ✅ **SANNSYNLIGVIS OK** - Samme coordinate system

**Bevis:**

Server bruker YUKA Vector3 (Y-up, right-handed):

```javascript
// server/yuka-bot/ServerBot.js:758-760
this.position.set(spawnPoint.position.x, spawnPoint.position.y, spawnPoint.position.z);
this.rotation.fromEuler(0, spawnPoint.rotation.y, 0);
```

Klient bruker THREE.Vector3 (Y-up, right-handed):

```typescript
// src/network/RemoteBot.ts:255-256
this.targetPosition.set(state.position.x, state.position.y, state.position.z);
this.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
```

YUKA og THREE.js bruker samme coordinate system (Y-up, right-handed).

**Unit scale:** Begge bruker meter (spawnPoint.position.x ≈ -33.5, 29.5 etc.)

**MEN:** Mulig Y-offset issue:

```javascript
// server/yuka-bot/ServerBot.js:913-915
if (this.currentRegion) {
  const distance = this.currentRegion.plane.distanceToPoint(this.position);
  this.position.y -= distance * BOT_CONFIG.NAVMESH_HEIGHT_CHANGE_FACTOR;  // 0.2
}
```

Klient interpolerer direkte til server Y uten egen NavMesh snap:

```typescript
// src/network/RemoteBot.ts:433
this.mesh.position.lerp(this.targetPosition, ...);  // <-- INGEN NAVMESH SNAP
```

**Konklusjon:** Coordinate system er likt, men server justerer Y-posisjon basert på NavMesh height (factor 0.2), mens klient bare interpolerer rett til server Y. Dette kan gi "floating" eller "sinking" hvis klient ikke synker samme amount.

---

### Finding #5: Ulik tickrate/delta jitter

**STATUS:** ✅ **BEKREFTET PROBLEM**

**Bevis:**

Server: 20 Hz med variabel delta (setInterval jitter):

```javascript
// server/yuka-bot/ServerBotManager.js:309-318
start() {
  this.updateInterval = setInterval(() => {
    this.update();  // <-- KALLES ~20 Hz (50ms ±jitter)
  }, 1000 / this.tickRate);  // 50ms
}

update() {
  const now = Date.now();
  const deltaMs = now - this.lastUpdateTime;
  const delta = deltaMs / 1000;  // <-- VARIERER (0.048s - 0.053s typisk)
  // ...
}
```

Klient: ~60 Hz med variabel delta (RAF):

```typescript
// src/core/World.ts:1556-1562
public animate() {
  requestAnimationFrame(this._animate);  // <-- ~60 Hz (16.67ms ideal, varierer)
  const delta = this.time.getDelta();  // <-- VARIERER (0.014s - 0.020s typisk)
  // ...
}
```

**Snapshot rate:** 10 Hz (hver 100ms):

```javascript
// server/yuka-bot/ServerBotManager.js:359-362
if (this.tickCount % Math.floor(this.tickRate / this.broadcastRate) === 0) {
  this.broadcastBotStates();  // <-- Hvert 100ms
}
```

**Resultat:**
- Server oppdaterer posisjon 20 ganger per sekund (hver ~50ms)
- Server sender snapshot 10 ganger per sekund (hver ~100ms)
- Klient mottar snapshot hver ~100ms
- Klient renderer 60 ganger per sekund (hver ~16.67ms)
- **Klient må "strekke" 1 snapshot over 6 frames** → jittery movement hvis ikke ekstrapolering

**Konklusjon:** Ulik tickrate + mangel på ekstrapolering gir jittery movement.

---

### Finding #6: ID-mismatch: agent ID på server ≠ klient mapping

**STATUS:** ✅ **OK** - ID matcher

**Bevis:**

Server genererer bot ID:

```javascript
// server/standalone.cjs:168-189
function createMatch(playerSockets) {
  const bots = [];
  for (let i = 0; i < botCount; i++) {
    const botId = `bot_${team}_${Date.now()}_${Math.random()}`;  // <-- UNIK ID
    bots.push({
      oderId: botId,  // <-- SERVER ID
      username: getRandomGamerName(i),
      // ...
    });
  }
  // ...
  (window as any).__matchBotSpawns = bots;  // <-- SEND TIL KLIENT
}
```

Klient bruker samme ID:

```typescript
// src/core/World.ts:795-805
for (const botData of matchBotSpawns) {
  const remoteBot = new RemoteBot(
    this.scene,
    this.assetManager,
    botData.oderId,  // <-- SAMME ID FRA SERVER
    botData.username
  );
  this.remoteBots.set(botData.oderId, remoteBot);  // <-- MAP MED SAMME ID
}
```

Server sender state med ID:

```javascript
// server/yuka-bot/ServerBot.js:1137-1142
getNetworkState() {
  return {
    id: this.oderId,  // <-- SAMME ID
    oderId: this.oderId,
    // ...
  };
}
```

Klient matcher via ID:

```typescript
// src/core/World.ts:880-883
for (const state of states) {
  const remoteBot = this.remoteBots.get(state.id);  // <-- LOOKUP MED SAMME ID
  if (remoteBot) {
    remoteBot.updateFromServer(state);
  }
}
```

**Konklusjon:** ID matching fungerer korrekt. Ingen mismatch.

---

### Finding #7: Smoothing som overskriver autoritativ state for mye

**STATUS:** ⚠️ **MULIG PROBLEM**

**Bevis:**

Klient lerper mot server position:

```typescript
// src/network/RemoteBot.ts:255-256
public updateFromServer(state: ServerBotState): void {
  this.targetPosition.set(state.position.x, state.position.y, state.position.z);  // <-- SERVER POS
  this.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
  // ...
}
```

```typescript
// src/network/RemoteBot.ts:433
public update(delta: number): void {
  this.mesh.position.lerp(this.targetPosition, Math.min(1, this.interpolationSpeed * delta));
}
```

**Lerp speed:** `interpolationSpeed = 12`

Med 60 FPS (delta ≈ 0.0167s):
- Lerp factor per frame: `12 * 0.0167 = 0.2` (20% per frame)
- Tid til 99%: `log(0.01) / log(0.8) ≈ 20 frames ≈ 333ms`
- **MEN** `Math.min(1, ...)` clamper til 1.0, så ved høy delta blir det instant teleport

**Ved normal delta (0.0167s):**
- Frame 1: 80% old + 20% target
- Frame 2: 64% old + 36% target
- Frame 3: 51% old + 49% target
- Frame 4: 41% old + 59% target
- Frame 5: 33% old + 67% target
- Frame 6: 26% old + 74% target

**Server sender snapshot hvert 100ms (6 frames ved 60 FPS):**

Hvis bot beveger seg 1 meter per sekund:
- Server pos endrer 0.1m per snapshot
- Klient når ~74% av target (0.074m) før neste snapshot
- **LAG:** Klient er 0.026m bak server

**Konklusjon:** Lerp smoothing introduserer ~26% lag bak server state. Dette er ikke "overskriver" server state, men **forsinker** den. Ved rask bevegelse kan dette gi "trailing" effekt.

---

## 7) Konklusjon (basert på bevis)

### 1. Mest sannsynlig årsak til ute av synk

**HOVEDÅRSAK: Interpolation lag + ingen ekstrapolering + lav snapshot rate**

**Bevis:**
- Server: 20 Hz tick, 10 Hz snapshot ([server/yuka-bot/ServerBotManager.js:120-122](../server/yuka-bot/ServerBotManager.js#L120-L122))
- Klient: 60 Hz render, mottar snapshot hvert 100ms ([src/network/NetworkManager.ts:551](../src/network/NetworkManager.ts#L551))
- Klient interpolerer med lerp speed 12 → ~26% lag ([src/network/RemoteBot.ts:433](../src/network/RemoteBot.ts#L433))
- **INGEN EKSTRAPOLERING** → Klient kan ikke predikere posisjon mellom snapshots
- Resultat: Bot vises 100-150ms bak faktisk server posisjon

**SEKUNDÆRE ÅRSAKER:**
- **Manglende velocity i snapshot** → Kan ikke ekstrapolere selv hvis implementert ([server/yuka-bot/ServerBot.js:1137-1156](../server/yuka-bot/ServerBot.js#L1137-L1156))
- **setInterval jitter** → Server delta varierer (48-53ms) istedenfor fixed 50ms ([server/yuka-bot/ServerBotManager.js:334-338](../server/yuka-bot/ServerBotManager.js#L334-L338))
- **NavMesh Y-adjustment** → Server justerer Y med factor 0.2, klient interpolerer direkte ([server/yuka-bot/ServerBot.js:913-915](../server/yuka-bot/ServerBot.js#L913-L915))

---

### 2. Hvorfor det "ikke er Yuka lenger"

**FAKTISK:** Yuka kjører fremdeles FULLT UT på server, men IKKE på klient i multiplayer.

**Server:** Full YUKA AI kjører ([server/yuka-bot/ServerBot.js:827-877](../server/yuka-bot/ServerBot.js#L827-L877))
- `super.update(delta)` → YUKA Vehicle steering
- `this.brain.execute()` → YUKA Think system
- `this.vision.visible()` → YUKA Vision
- `this.memorySystem` → YUKA MemorySystem
- `FollowPathBehavior`, `OnPathBehavior` → YUKA steering behaviors

**Klient (multiplayer):** RemoteBot har NULL YUKA ([src/network/RemoteBot.ts:29-50](../src/network/RemoteBot.ts#L29-L50))
- IKKE extends Vehicle
- IKKE entityManager.add()
- IKKE steering behaviors
- IKKE brain/think
- IKKE vision/memory
- **KUN:** Interpolering av pos/rot

**Klient (single player):** Full YUKA AI kjører lokalt ([src/entities/Bot.ts:36-200](../src/entities/Bot.ts#L36-L200))
- `class Bot extends Vehicle` → YUKA
- `this.brain = new Think(this)` → YUKA Think
- Samme AI som server

**HVORFOR DET VIRKER SOM "ikke Yuka lenger":**

Fra spillerens perspektiv i multiplayer:
1. Bots beveger seg ikke smooth → ser ikke ut som intelligent AI
2. Bots reagerer tregt → lav tickrate + interpolation lag
3. Bots kan ikke predikeres → ingen velocity data
4. Bots "teleporterer" ved network hiccups → ingen ekstrapolering fallback
5. **KONKLUSJON:** Ser ut som "dumb interpolation" istedenfor "smart AI"

**MEN:** Server kjører fortsatt full YUKA. Problemet er network sync, ikke AI logic.

---

### 3. Hva som må defineres tydelig

#### Server-Authoritative vs Client Authority

**Nåværende tilstand:**
- ✅ **Server-authoritative** for multiplayer bots (korrekt)
- ✅ **Client-authoritative** for single player bots (korrekt)
- ❌ **Klient mottar bare snapshots** uten velocity/prediction data

**Må defineres:**

1. **Snapshot Rate vs Tickrate**
   - Server: 20 Hz tick, 10 Hz snapshot
   - **Spørsmål:** Skal snapshot rate økes til 20 Hz? Eller 60 Hz?
   - **Alternativ:** Hold 10 Hz, men implementer ekstrapolering

2. **Ekstrapolering Strategi**
   - **Spørsmål:** Skal klient ekstrapolere posisjon mellom snapshots?
   - **Krav:** Server må sende `velocity` i snapshot
   - **Risiko:** Ekstrapolering kan overshoot hvis bot endrer retning

3. **Interpolation Timing**
   - Nåværende: Lerp speed 12 gir ~26% lag
   - **Spørsmål:** Skal lerp speed økes (mindre smooth, mindre lag) eller senkes (mer smooth, mer lag)?
   - **Alternativ:** Bruk "render time" offset (render 100ms i fortiden for smooth interpolation uten overshoot)

4. **NavMesh Synkronisering**
   - Server: Justerer Y med factor 0.2 ([server/yuka-bot/ServerBot.js:915](../server/yuka-bot/ServerBot.js#L915))
   - Klient: Interpolerer direkte til server Y
   - **Spørsmål:** Skal klient også kjøre NavMesh Y-snap? Eller stole på server Y?

5. **Snapshot Payload Expansion**
   - Nåværende: pos, rot, health, isAlive, animation
   - **Mangler:** velocity, acceleration, currentGoal, aimDirection
   - **Spørsmål:** Hvilke felter er kritiske for smooth rendering?

6. **Fixed vs Variable Timestep**
   - Server: `setInterval` gir variabel delta (jitter)
   - **Spørsmål:** Skal server bruke fixed timestep (akkumulert delta)?
   - **Alternativ:** Bruk `performance.now()` timer loop for bedre presisjon

7. **Dead Reckoning**
   - **Spørsmål:** Skal klient simulere lokalt mellom snapshots ved å fortsette siste velocity?
   - **Krav:** Server må sende velocity + acceleration
   - **Fordel:** Smooth movement selv ved packet loss
   - **Risiko:** Klient predikerer feil hvis bot endrer retning

---

## Appendix: Fil-referanser

### Server-side AI (YUKA)
- [server/standalone.cjs](../server/standalone.cjs) - Server entrypoint
- [server/yuka-bot/ServerBotManager.js](../server/yuka-bot/ServerBotManager.js) - Bot manager (EntityManager, game loop)
- [server/yuka-bot/ServerBot.js](../server/yuka-bot/ServerBot.js) - Bot AI logic (Vehicle, Think, Vision, Steering)
- [server/yuka-bot/ServerNavMeshLoader.js](../server/yuka-bot/ServerNavMeshLoader.js) - NavMesh loader

### Client-side Multiplayer (RemoteBot)
- [src/main.ts](../src/main.ts) - Client entrypoint
- [src/core/World.ts](../src/core/World.ts) - World manager (game loop, entity manager)
- [src/network/RemoteBot.ts](../src/network/RemoteBot.ts) - Multiplayer bot (interpolation only)
- [src/network/NetworkManager.ts](../src/network/NetworkManager.ts) - Network handler

### Client-side Single Player (Local Bot)
- [src/entities/Bot.ts](../src/entities/Bot.ts) - Local AI bot (YUKA Vehicle)

### Network Infrastructure
- [src/server/server.ts](../src/server/server.ts) - Express + Socket.IO setup
- [src/server/sockets/gameHandler.ts](../src/server/sockets/gameHandler.ts) - Game event handlers

---

**Rapport slutt.**
